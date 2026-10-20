import contextlib
import copy
import importlib.util
import io
import json
import plistlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[2] / 'scripts/testflight/release.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def manifest():
    return dict(schema=1, target=r.TARGET.copy(), sha='a' * 40, version='0.1',
                build='2026101702', state='archived', upload='not_attempted')


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.path = self.directory / 'manifest.json'
        self.m = manifest()
        self.profiles = dict(r.PROFILES, ZineWidgetExtension='11111111-2222-3333-4444-555555555555')
        self.ipa = self.directory / 'Zine.ipa'
        self.ipa.write_bytes(b'fixture signed bytes')
        self.m.update(ipa=str(self.ipa), ipa_sha256=r.hashlib.sha256(self.ipa.read_bytes()).hexdigest())
        r.save(self.path, self.m)

    def test_manifest_roundtrip_and_target_guards(self):
        self.assertEqual(r.load(self.path), self.m)
        for key in r.TARGET:
            m = copy.deepcopy(self.m)
            m['target'][key] = 'another-target'
            r.save(self.path, m)
            with self.assertRaises(r.ReleaseError):
                r.load(self.path)

    def test_lock_is_exclusive_and_released_after_failure(self):
        with self.assertRaisesRegex(RuntimeError, 'fixture'):
            with r.locked(self.directory):
                with self.assertRaisesRegex(r.ReleaseError, 'Another'):
                    with r.locked(self.directory):
                        self.fail('second writer entered')
                raise RuntimeError('fixture')
        with r.locked(self.directory):
            pass

    def test_plan_offline_never_calls_apple_or_mutates(self):
        with patch.object(r, 'source_sha', return_value='a' * 40), patch.object(r, 'git', return_value='MARKETING_VERSION = 0.1;'), patch.object(r, 'bridge') as remote:
            before = list(self.directory.iterdir())
            p = r.plan(fetch=False, online=False)
            self.assertEqual(p['sha'], 'a' * 40)
            self.assertIsNone(p['build'])
            remote.assert_not_called()
            self.assertEqual(before, list(self.directory.iterdir()))

    def test_build_allocation_above_accepted_legacy(self):
        now = r.dt.datetime(2026, 10, 17, tzinfo=r.dt.timezone.utc)
        self.assertEqual(r.build_number([], now), '2026101701')
        self.assertEqual(r.build_number([{'attributes': {'version': '2026101701'}}], now), '2026101702')

    def test_upload_intent_is_durable_before_mutation(self):
        def interrupted(action, **kwargs):
            self.assertEqual(action, 'upload')
            self.assertEqual(r.load(self.path)['upload'], 'intent_recorded')
            raise r.ReleaseError('transport interrupted')
        with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=None), patch.object(r, 'bridge', side_effect=interrupted) as external:
            with self.assertRaises(r.ReleaseError):
                r.upload_once(self.path, self.m)
            with self.assertRaisesRegex(r.ReleaseError, 'never automatically'):
                r.upload_once(self.path, r.load(self.path))
            self.assertEqual(external.call_count, 1)

    def test_collision_and_changed_bytes_never_upload(self):
        with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value={'id': 'existing'}), patch.object(r, 'bridge') as external:
            with self.assertRaisesRegex(r.ReleaseError, 'collision'):
                r.upload_once(self.path, self.m)
            external.assert_not_called()
        self.ipa.write_bytes(b'changed')
        with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=None), patch.object(r, 'bridge') as external:
            with self.assertRaisesRegex(r.ReleaseError, 'IPA changed'):
                r.upload_once(self.path, self.m)
            external.assert_not_called()

    def test_observed_ambiguous_upload_is_never_reuploaded(self):
        self.m['upload'] = 'intent_recorded'
        with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value={'id': 'exact'}), patch.object(r, 'bridge') as external:
            r.upload_once(self.path, self.m)
            external.assert_not_called()

    def audience_response(self, path):
        if path == f'/v1/apps/{r.APP}':
            return {'data': {'id': r.APP, 'attributes': {'bundleId': r.BUNDLE}}}
        if path.endswith('/app'):
            return {'data': {'id': r.APP}}
        return {'data': {'id': r.GROUP, 'attributes': {'name': 'Erik Internal', 'isInternalGroup': True,
                         'hasAccessToAllBuilds': False, 'publicLinkEnabled': False}}}

    def test_audience_exact_membership_and_settings(self):
        tester = {'attributes': {'email': 'ejohane@gmail.com'}}
        groups = [self.audience_response(f'/v1/betaGroups/{r.GROUP}')['data']]
        def collection(audience):
            return lambda path: groups if '/betaGroups?' in path else audience
        with patch.object(r, 'get', side_effect=self.audience_response), patch.object(r, 'collection', side_effect=collection([tester])):
            r.guard_audience()
        for audience in [[], [tester, tester], [{'attributes': {'email': 'other@example.com'}}]]:
            with patch.object(r, 'get', side_effect=self.audience_response), patch.object(r, 'collection', side_effect=collection(audience)):
                with self.assertRaisesRegex(r.ReleaseError, 'audience changed'):
                    r.guard_audience()
        for field in ['isInternalGroup', 'hasAccessToAllBuilds', 'publicLinkEnabled']:
            def response(path):
                value = self.audience_response(path)
                if path == f'/v1/betaGroups/{r.GROUP}':
                    value['data']['attributes'][field] = not value['data']['attributes'][field]
                return value
            with patch.object(r, 'get', side_effect=response), patch.object(r, 'collection', side_effect=collection([tester])):
                with self.assertRaises(r.ReleaseError):
                    r.guard_audience()

    def row(self, state='VALID'):
        return {'id': 'exact-build', 'attributes': {'version': self.m['build'], 'processingState': state, 'expired': False}}

    def test_status_is_read_only_and_assign_uses_exact_build(self):
        self.m['upload'] = 'returned'
        with patch.object(r, 'guard_build_groups'), patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=self.row()), patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'READY_FOR_BETA_TESTING'}}}), patch.object(r, 'collection', return_value=[]), patch.object(r, 'bridge') as external:
            self.assertFalse(r.reconcile(self.path, self.m))
            external.assert_not_called()
        with patch.object(r, 'guard_build_groups'), patch.object(r, 'guard_audience') as guard, patch.object(r, 'exact_build', return_value=self.row()), patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'IN_BETA_TESTING'}}}), patch.object(r, 'collection', side_effect=[[], [{'id': 'exact-build'}]]), patch.object(r, 'bridge') as external:
            self.assertTrue(r.reconcile(self.path, self.m, distribute=True))
            external.assert_called_once_with('assign', build_id='exact-build')
            self.assertEqual(guard.call_count, 3)
            self.assertEqual(r.load(self.path)['state'], 'ready')

    def test_processing_compliance_failed_and_absent_never_assign(self):
        self.m['upload'] = 'returned'
        for state in ['PROCESSING', 'FAILED', 'INVALID', None, 'MISSING_COMPLIANCE']:
            row = None if state is None else self.row('VALID' if state == 'MISSING_COMPLIANCE' else state)
            with patch.object(r, 'guard_build_groups'), patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=row), patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'MISSING_EXPORT_COMPLIANCE'}}}), patch.object(r, 'bridge') as external:
                try:
                    self.assertFalse(r.reconcile(self.path, self.m, distribute=True))
                except r.ReleaseError:
                    self.assertIn(state, ['FAILED', 'INVALID', 'MISSING_COMPLIANCE'])
                external.assert_not_called()

    def test_assignment_uncertainty_recovers_by_readback(self):
        self.m['upload'] = 'observed'
        with patch.object(r, 'guard_build_groups'), patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=self.row()), patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'IN_BETA_TESTING'}}}), patch.object(r, 'collection', return_value=[{'id': 'exact-build'}]), patch.object(r, 'bridge') as external:
            self.assertTrue(r.reconcile(self.path, self.m, distribute=True))
            external.assert_not_called()

    def test_exact_build_rejects_wrong_version_app_and_id(self):
        for bad in ('version', 'app', 'id', 'platform', 'multiple'):
            m = copy.deepcopy(self.m)
            if bad == 'id':
                m['asc_build_id'] = 'other'
            def response(path):
                if path.endswith('/app'):
                    return {'data': {'id': 'wrong' if bad == 'app' else r.APP}}
                return {'data': {'attributes': {'version': '9' if bad == 'version' else '0.1',
                                                'platform': 'MAC_OS' if bad == 'platform' else 'IOS'}}}
            rows = [self.row()] * (2 if bad == 'multiple' else 1)
            with patch.object(r, 'collection', return_value=rows), patch.object(r, 'get', side_effect=response):
                with self.assertRaises(r.ReleaseError):
                    r.exact_build(m)

    def test_missing_prerequisite_prevents_all_publish_mutation(self):
        with patch.object(r, 'STATE', self.directory), patch.object(r, 'locked', return_value=contextlib.nullcontext()), patch.object(r, 'doctor', side_effect=r.ReleaseError('missing key')), patch.object(r, 'archive') as archive, patch.object(r, 'bridge') as external:
            with self.assertRaises(r.ReleaseError):
                r.publish('a' * 40, 'review')
            archive.assert_not_called()
            external.assert_not_called()

    def test_reviewed_sha_must_match_before_archive_or_upload(self):
        planned = dict(manifest(), warning='fixture')
        with patch.object(r, 'STATE', self.directory), patch.object(r, 'locked', return_value=contextlib.nullcontext()), patch.object(r, 'doctor'), patch.object(r, 'plan', return_value=planned), patch.object(r, 'archive') as archive, patch.object(r, 'bridge') as external:
            with self.assertRaisesRegex(r.ReleaseError, 'Review must identify'):
                r.publish('b' * 40, 'review')
            archive.assert_not_called()
            external.assert_not_called()

    def test_changed_audience_prevents_upload_and_assignment(self):
        with patch.object(r, 'guard_audience', side_effect=r.ReleaseError('audience changed')), patch.object(r, 'bridge') as external:
            with self.assertRaises(r.ReleaseError):
                r.upload_once(self.path, self.m)
            with self.assertRaises(r.ReleaseError):
                r.reconcile(self.path, self.m, distribute=True)
            external.assert_not_called()
            self.assertEqual(r.load(self.path)['upload'], 'not_attempted')

    def test_manual_profile_guards_reuse_existing_identity(self):
        profile = {'UUID': r.PROFILES['ZineNative'], 'TeamIdentifier': [r.TEAM],
                   'ExpirationDate': r.dt.datetime(2099, 1, 1),
                   'DeveloperCertificates': [b'fixture certificate'],
                   'Entitlements': {'application-identifier': r.TEAM + '.' + r.BUNDLE,
                                    'get-task-allow': False, 'aps-environment': 'production',
                                    'com.apple.security.application-groups': [r.APP_GROUP],
                                    'com.apple.developer.applesignin': ['Default'],
                                    'com.apple.developer.associated-domains': ['*'],
                                    'keychain-access-groups': [r.TEAM + '.*', 'com.apple.token']}}
        with patch.object(r, 'CERT', r.hashlib.sha1(b'fixture certificate').hexdigest().upper()):
            r.profile_check(profile, r.BUNDLE, r.PROFILES['ZineNative'])
            for key, value in [('UUID', 'other'), ('TeamIdentifier', ['OTHER']),
                               ('ExpirationDate', r.dt.datetime(2000, 1, 1)),
                               ('DeveloperCertificates', [b'other cert']), ('ProvisionedDevices', ['device'])]:
                changed = copy.deepcopy(profile)
                changed[key] = value
                with self.assertRaises(r.ReleaseError):
                    r.profile_check(changed, r.BUNDLE, r.PROFILES['ZineNative'])

    def test_status_cannot_adopt_a_build_without_upload_intent(self):
        with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=self.row()), patch.object(r, 'bridge') as external:
            with self.assertRaisesRegex(r.ReleaseError, 'cannot adopt'):
                r.reconcile(self.path, self.m)
            self.assertEqual(r.load(self.path)['upload'], 'not_attempted')
            with self.assertRaisesRegex(r.ReleaseError, 'collision'):
                r.upload_once(self.path, r.load(self.path))
            external.assert_not_called()

    def test_other_automatic_groups_prevent_upload(self):
        approved = self.audience_response(f'/v1/betaGroups/{r.GROUP}')['data']
        for automatic in (True, None):
            other = {'id': 'other-group', 'attributes': {'hasAccessToAllBuilds': automatic}}
            def collection(path):
                if '/betaGroups?' in path:
                    return [approved, other]
                return [{'attributes': {'email': 'ejohane@gmail.com'}}]
            with patch.object(r, 'get', side_effect=self.audience_response), patch.object(r, 'collection', side_effect=collection), patch.object(r, 'bridge') as external:
                with self.assertRaisesRegex(r.ReleaseError, 'automatic or unknown'):
                    r.upload_once(self.path, self.m)
                external.assert_not_called()

    def test_exact_build_group_scope_is_checked_before_assignment(self):
        self.m['upload'] = 'intent_recorded'
        for groups in ([{'id': 'external-group'}], [{'id': r.GROUP}, {'id': 'other-internal'}]):
            with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=self.row()), patch.object(r, 'collection', return_value=groups), patch.object(r, 'bridge') as external:
                with self.assertRaisesRegex(r.ReleaseError, 'unexpected testing groups'):
                    r.reconcile(self.path, self.m, distribute=True)
                external.assert_not_called()
        with patch.object(r, 'collection', return_value=[{'id': r.GROUP}]):
            r.guard_build_groups('exact-build')

    def test_resume_archived_release_cannot_bypass_another_ambiguous_upload(self):
        other = self.directory / 'other'
        other.mkdir()
        ambiguous = manifest()
        ambiguous.update(upload='intent_recorded', state='awaiting_apple', build='2026101703')
        r.save(other / 'manifest.json', ambiguous)
        with patch.object(r, 'STATE', self.directory), patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=None), patch.object(r, 'bridge') as external:
            with self.assertRaisesRegex(r.ReleaseError, 'Unresolved release'):
                r.upload_once(self.path, self.m)
            external.assert_not_called()
            self.assertEqual(r.load(self.path)['upload'], 'not_attempted')

    def test_local_subprocesses_get_no_release_credentials_or_ambient_fastlane_options(self):
        env = {'PATH': '/fixture/bin', 'ZINE_ASC_KEY_FILE': '/fixture/private.p8',
               'ZINE_ASC_KEY_ID': 'FIXTURE', 'PILOT_CHANGELOG': 'surprise metadata',
               'FASTLANE_ITUNES_TRANSPORTER_USE_SHELL_SCRIPT': '1',
               'FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD': 'fixture-password'}
        with patch.dict(r.os.environ, env, clear=True), patch.object(r.subprocess, 'run', return_value=type('Result', (), {'returncode': 0, 'stdout': b'ok'})()) as child:
            r.run(['xcodebuild', '-version'])
            actual = child.call_args.kwargs['env']
            self.assertEqual(actual, {'PATH': '/fixture/bin'})

    def test_authenticated_bridge_keeps_only_explicit_auth_and_uses_neutral_cwd(self):
        env = {'PATH': '/fixture/bin', 'ZINE_ASC_KEY_ID': 'FIXTURE',
               'ZINE_ASC_KEY_FILE': '/fixture/private.p8', 'ZINE_ASC_UNEXPECTED': 'discard',
               'PILOT_CHANGELOG': 'surprise metadata', 'FASTLANE_ITUNES_TRANSPORTER_USE_SHELL_SCRIPT': '1'}
        with patch.dict(r.os.environ, env, clear=True), patch.object(r, 'validate_credentials'), patch.object(r.subprocess, 'run', return_value=type('Result', (), {'returncode': 0, 'stdout': b'{}'})()) as child:
            r.bridge('get', path='/v1/apps/' + r.APP)
            actual = child.call_args.kwargs['env']
            self.assertEqual(actual['ZINE_ASC_KEY_ID'], 'FIXTURE')
            self.assertNotIn('ZINE_ASC_UNEXPECTED', actual)
            self.assertNotIn('PILOT_CHANGELOG', actual)
            self.assertNotIn('FASTLANE_ITUNES_TRANSPORTER_USE_SHELL_SCRIPT', actual)
            self.assertNotEqual(Path(child.call_args.kwargs['cwd']), r.ROOT)

    def test_online_plan_has_no_release_mutations(self):
        with patch.object(r, 'source_sha', return_value='a' * 40), patch.object(r, 'git', return_value='MARKETING_VERSION = 0.1;'), patch.object(r, 'builds', return_value=[]), patch.object(r, 'save') as save, patch.object(r, 'archive') as archive, patch.object(r, 'bridge') as bridge:
            planned = r.plan()
            self.assertTrue(planned['build'].isdigit())
            save.assert_not_called()
            archive.assert_not_called()
            bridge.assert_not_called()

    def test_archive_rejects_project_changes_beyond_prepared_signing(self):
        source = self.directory / 'source'
        project = source / r.PROJECT
        project.mkdir(parents=True)
        project_file = project / 'project.pbxproj'
        project_file.write_text('prepared project')
        def build(*args, **kwargs):
            project_file.write_text('unexpected project edit during build')
            return b''
        with patch.object(r, 'signing_profiles', return_value=self.profiles), patch.object(r, 'git', side_effect=['', self.m['sha']]), patch.object(r, 'project_info', return_value='0.1'), patch.object(r, 'bridge'), patch.object(r, 'run', side_effect=build), patch.object(r, 'export_archive') as export:
            with self.assertRaisesRegex(r.ReleaseError, 'Prepared project changed'):
                r.archive(self.directory, self.m)
            export.assert_not_called()

    def test_signing_profiles_require_explicit_widget_store_profile(self):
        with patch.dict(r.os.environ, {}, clear=True):
            with self.assertRaisesRegex(r.ReleaseError, 'ZINE_TF_WIDGET_PROFILE_UUID'):
                r.signing_profiles()
        with patch.dict(r.os.environ, {'ZINE_TF_WIDGET_PROFILE_UUID': self.profiles['ZineWidgetExtension'],
                                     'ZINE_TF_APP_PROFILE_UUID': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}, clear=True):
            profiles = r.signing_profiles()
            self.assertEqual(profiles['ZineNative'], 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
            self.assertEqual(profiles['ZineWidgetExtension'], self.profiles['ZineWidgetExtension'])
            self.assertEqual(profiles['ZineShareExtension'], r.PROFILES['ZineShareExtension'])

    def test_project_checks_all_three_targets_and_exact_source_grants(self):
        config = self.directory / 'apps/ios/Configuration'
        config.mkdir(parents=True)
        targets = []
        for name, bundle in r.BUNDLES.items():
            (config / (name + '.entitlements')).write_bytes(plistlib.dumps(r.source_entitlements(bundle)))
            targets.append(dict(name=name, settings=dict(PRODUCT_BUNDLE_IDENTIFIER=bundle,
                DEVELOPMENT_TEAM=r.TEAM, CODE_SIGN_ENTITLEMENTS='Configuration/' + name + '.entitlements',
                MARKETING_VERSION='0.1')))
        with patch.object(r, 'bridge', return_value=targets):
            self.assertEqual(r.project_info(self.directory), '0.1')
            for name, bundle in r.BUNDLES.items():
                path = config / (name + '.entitlements')
                ent = r.source_entitlements(bundle)
                ent['unreviewed-capability'] = True
                path.write_bytes(plistlib.dumps(ent))
                with self.assertRaisesRegex(r.ReleaseError, 'Entitlement grants changed'):
                    r.project_info(self.directory)
                path.write_bytes(plistlib.dumps(r.source_entitlements(bundle)))
        with patch.object(r, 'bridge', return_value=targets[:2]):
            with self.assertRaisesRegex(r.ReleaseError, 'Unexpected release targets'):
                r.project_info(self.directory)

    def test_canonical_app_entitlements_match_reviewed_release_contract(self):
        config = r.ROOT / 'apps/ios/Configuration'
        for name, bundle in r.BUNDLES.items():
            with self.subTest(target=name):
                ent = plistlib.loads((config / (name + '.entitlements')).read_bytes())
                self.assertEqual(ent, r.source_entitlements(bundle))

    def test_widget_profile_requires_distribution_and_exact_app_group(self):
        name = 'ZineWidgetExtension'
        profile = dict(UUID=self.profiles[name], TeamIdentifier=[r.TEAM],
            ExpirationDate=r.dt.datetime(2099, 1, 1), DeveloperCertificates=[b'fixture certificate'],
            Entitlements={'application-identifier': r.TEAM + '.' + r.BUNDLES[name],
                'get-task-allow': False, 'keychain-access-groups': [r.TEAM + '.*', 'com.apple.token'],
                'com.apple.security.application-groups': [r.APP_GROUP]})
        with patch.object(r, 'CERT', r.hashlib.sha1(b'fixture certificate').hexdigest().upper()):
            r.profile_check(profile, r.BUNDLES[name], self.profiles[name])
            for groups in ([], ['group.other'], [r.APP_GROUP, 'group.other']):
                bad = copy.deepcopy(profile)
                bad['Entitlements']['com.apple.security.application-groups'] = groups
                with self.assertRaisesRegex(r.ReleaseError, 'App Group mismatch'):
                    r.profile_check(bad, r.BUNDLES[name], self.profiles[name])
            profile['ProvisionedDevices'] = ['phone']
            with self.assertRaisesRegex(r.ReleaseError, 'App Store profile mismatch'):
                r.profile_check(profile, r.BUNDLES[name], self.profiles[name])

    def test_signed_archive_requires_both_extensions_and_widget_grants(self):
        app = self.directory / 'Zine.app'
        products = {'ZineNative': app, 'ZineShareExtension': app / 'PlugIns/Zine.appex',
                    'ZineWidgetExtension': app / 'PlugIns/Widget.appex'}
        for name, product in products.items():
            product.mkdir(parents=True, exist_ok=True)
            info = dict(CFBundleIdentifier=r.BUNDLES[name], CFBundleVersion=self.m['build'],
                        CFBundleShortVersionString=self.m['version'])
            if name == 'ZineWidgetExtension':
                info['NSExtension'] = dict(NSExtensionPointIdentifier='com.apple.widgetkit-extension')
            else:
                info['ZINEAPIBaseURL'] = 'https://api.myzine.app'
            (product / 'Info.plist').write_bytes(plistlib.dumps(info))
        self.m['profiles'] = self.profiles
        bad_widget = False
        def run(args, **kwargs):
            if args[:3] == ['security', 'cms', '-D']:
                return plistlib.dumps({})
            if '--entitlements' in args:
                name = next(name for name, path in products.items() if path == args[-1])
                bundle = r.BUNDLES[name]
                ent = r.source_entitlements(bundle)
                ent.update({'application-identifier': r.TEAM + '.' + bundle,
                            'com.apple.developer.team-identifier': r.TEAM, 'get-task-allow': False})
                if 'keychain-access-groups' in ent:
                    ent['keychain-access-groups'] = [r.TEAM + '.' + r.BUNDLE]
                if name == 'ZineWidgetExtension' and bad_widget:
                    ent['com.apple.security.application-groups'] = ['group.other']
                return plistlib.dumps(ent)
            for arg in args:
                if str(arg).startswith('--extract-certificates='):
                    Path(str(arg).split('=', 1)[1] + '0').write_bytes(b'fixture certificate')
            return b''
        with patch.object(r, 'run', side_effect=run), patch.object(r, 'profile_check') as profiles, patch.object(r, 'CERT', r.hashlib.sha1(b'fixture certificate').hexdigest().upper()):
            r.verify_app(app, self.m)
            self.assertEqual({call.args[1] for call in profiles.call_args_list}, set(r.BUNDLES.values()))
            bad_widget = True
            with self.assertRaisesRegex(r.ReleaseError, 'Signed capability mismatch'):
                r.verify_app(app, self.m)
            products['ZineWidgetExtension'].rename(app / 'PlugIns/Widget.missing')
            with self.assertRaisesRegex(r.ReleaseError, 'Expected share and widget'):
                r.verify_app(app, self.m)

    def test_uploaded_resume_reconciles_without_local_signing_or_artifacts(self):
        for upload in ('intent_recorded', 'returned', 'observed'):
            for reason in ('profile expired', 'certificate missing', 'checkout project changed'):
                with self.subTest(upload=upload, unavailable=reason):
                    m = manifest()
                    m.update(upload=upload, state='awaiting_apple')
                    # No local IPA/path/hash is required once upload intent exists.
                    r.save(self.path, m)
                    assigned = []
                    def collection(path):
                        if '/builds/exact-build/betaGroups?' in path:
                            return [{'id': r.GROUP}] if assigned else []
                        return [{'id': 'exact-build'}] if assigned else []
                    def external(action, **kwargs):
                        self.assertEqual(action, 'assign', 'Post-upload resume attempted an upload')
                        self.assertEqual(kwargs, {'build_id': 'exact-build'})
                        assigned.append(kwargs['build_id'])
                        return {}
                    with patch.object(r, 'STATE', self.directory), patch.object(r, 'locked', return_value=contextlib.nullcontext()), patch.object(r.sys, 'argv', ['release', 'resume', str(self.path), '--wait', '0']), patch.object(r, 'doctor', side_effect=r.ReleaseError(reason)) as signing, patch.object(r, 'validate_credentials') as auth, patch.object(r, 'guard_audience') as audience, patch.object(r, 'exact_build', return_value=self.row()) as exact, patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'IN_BETA_TESTING'}}}), patch.object(r, 'collection', side_effect=collection), patch.object(r, 'bridge', side_effect=external) as bridge, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                        self.assertEqual(r.main(), 0)
                        signing.assert_not_called()
                        auth.assert_called_once_with()
                        self.assertEqual(audience.call_count, 3)
                        exact.assert_called_once()
                        bridge.assert_called_once_with('assign', build_id='exact-build')
                    ready = r.load(self.path)
                    self.assertEqual(ready['state'], 'ready')
                    self.assertEqual(ready['sha'], m['sha'])
                    self.assertEqual(ready['build'], m['build'])
                    self.assertEqual(ready['asc_build_id'], 'exact-build')

    def test_first_upload_resume_still_requires_full_signing_doctor(self):
        with patch.object(r, 'STATE', self.directory), patch.object(r, 'locked', return_value=contextlib.nullcontext()), patch.object(r.sys, 'argv', ['release', 'resume', str(self.path), '--wait', '0']), patch.object(r, 'doctor', side_effect=r.ReleaseError('profile expired')) as signing, patch.object(r, 'upload_once') as upload, patch.object(r, 'poll') as poll, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(r.main(), 1)
            signing.assert_called_once_with()
            upload.assert_not_called()
            poll.assert_not_called()
            self.assertEqual(r.load(self.path)['upload'], 'not_attempted')

    def test_ambiguous_resume_waits_for_exact_build_without_reupload(self):
        self.m['upload'] = 'intent_recorded'
        r.save(self.path, self.m)
        with patch.object(r, 'STATE', self.directory), patch.object(r, 'locked', return_value=contextlib.nullcontext()), patch.object(r.sys, 'argv', ['release', 'resume', str(self.path), '--wait', '0']), patch.object(r, 'doctor', side_effect=r.ReleaseError('certificate missing')) as signing, patch.object(r, 'validate_credentials'), patch.object(r, 'guard_audience') as audience, patch.object(r, 'exact_build', return_value=None) as exact, patch.object(r, 'bridge') as external, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(r.main(), 1)
            signing.assert_not_called()
            audience.assert_called_once_with()
            exact.assert_called_once()
            external.assert_not_called()
        self.assertEqual(r.load(self.path)['state'], 'awaiting_apple')
        self.assertEqual(r.load(self.path)['upload'], 'intent_recorded')

    def test_pagination_rejects_foreign_origin(self):
        with patch.object(r, 'get', return_value={'data': [], 'links': {'next': 'https://evil.invalid/steal'}}):
            with self.assertRaises(r.ReleaseError):
                r.collection('/v1/builds')


if __name__ == '__main__':
    unittest.main()
