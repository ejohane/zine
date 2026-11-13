"""Collect local receipts without upgrading their verification scope."""
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone

root = Path(__file__).resolve().parent.parent
out = root / 'output/playwright'
def cli_result(name):
    lines = (out / name).read_text().splitlines()
    return json.loads(lines[lines.index('### Result') + 1])
chrome = json.loads((out / 'chromium-result.json').read_text())
install = cli_result('install.log')
axe = cli_result('accessibility.log')
webkit = json.loads((out / 'webkit-result.json').read_text())
assert chrome['passed'] == 13 and not chrome['runtimeErrors']
assert install['standalone'] and install['offlineReload']
assert not install['manifestErrors'] and not install['installabilityErrors']
assert all(not axe[state]['violations'] for state in ('home', 'capture', 'detail'))
assert webkit['search'] and webkit['notePersistedThroughReload'] and not webkit['runtimeErrors']
assets = [p for p in (root / 'dist/assets').glob('*.js')]
assert len(assets) == 1 and install['bundle'] == '/assets/' + assets[0].name
baseline = json.loads((root / 'native-baseline.json').read_text())
for name, digest in baseline.items():
    assert hashlib.sha256((root.parent / 'next-ios' / name).read_bytes()).hexdigest() == digest, name
files = [p for p in (root / 'dist').rglob('*') if p.is_file()]
files += [p for p in out.iterdir() if p.is_file() and p.suffix in {'.png','.webm','.zip','.log'}]
receipt = {
    'at': datetime.now(timezone.utc).isoformat(),
    'scope': 'Local production PWA, mock data, Chrome install/offline; WebKit online touch only',
    'chrome': chrome, 'installation': install, 'accessibility': axe, 'webkit': webkit,
    'nativeBaseline': json.loads((root / 'native-baseline.json').read_text()),
    'sha256': {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
}
(out / 'verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(f'Collected {len(files)} hashed artifacts; 13 Chrome journeys, standalone install and offline passed; WebKit offline explicitly unverified.')
