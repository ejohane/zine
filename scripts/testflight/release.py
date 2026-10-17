#!/usr/bin/env python3
"""Mac-only, exact-build TestFlight releases. No third-party Python dependencies."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlencode, urlparse

ROOT = Path(__file__).resolve().parents[2]
APP = '6823593368'
BUNDLE = 'app.zine.native'
TEAM = 'TRA7965NM5'
GROUP = '83615578-9adf-46d6-9ffd-a6b30d319160'
CERT = '089C7A0D222C10692C5CCCF0A1E0F13875313822'
PROFILES = {'ZineNative': '87993fb3-51ec-4f97-8ebb-809355265827',
            'ZineShareExtension': '6033050f-e759-4dea-ae66-ef19c71273f7'}
TARGET = dict(app=APP, bundle=BUNDLE, team=TEAM, group=GROUP)
STATE = Path.home() / 'Library/Application Support/Zine/TestFlight'
PROJECT = 'apps/ios/ZineNative.xcodeproj'


class ReleaseError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


AUTH_KEYS = ('ZINE_ASC_KEY_ID', 'ZINE_ASC_KEY_FILE', 'ZINE_ASC_ISSUER_ID')
TOOL_ENV_PREFIXES = ('FASTLANE_', 'PILOT_', 'TESTFLIGHT_', 'SPACESHIP_',
                     'DELIVER_', 'ITMSTRANSPORTER_')


def child_environment(source=None, auth=False):
    source = os.environ if source is None else source
    env = {key: value for key, value in source.items()
           if not key.startswith(TOOL_ENV_PREFIXES) and not key.startswith('ZINE_ASC_')}
    if auth:
        env.update({key: source[key] for key in AUTH_KEYS if key in source})
    return env


def run(args, cwd=ROOT, env=None):
    result = subprocess.run(list(map(str, args)), cwd=cwd,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env=child_environment(env))
    require(result.returncode == 0, f'{Path(args[0]).name} failed (output suppressed)')
    return result.stdout


def git(*args):
    return run(['git', *args]).decode().strip()


def bridge(action, **args):
    authenticated = action in ('get', 'upload', 'assign')
    if authenticated:
        validate_credentials()
    env = child_environment(auth=authenticated)
    env.update(BUNDLE_GEMFILE=str(ROOT / 'scripts/testflight/Gemfile'),
               FASTLANE_SKIP_UPDATE_CHECK='1', FASTLANE_HIDE_CHANGELOG='1',
               FASTLANE_OPT_OUT_USAGE='1', CI='1')
    # A neutral cwd prevents Pilot's option defaults from evaluating a repo Appfile.
    with tempfile.TemporaryDirectory(prefix='zine-testflight-adapter-') as directory:
        result = subprocess.run(['bundle', 'exec', 'ruby', str(ROOT / 'scripts/testflight/bridge.rb')],
                                input=json.dumps(dict(action=action, **args)).encode(),
                                cwd=directory, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    require(result.returncode == 0, f'{action} failed; authentication/tool/server output suppressed')
    return json.loads(result.stdout)


def get(path):
    return bridge('get', path=path)


def collection(path):
    data = []
    while path:
        response = get(path)
        data.extend(response['data'])
        path = response.get('links', {}).get('next')
        if path:
            uri = urlparse(path)
            require(uri.scheme == 'https' and uri.netloc == 'api.appstoreconnect.apple.com',
                    'Unexpected pagination origin')
            path = uri.path + '?' + uri.query
    return data


def guard_audience():
    app = get(f'/v1/apps/{APP}')['data']
    require(app['id'] == APP and app['attributes']['bundleId'] == BUNDLE, 'ASC app mismatch')
    group = get(f'/v1/betaGroups/{GROUP}')['data']
    attrs = group['attributes']
    require(group['id'] == GROUP and attrs['name'] == 'Erik Internal'
            and attrs.get('isInternalGroup') is True
            and attrs.get('hasAccessToAllBuilds') is False
            and attrs.get('publicLinkEnabled') is False, 'Internal group settings changed')
    all_groups = collection(f'/v1/apps/{APP}/betaGroups?limit=200')
    require(GROUP in {group['id'] for group in all_groups}, 'Approved group missing from app')
    require(all(group['attributes'].get('hasAccessToAllBuilds') is False
                for group in all_groups), 'App has an automatic or unknown-access group; audience review required')
    owner = get(f'/v1/betaGroups/{GROUP}/app')['data']
    require(owner['id'] == APP, 'Group belongs to another app')
    testers = collection(f'/v1/betaGroups/{GROUP}/betaTesters?limit=200')
    require(len(testers) == 1 and testers[0]['attributes']['email'].lower() == 'ejohane@gmail.com',
            'Group audience changed; review required')


def build_number(builds, now=None):
    # Preserve the 10-digit numeric train already accepted by Apple for this app.
    floor = int((now or dt.datetime.now(dt.timezone.utc)).strftime('%Y%m%d') + '01')
    numeric = [int(b['attributes']['version']) for b in builds
               if b['attributes']['version'].isdigit()]
    value = str(max([floor - 1, *numeric]) + 1)
    require(re.fullmatch(r'[1-9][0-9]{0,17}', value), 'Build number exhausted')
    return value


def builds():
    return collection('/v1/builds?' + urlencode({'filter[app]': APP, 'limit': 200}))


def exact_build(manifest):
    rows = collection('/v1/builds?' + urlencode({'filter[app]': APP,
                       'filter[version]': manifest['build'], 'include': 'preReleaseVersion', 'limit': 200}))
    require(len(rows) <= 1, 'Ambiguous exact build lookup')
    if not rows:
        return None
    row = rows[0]
    require(row['attributes']['version'] == manifest['build'], 'Build lookup mismatch')
    require(get(f"/v1/builds/{row['id']}/app")['data']['id'] == APP, 'Build app mismatch')
    version = get(f"/v1/builds/{row['id']}/preReleaseVersion")['data']['attributes']
    require(version['version'] == manifest['version'] and version['platform'] == 'IOS',
            'Build marketing version/platform mismatch')
    if manifest.get('asc_build_id'):
        require(manifest['asc_build_id'] == row['id'], 'ASC build identity changed')
    return row


def source_sha(fetch=True):
    require(git('remote', 'get-url', 'origin') in
            ('https://github.com/ejohane/zine.git', 'git@github.com:ejohane/zine.git'), 'Wrong repository')
    if fetch:
        git('fetch', 'origin', 'main')
    return git('rev-parse', 'origin/main^{commit}')


def project_info(root):
    targets = bridge('project', project=str(root / PROJECT))
    require({t['name'] for t in targets} == set(PROFILES), 'Unexpected release targets')
    versions = set()
    for target in targets:
        settings = target['settings']
        suffix = '' if target['name'] == 'ZineNative' else '.share'
        require(settings.get('PRODUCT_BUNDLE_IDENTIFIER') == BUNDLE + suffix
                and settings.get('DEVELOPMENT_TEAM') == TEAM, 'Project app/team mismatch')
        expected_entitlements = 'Configuration/' + target['name'] + '.entitlements'
        require(settings.get('CODE_SIGN_ENTITLEMENTS') == expected_entitlements, 'Entitlement source changed')
        if target['name'] == 'ZineNative':
            require(settings.get('ZINE_APNS_ENVIRONMENT') == 'production', 'Release APNs setting changed')
        versions.add(settings.get('MARKETING_VERSION'))
    require(len(versions) == 1 and None not in versions, 'App/extension version mismatch')
    require(not (root / 'apps/ios/Configuration/Local.xcconfig').exists(), 'Local configuration present')
    config = root / 'apps/ios/Configuration'
    app_ent = plistlib.loads((config / 'ZineNative.entitlements').read_bytes())
    share_ent = plistlib.loads((config / 'ZineShareExtension.entitlements').read_bytes())
    require(app_ent == {
        'com.apple.developer.associated-domains': ['webcredentials:clerk.myzine.app', 'applinks:$(ZINE_PUBLICATION_HOST)'],
        'aps-environment': '$(ZINE_APNS_ENVIRONMENT)',
        'com.apple.developer.applesignin': ['Default'],
        'keychain-access-groups': ['$(AppIdentifierPrefix)app.zine.native']}
        and share_ent == {'keychain-access-groups': ['$(AppIdentifierPrefix)app.zine.native']},
        'Entitlement grants changed; release tooling review required')
    return versions.pop()


def profile_path(uuid):
    locations = [Path.home() / 'Library/Developer/Xcode/UserData/Provisioning Profiles',
                 Path.home() / 'Library/MobileDevice/Provisioning Profiles']
    for directory in locations:
        path = directory / (uuid + '.mobileprovision')
        if path.is_file():
            return path
    raise ReleaseError('Existing manual provisioning profile missing')


def profile_check(profile, bundle, uuid):
    ent = profile['Entitlements']
    expiry = profile['ExpirationDate'].replace(tzinfo=dt.timezone.utc)
    require(profile['UUID'] == uuid and profile['TeamIdentifier'] == [TEAM]
            and expiry > dt.datetime.now(dt.timezone.utc)
            and ent.get('application-identifier') == TEAM + '.' + bundle
            and ent.get('get-task-allow') is False
            and 'ProvisionedDevices' not in profile and not profile.get('ProvisionsAllDevices'),
            'Manual App Store profile mismatch or expired')
    require(any(hashlib.sha1(c).hexdigest().upper() == CERT for c in profile['DeveloperCertificates']),
            'Profile does not include existing distribution certificate')
    require(ent.get('keychain-access-groups') == [TEAM + '.*', 'com.apple.token'],
            'Existing profile keychain grants changed')
    if bundle == BUNDLE:
        require(ent.get('aps-environment') == 'production', 'Profile APNs mismatch')


def validate_credentials():
    key = os.environ.get('ZINE_ASC_KEY_FILE')
    key_id = os.environ.get('ZINE_ASC_KEY_ID')
    require(key and key_id, 'API key not configured; see docs/testflight-release.md')
    require(re.fullmatch(r'[A-Za-z0-9]{1,64}', key_id), 'Invalid API key ID')
    path = Path(key).expanduser().resolve()
    require(Path(key).is_absolute() and path.is_file()
            and not any((parent / '.git').exists() for parent in path.parents),
            'API key must be an existing file outside the repository')
    require(path.stat().st_mode & 0o077 == 0, 'API key must be owner-only (chmod 600)')


def doctor(credentials=True):
    require(sys.platform == 'darwin', 'Releases require macOS')
    for tool in ['git', 'bundle', 'ruby', 'xcodebuild', 'security', 'codesign', 'node']:
        require(shutil.which(tool), f'Missing prerequisite: {tool}')
    env = os.environ.copy()
    env['BUNDLE_GEMFILE'] = str(ROOT / 'scripts/testflight/Gemfile')
    run(['bundle', 'check'], env=env)
    run(['xcodebuild', '-version'])
    version = project_info(ROOT)
    identities = run(['security', 'find-identity', '-v', '-p', 'codesigning']).decode()
    require(CERT in identities, 'Existing distribution identity unavailable; unlock keychain/check host keychain access (do not replace signing)')
    for name, uuid in PROFILES.items():
        profile = plistlib.loads(run(['security', 'cms', '-D', '-i', profile_path(uuid)]))
        profile_check(profile, BUNDLE + ('.share' if name == 'ZineShareExtension' else ''), uuid)
    if credentials:
        validate_credentials()
        guard_audience()
    return {'local': 'ready', 'credentials': 'verified' if credentials else 'not checked', 'version': version}


def plan(fetch=True, online=True):
    sha = source_sha(fetch)
    # Read the immutable main project without changing this working tree.
    project = git('show', sha + ':' + PROJECT + '/project.pbxproj')
    versions = set(re.findall(r'MARKETING_VERSION = ([^;]+);', project))
    require(len(versions) == 1, 'Main has inconsistent versions')
    return dict(schema=1, target=TARGET.copy(), sha=sha, version=versions.pop(),
                build=build_number(builds()) if online else None,
                state='planned', upload='not_attempted',
                warning='Plan reserves nothing; publish rechecks latest main and build availability')


def save(path, manifest):
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w') as stream:
        json.dump(manifest, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    descriptor = os.open(str(path.parent), os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


@contextlib.contextmanager
def locked(state=STATE):
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(state / 'release.lock', 'a') as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ReleaseError('Another Zine release is running') from None
        yield


def load(path):
    manifest = json.loads(path.read_text())
    require(manifest.get('schema') == 1 and manifest.get('target') == TARGET, 'Manifest target/schema mismatch')
    require(re.fullmatch('[0-9a-f]{40}', manifest.get('sha', '')), 'Invalid manifest SHA')
    require(re.fullmatch('[1-9][0-9]{0,17}', manifest.get('build', '')), 'Invalid manifest build')
    require(manifest.get('upload') in ('not_attempted', 'intent_recorded', 'returned', 'observed'),
            'Invalid upload state')
    return manifest


def verify_app(app, manifest):
    run(['codesign', '--verify', '--deep', '--strict', app])
    extensions = list((app / 'PlugIns').glob('*.appex'))
    require(len(extensions) == 1, 'Unexpected extensions')
    products = [(app, BUNDLE, PROFILES['ZineNative']),
                (extensions[0], BUNDLE + '.share', PROFILES['ZineShareExtension'])]
    for product, bundle, uuid in products:
        info = plistlib.loads((product / 'Info.plist').read_bytes())
        require(info['CFBundleIdentifier'] == bundle and info['CFBundleVersion'] == manifest['build']
                and info['CFBundleShortVersionString'] == manifest['version'], 'Signed build identity mismatch')
        require(info.get('ZINEAPIBaseURL') == 'https://api.myzine.app'
                and not info.get('NSAppTransportSecurity', {}).get('NSExceptionDomains'), 'Production API/ATS mismatch')
        profile = plistlib.loads(run(['security', 'cms', '-D', '-i', product / 'embedded.mobileprovision']))
        profile_check(profile, bundle, uuid)
        # codesign emits the entitlement plist on stdout with this invocation.
        ent = plistlib.loads(run(['codesign', '-d', '--entitlements', '-', '--xml', product]))
        require(ent.get('application-identifier') == TEAM + '.' + bundle
                and ent.get('com.apple.developer.team-identifier') == TEAM
                and ent.get('get-task-allow') is not True
                and ent.get('keychain-access-groups') == [TEAM + '.' + BUNDLE], 'Signed entitlements mismatch')
        if bundle == BUNDLE:
            require(ent.get('aps-environment') == 'production', 'Signed APNs mismatch')
            require(ent.get('com.apple.developer.applesignin') == ['Default']
                    and ent.get('com.apple.developer.associated-domains') ==
                    ['webcredentials:clerk.myzine.app', 'applinks:myzine.app'], 'Signed auth domains changed')
        with tempfile.TemporaryDirectory() as directory:
            prefix = Path(directory) / 'cert'
            run(['codesign', '-d', '--extract-certificates=' + str(prefix), product])
            require(hashlib.sha1(Path(str(prefix) + '0').read_bytes()).hexdigest().upper() == CERT,
                    'Signed certificate mismatch')
    run(['node', ROOT / 'scripts/check-ios-app-config.mjs', app / 'Info.plist'])


def archive(directory, manifest):
    checkout = directory / 'source'
    git('worktree', 'add', '--detach', str(checkout), manifest['sha'])
    require(git('-C', str(checkout), 'rev-parse', 'HEAD') == manifest['sha'], 'Snapshot mismatch')
    require(project_info(checkout) == manifest['version'], 'Snapshot version mismatch')
    bridge('project', project=str(checkout / PROJECT), prepare=True,
           certificate=CERT, profiles=PROFILES, build=manifest['build'])
    prepared_project_hash = hashlib.sha256((checkout / PROJECT / 'project.pbxproj').read_bytes()).hexdigest()
    archive_path = directory / 'Zine.xcarchive'
    # No provisioning updates: only the installed certificate and profiles can be used.
    run(['xcodebuild', '-project', PROJECT, '-scheme', 'ZineNative', '-configuration', 'Release',
         '-destination', 'generic/platform=iOS', '-derivedDataPath', directory / 'DerivedData',
         '-archivePath', archive_path, '-disableAutomaticPackageResolution',
         '-onlyUsePackageVersionsFromResolvedFile',
         'DEVELOPMENT_TEAM=' + TEAM, 'CURRENT_PROJECT_VERSION=' + manifest['build'], 'archive'], cwd=checkout)
    require(hashlib.sha256((checkout / PROJECT / 'project.pbxproj').read_bytes()).hexdigest()
            == prepared_project_hash, 'Prepared project changed during archive')
    git('-C', str(checkout), 'diff', '--exit-code', '--', '.',
        ':(exclude)' + PROJECT + '/project.pbxproj')
    require(not (checkout / 'apps/ios/Configuration/Local.xcconfig').exists(), 'Snapshot local override appeared')
    apps = list((archive_path / 'Products/Applications').glob('*.app'))
    require(len(apps) == 1, 'Expected one archived app')
    verify_app(apps[0], manifest)
    export_archive(directory, manifest)


def export_archive(directory, manifest):
    archive_path = directory / 'Zine.xcarchive'
    options = dict(method='app-store-connect', signingStyle='manual', teamID=TEAM,
                   signingCertificate=CERT, manageAppVersionAndBuildNumber=False,
                   uploadSymbols=True, provisioningProfiles={BUNDLE: PROFILES['ZineNative'],
                   BUNDLE + '.share': PROFILES['ZineShareExtension']})
    options_path = directory / 'ExportOptions.plist'
    options_path.write_bytes(plistlib.dumps(options))
    run(['xcodebuild', '-exportArchive', '-archivePath', archive_path,
         '-exportPath', directory / 'export', '-exportOptionsPlist', options_path])
    ipas = list((directory / 'export').glob('*.ipa'))
    require(len(ipas) == 1, 'Expected one exported IPA')
    with tempfile.TemporaryDirectory() as temporary:
        run(['ditto', '-x', '-k', ipas[0], temporary])
        apps = list((Path(temporary) / 'Payload').glob('*.app'))
        require(len(apps) == 1, 'Expected one exported app')
        verify_app(apps[0], manifest)
    manifest.update(archive=str(archive_path), ipa=str(ipas[0]),
                    ipa_sha256=hashlib.sha256(ipas[0].read_bytes()).hexdigest(), state='archived')


def guard_build_groups(build_id):
    groups = collection(f'/v1/builds/{build_id}/betaGroups?limit=200')
    require(all(group['id'] == GROUP for group in groups),
            'Exact build has unexpected testing groups; distribution stopped')


def guard_unresolved_releases(exclude=None):
    for path in STATE.glob('*/manifest.json'):
        if exclude is not None and path.resolve() == exclude.resolve():
            continue
        prior = load(path)
        require(prior['state'] in ('ready', 'rejected', 'expired') or prior['upload'] == 'not_attempted',
                'Unresolved release exists; use status/resume before starting another upload')


def reconcile(path, manifest, distribute=False):
    guard_audience()
    row = exact_build(manifest)
    if not row:
        manifest['state'] = 'awaiting_apple' if manifest['upload'] != 'not_attempted' else manifest['state']
        save(path, manifest)
        return False
    require(manifest['upload'] != 'not_attempted',
            'Build collision before upload; status cannot adopt an unrelated build')
    guard_build_groups(row['id'])
    attrs = row['attributes']
    manifest.update(asc_build_id=row['id'], upload='observed', processing=attrs['processingState'],
                    state='processing', assigned=False)
    save(path, manifest)
    if attrs['processingState'] in ('FAILED', 'INVALID') or attrs.get('expired'):
        manifest['state'] = 'expired' if attrs.get('expired') else 'rejected'
        save(path, manifest)
        raise ReleaseError('Apple build failed/invalid/expired; no distribution')
    if attrs['processingState'] != 'VALID':
        return False
    beta = get(f"/v1/builds/{row['id']}/buildBetaDetail")['data']['attributes']
    manifest['internal_state'] = beta['internalBuildState']
    save(path, manifest)
    require(beta['internalBuildState'] in ('READY_FOR_BETA_TESTING', 'IN_BETA_TESTING'),
            'Build not ready for internal testing; resolve compliance or other Apple blocker, then resume')
    members = collection(f"/v1/betaGroups/{GROUP}/builds?limit=200")
    assigned = row['id'] in {b['id'] for b in members}
    if distribute and not assigned:
        guard_audience()  # Recheck immediately before the only distribution mutation.
        bridge('assign', build_id=row['id'])
        members = collection(f"/v1/betaGroups/{GROUP}/builds?limit=200")
        assigned = row['id'] in {b['id'] for b in members}
        require(assigned, 'Assignment outcome uncertain; resume to read back exact membership')
    guard_audience()
    guard_build_groups(row['id'])
    final_beta = get(f"/v1/builds/{row['id']}/buildBetaDetail")['data']['attributes']
    require(final_beta['internalBuildState'] in ('READY_FOR_BETA_TESTING', 'IN_BETA_TESTING'),
            'Internal readiness changed during assignment')
    manifest['internal_state'] = final_beta['internalBuildState']
    manifest.update(state='ready' if assigned else 'processed', assigned=assigned)
    save(path, manifest)
    return assigned


def upload_once(path, manifest):
    guard_audience()
    existing = exact_build(manifest)
    if existing:
        require(manifest['upload'] != 'not_attempted', 'Build collision before upload; start a new release')
        return
    require(manifest['upload'] == 'not_attempted',
            'Prior upload may have reached Apple; never automatically re-upload. Check status later')
    guard_unresolved_releases(exclude=path)
    ipa = Path(manifest['ipa'])
    require(hashlib.sha256(ipa.read_bytes()).hexdigest() == manifest['ipa_sha256'], 'IPA changed')
    manifest['upload'] = 'intent_recorded'
    save(path, manifest)  # Durable intent before any external mutation, including a process crash.
    bridge('upload', ipa=str(ipa))
    manifest['upload'] = 'returned'
    save(path, manifest)


def poll(path, manifest, seconds):
    deadline = time.monotonic() + seconds
    while True:
        if reconcile(path, manifest, distribute=True):
            return
        if time.monotonic() >= deadline:
            raise ReleaseError('Apple processing pending; use status or resume for this manifest')
        print('Waiting for exact build processing…', file=sys.stderr, flush=True)
        time.sleep(min(30, max(0, deadline - time.monotonic())))


def publish(reviewed_sha, review_note, wait=1200):
    with locked():
        doctor()
        manifest = plan()
        local_builds = [load(p)['build'] for p in STATE.glob('*/manifest.json')]
        if local_builds:
            manifest['build'] = build_number([{'attributes': {'version': b}}
                                              for b in [manifest['build'], *local_builds]])
        require(reviewed_sha == manifest['sha'] and review_note.strip(),
                'Review must identify latest main SHA and a nonempty review note')
        guard_unresolved_releases()
        directory = STATE / (manifest['sha'][:12] + '-' + manifest['build'])
        directory.mkdir(mode=0o700)
        path = directory / 'manifest.json'
        manifest.update(review=dict(sha=reviewed_sha, note=review_note), state='preparing')
        save(path, manifest)
        print('Release manifest: ' + str(path), file=sys.stderr, flush=True)
        archive(directory, manifest)
        save(path, manifest)
        upload_once(path, manifest)
        poll(path, manifest, wait)
        return dict(manifest=str(path), **manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    doc = sub.add_parser('doctor')
    doc.add_argument('--local', action='store_true', help='Do not read credentials or contact Apple')
    dry = sub.add_parser('plan', help='Read-only dry run; reserves nothing')
    dry.add_argument('--offline', action='store_true', help='Use cached origin/main, no Apple or network; no build allocation')
    pub = sub.add_parser('publish')
    pub.add_argument('--reviewed-sha', required=True)
    pub.add_argument('--review-note', required=True, help='Source/dependency/signing review evidence; never secrets')
    pub.add_argument('--wait', type=int, default=1200)
    for name in ('status', 'resume'):
        item = sub.add_parser(name)
        item.add_argument('manifest', type=Path)
        if name == 'resume':
            item.add_argument('--wait', type=int, default=1200)
    args = parser.parse_args()
    try:
        if args.command == 'doctor':
            result = doctor(credentials=not args.local)
        elif args.command == 'plan':
            if not args.offline:
                doctor()
            result = plan(fetch=not args.offline, online=not args.offline)
        elif args.command == 'publish':
            result = publish(args.reviewed_sha, args.review_note, args.wait)
        else:
            path = args.manifest.resolve()
            require(path.is_relative_to(STATE.resolve()) and path.name == 'manifest.json',
                    'Use the original manifest in the canonical release state directory')
            with locked():
                manifest = load(path)
                if args.command == 'resume':
                    doctor()
                    require(manifest.get('ipa') and manifest.get('ipa_sha256'),
                            'Archive incomplete; start a fresh publish after diagnosing the local failure')
                    upload_once(path, manifest)
                    poll(path, manifest, args.wait)
                else:
                    reconcile(path, manifest)
                result = manifest
        print(json.dumps(result, indent=2))
    except (ReleaseError, OSError, ValueError, KeyError, TypeError, AttributeError, IndexError) as error:
        # These messages are ours; upstream subprocess/server bodies never escape.
        message = str(error) if isinstance(error, ReleaseError) else type(error).__name__
        print('TestFlight stopped: ' + message, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
