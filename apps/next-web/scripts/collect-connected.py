"""Verify and collect bounded production proof; no account payloads or secrets."""
from pathlib import Path
from datetime import datetime, timezone
import json, hashlib, subprocess
root=Path(__file__).resolve().parent.parent
out=root/'output/playwright/connected'
read=lambda name:json.loads((out/name).read_text())
flow,reading,layouts,install=[read(name) for name in ['receipt.json','reading.json','layouts.json','install.json']]
assert len(flow['checks'])==10 and all(check['passed'] for check in flow['checks'])
assert not flow['runtimeErrors'] and not layouts['runtimeErrors'] and not layouts['axe']['violations']
assert all(result['noOverflow'] for result in layouts['results'])
assert install['standalone'] and install['offlineReload'] and not install['manifestErrors'] and not install['installabilityErrors']
assert reading['realRetainedArticle'] and reading['coldOfflineTextMatches']
owner=flow['checks'][0]['details']['ownerHash']
readback=next(check['details'] for check in flow['checks'] if check['name'].startswith('Note,'))
assert readback['ownerHash']==owner and readback['contextEntriesConfirmed']==3
origin='https://api-next.myzine.app'
def http(path):
 data=subprocess.check_output(['curl','--silent','--show-error','--max-time','30','--write-out','\n%{http_code}',origin+path])
 body,status=data.rsplit(b'\n',1)
 return int(status),body
status,body=http('/health')
assert status==200
health=json.loads(body)
assert health['status']=='ok' and health['deploymentId']=='23b9f152-39a0-4450-b0fd-1da9e746e130'
assert http('/next/')[0]==200
assert http('/v1/items')[0]==401
build={}
for file in (root/'dist').rglob('*'):
 if not file.is_file():continue
 relative=str(file.relative_to(root/'dist'))
 data=file.read_bytes();status,remote=http('/next/'+relative)
 assert status==200
 assert remote==data,relative
 build[relative]=hashlib.sha256(data).hexdigest()
assert not any('/artwork/' in path for path in build)
artifacts={file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in out.iterdir() if file.is_file() and file.name not in ['verification.json','failure.json']}
result={'at':datetime.now(timezone.utc).isoformat(),'scope':'Actual production API, real Clerk account, rendered Chrome UI, independent REST readback, offline text/cache, desktop PWA install; no physical iPad claim','browser':flow['browser'],'productionOrigin':origin+'/next/','backendUnchanged':{'deploymentId':health['deploymentId'],'releaseSha':health['releaseSha']},'checks':flow['checks'],'retainedReading':reading,'layouts':layouts,'installation':install,'anonymousLibraryStatus':401,'deployedBuildSHA256':build,'localArtifactSHA256':artifacts}
(out/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'10 real production journeys, independent owner/readback, retained offline text, install/offline and {len(build)} deployed asset hashes verified. API backend unchanged; anonymous library access denied.')
