import contextlib
import copy
import importlib.util
import json
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
        with patch.object(r, 'get', side_effect=self.audience_response), patch.object(r, 'collection', return_value=[tester]):
            r.guard_audience()
        for audience in [[], [tester, tester], [{'attributes': {'email': 'other@example.com'}}]]:
            with patch.object(r, 'get', side_effect=self.audience_response), patch.object(r, 'collection', return_value=audience):
                with self.assertRaisesRegex(r.ReleaseError, 'audience changed'):
                    r.guard_audience()
        for field in ['isInternalGroup', 'hasAccessToAllBuilds', 'publicLinkEnabled']:
            def response(path):
                value = self.audience_response(path)
                if path == f'/v1/betaGroups/{r.GROUP}':
                    value['data']['attributes'][field] = not value['data']['attributes'][field]
                return value
            with patch.object(r, 'get', side_effect=response), patch.object(r, 'collection', return_value=[tester]):
                with self.assertRaises(r.ReleaseError):
                    r.guard_audience()

    def row(self, state='VALID'):
        return {'id': 'exact-build', 'attributes': {'version': self.m['build'], 'processingState': state, 'expired': False}}

    def test_status_is_read_only_and_assign_uses_exact_build(self):
        with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=self.row()), patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'READY_FOR_BETA_TESTING'}}}), patch.object(r, 'collection', return_value=[]), patch.object(r, 'bridge') as external:
            self.assertFalse(r.reconcile(self.path, self.m))
            external.assert_not_called()
        with patch.object(r, 'guard_audience') as guard, patch.object(r, 'exact_build', return_value=self.row()), patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'IN_BETA_TESTING'}}}), patch.object(r, 'collection', side_effect=[[], [{'id': 'exact-build'}]]), patch.object(r, 'bridge') as external:
            self.assertTrue(r.reconcile(self.path, self.m, distribute=True))
            external.assert_called_once_with('assign', build_id='exact-build')
            self.assertEqual(guard.call_count, 3)
            self.assertEqual(r.load(self.path)['state'], 'ready')

    def test_processing_compliance_failed_and_absent_never_assign(self):
        for state in ['PROCESSING', 'FAILED', 'INVALID', None, 'MISSING_COMPLIANCE']:
            row = None if state is None else self.row('VALID' if state == 'MISSING_COMPLIANCE' else state)
            with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=row), patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'MISSING_EXPORT_COMPLIANCE'}}}), patch.object(r, 'bridge') as external:
                try:
                    self.assertFalse(r.reconcile(self.path, self.m, distribute=True))
                except r.ReleaseError:
                    self.assertIn(state, ['FAILED', 'INVALID', 'MISSING_COMPLIANCE'])
                external.assert_not_called()

    def test_assignment_uncertainty_recovers_by_readback(self):
        self.m['upload'] = 'observed'
        with patch.object(r, 'guard_audience'), patch.object(r, 'exact_build', return_value=self.row()), patch.object(r, 'get', return_value={'data': {'attributes': {'internalBuildState': 'IN_BETA_TESTING'}}}), patch.object(r, 'collection', return_value=[{'id': 'exact-build'}]), patch.object(r, 'bridge') as external:
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

    def test_pagination_rejects_foreign_origin(self):
        with patch.object(r, 'get', return_value={'data': [], 'links': {'next': 'https://evil.invalid/steal'}}):
            with self.assertRaises(r.ReleaseError):
                r.collection('/v1/builds')


if __name__ == '__main__':
    unittest.main()
