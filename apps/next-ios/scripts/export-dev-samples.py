#!/usr/bin/env python3
"""Export public metadata and thumbnails from an existing LOCAL Zine D1 snapshot.
Usage: python3 scripts/export-dev-samples.py /path/to/local.sqlite
No account state, credentials, article bodies, or service dependencies are copied.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import html, json, re, sqlite3, subprocess, sys, tempfile, urllib.request, uuid
app = Path(__file__).resolve().parents[1]
c = sqlite3.connect(f'file:{Path(sys.argv[1]).resolve()}?mode=ro', uri=True)
c.row_factory = sqlite3.Row
preferred = {
 'ARTICLE': ['The Running Novelist', "Why books don't work", 'AI and Irontown', 'Working with designers', 'The components of agent memory', 'On Craft, Process, and Networks – Disquiet'],
 'PODCAST': ['The MacBook Pro (with touch)', "It's Been A While", 'How Cisco Got Bullwhipped', "The Future Called. It's Using CSS2.", '716: Take the Null', 'We now have Kerr’s Law (Changelog Interviews #689)'],
 'VIDEO': ['Good Taste vs. Slop: What Makes The Difference?', "Coding Isn't About Code Anymore", 'Ep 08 - "Nobody\'s Going to Write the Next React"', 'Torrenters are building epic media collections | The Vergecast', 'Liam Pace | The Nine Club #414', 'Making Agents Ship in Complex Brownfield Codebases | Dex Horothy, CEO of HumanLayer'],
 'POST': ['Your coding agents made you a manager', 'Designing for Agents', 'Critical thinking when agents do the work', 'Loops You Can Trust']
}
queues = {kind: [] for kind in preferred}
plain = lambda value: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', value or ''))).strip()
for kind, titles in preferred.items():
 for title in titles:
  row = c.execute('''SELECT i.*, c.name author FROM items i LEFT JOIN creators c ON c.id=i.creator_id
   WHERE i.content_type=? AND i.title=? AND EXISTS (SELECT 1 FROM user_items u WHERE u.item_id=i.id)
   ORDER BY i.created_at DESC LIMIT 1''', (kind, title)).fetchone()
  if row is None: raise SystemExit('Local item missing: '+title)
  queues[kind].append(dict(row))
order = ['ARTICLE','PODCAST','PODCAST','POST','POST','VIDEO','ARTICLE','VIDEO','POST']
rows = [queues[kind].pop(0) for kind in order]
while any(queues.values()):
 for kind in preferred:
  if queues[kind]: rows.append(queues[kind].pop(0))
items = []
for row in rows:
 kind = row['content_type']; seconds = row['duration']; minutes = row['reading_time_minutes']
 items.append(dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL, row['canonical_url'])),
  section={'ARTICLE':'Articles','PODCAST':'Podcasts','VIDEO':'Videos','POST':'Posts'}[kind],
  title=plain(row['title']), author=plain(row['author'] or row['publisher'] or row['provider']),
  note=plain(row['summary'])[:900], body='',
  duration=f'{round(seconds/60)} min' if seconds else f'{minutes} min read' if minutes else 'Saved post' if kind=='POST' else 'Read article',
  thread='From your Zine', url=row['canonical_url'], isSample=True, isFinished=False))
def artwork(pair):
 row,item = pair
 if not row['thumbnail_url'] or item['section']=='Posts': return
 name='Dev'+item['id'].replace('-','')[:12]; asset=app/'Resources/Assets.xcassets'/(name+'.imageset')
 asset.mkdir(parents=True,exist_ok=True)
 try:
  with tempfile.TemporaryDirectory() as tmp:
   source=Path(tmp)/'source'
   request=urllib.request.Request(row['thumbnail_url'],headers={'User-Agent':'ZineNext local prototype'})
   with urllib.request.urlopen(request,timeout=25) as response: source.write_bytes(response.read(12000000))
   subprocess.run(['sips','-s','format','jpeg','-Z','1100',str(source),'--out',str(asset/'photo.jpg')],check=True,capture_output=True)
  (asset/'Contents.json').write_text(json.dumps({'images':[{'filename':'photo.jpg','idiom':'universal'}],'info':{'author':'xcode','version':1}},indent=2)+'\n')
  item['image']=name
 except Exception as error:
  print(f"Artwork unavailable: {item['title']} ({type(error).__name__})")
  if not list(asset.iterdir()): asset.rmdir()
with ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(artwork,zip(rows,items)))
(app/'Resources/DevSamples.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
(app/'Resources/DevSampleArtwork.json').write_text(json.dumps([dict(asset=i['image'],source=r['thumbnail_url'],original=r['canonical_url']) for r,i in zip(rows,items) if 'image' in i],indent=2)+'\n')
print(f'Exported {len(items)} samples and {sum("image" in item for item in items)} images.')
