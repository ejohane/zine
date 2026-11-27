"""Collect a working set of real saves for the design lab from the LOCAL API (bun run local:dev).

Usage (from apps/next-web): python3 design-lab/fetch-data.py
Writes output/design-lab/data.json (ignored by git): Home, saved, inbox and favourite items, with
their pictures shrunk and embedded so the lab page works offline and inside a sandboxed frame.
Never point this at production; it reads apps/api/.local-data/dev/token.
"""
import base64, datetime, io, json, sqlite3, sys, glob, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

here = Path(__file__).resolve().parent
api = here.parent.parent / 'api'
token = (api / '.local-data/dev/token').read_text().strip()
origin = 'http://localhost:8890'

def get(path):
    request = urllib.request.Request(origin + path, headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

def pages(query, count):
    items, cursor = [], None
    while len(items) < count:
        page = get(f'/v1/items?{query}&limit=30' + (f'&cursor={cursor}' if cursor else ''))
        items += page['items']
        cursor = page.get('nextCursor')
        if not cursor:
            break
    return items[:count]

def slim(item):
    content = item['content']
    keep = ('url', 'platform', 'type', 'title', 'creator', 'description', 'thumbnail',
            'creatorImageUrl', 'durationSeconds', 'summary', 'preview', 'readMinutes', 'publishedAt', 'topics')
    content = {key: content[key] for key in keep if key in content}
    for key in ('description', 'summary', 'preview'):
        if isinstance(content.get(key), str):
            content[key] = content[key][:700]
    return {'id': item['id'], 'status': item.get('status', 'saved'), 'savedAt': item.get('savedAt'),
            'createdAt': item.get('createdAt'), 'progress': item['progress'], 'content': content,
            'tags': [t for t in item.get('tags', []) if ':' not in t and not t.startswith('api-')]}

home = get('/v1/home')
saved = pages('status=saved', 150)
posts = pages('status=saved&type=post', 24)
articles = pages('status=saved&type=article', 40)
inbox = pages('status=received', 90)
collections = get('/v1/collections')['collections']
faves = []
for collection in collections:
    if collection['name'] == 'Faves':
        faves = pages('status=saved&collectionId=' + collection['id'], 30)

database = [p for p in glob.glob(str(api / '.local-data/dev/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite')) if 'metadata' not in p][0]
db = sqlite3.connect(database)
counts = {'saved': {}, 'inbox': {}}
for status, kind, n in db.execute("SELECT status, content_type, COUNT(*) FROM personal_items WHERE status IN ('saved','received') AND archived=0 GROUP BY 1,2"):
    counts['saved' if status == 'saved' else 'inbox'][kind or 'other'] = n
counts['sources'] = db.execute('SELECT COUNT(*) FROM subscriptions').fetchone()[0]
counts['collections'] = {name: n for name, n in db.execute('SELECT c.name, COUNT(m.item_id) FROM collections c LEFT JOIN collection_members m ON m.collection_id=c.id GROUP BY c.id')}
counts['month'] = db.execute("SELECT COUNT(*) FROM personal_items WHERE status='saved' AND archived=0 AND substr(saved_at,1,7)=strftime('%Y-%m','now')").fetchone()[0]
counts['started'] = db.execute("SELECT COUNT(*) FROM progress p JOIN personal_items i ON i.id=p.item_id WHERE p.completed_at IS NULL AND p.position>0 AND i.status='saved'").fetchone()[0]

data = {
    'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'home': {'sections': [{**s, 'cards': [slim(c) for c in s['cards']]} for s in home['sections']]},
    'saved': [slim(i) for i in saved], 'posts': [slim(i) for i in posts], 'articles': [slim(i) for i in articles],
    'inbox': [slim(i) for i in inbox], 'faves': [slim(i) for i in faves], 'counts': counts,
}

def every_item():
    yield from all_items()

def post(path, body):
    request = urllib.request.Request(origin + path, data=json.dumps(body).encode(), method='POST',
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def enrich():
    """Give list items what Home cards get (opening text, read time) through the read-only Home preview."""
    need = {}
    for item in every_item():
        if item['content']['type'] in ('article', 'post', 'thread') and not item['content'].get('preview'):
            need.setdefault(item['id'], []).append(item)
    ids = list(need)
    for start in range(0, len(ids), 24):
        batch = ids[start:start + 24]
        groups = [batch[i:i + 8] for i in range(0, len(batch), 8)]
        if len(groups[-1]) < 2:
            groups[-2:] = [groups[-2] + groups[-1]] if len(groups) > 1 else []
        try:
            home = post('/v1/home/preview', {'leadBeforeRecent': False, 'collections': [
                {'title': f'Lab {n}', 'itemIds': group[:8]} for n, group in enumerate(groups)]})
        except Exception as error:
            print('preview failed', error, file=sys.stderr)
            continue
        for section in home['sections']:
            for card in section['cards']:
                for item in need.get(card['id'], []):
                    for key in ('preview', 'readMinutes'):
                        if key in card['content']:
                            item['content'][key] = card['content'][key]

def all_items():
    for section in data['home']['sections']:
        yield from section['cards']
    for key in ('saved', 'posts', 'articles', 'inbox', 'faves'):
        yield from data[key]

enrich()

# The newest saves can be shown large, so their pictures are kept bigger.
big = {item['id'] for section in data['home']['sections'] for item in section['cards']}
big |= {item['id'] for item in data['saved'][:56]} | {item['id'] for item in data['posts'][:8]}
wanted = {}
for item in every_item():
    c = item['content']
    if str(c.get('thumbnail', '')).startswith('https://'):
        wanted[c['thumbnail']] = max(wanted.get(c['thumbnail'], 0), 880 if item['id'] in big else 480)
    if str(c.get('creatorImageUrl', '')).startswith('https://'):
        wanted.setdefault(c['creatorImageUrl'], 56)

def load(pair):
    url, width = pair
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*'})
        with urllib.request.urlopen(request, timeout=20) as response:
            image = Image.open(io.BytesIO(response.read(6_000_000)))
        image.load()
        w, h = image.size
        if image.mode not in ('RGB', 'L'):
            flat = Image.new('RGB', image.size, (255, 255, 255))
            rgba = image.convert('RGBA')
            flat.paste(rgba, mask=rgba.split()[3])
            image = flat
        image = image.convert('RGB')
        image.thumbnail((width, width * 3))
        out = io.BytesIO()
        image.save(out, 'JPEG', quality=68, optimize=True)
        return url, {'src': 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode(), 'width': w, 'height': h}
    except Exception:
        return url, None

with ThreadPoolExecutor(12) as pool:
    images = dict(pool.map(load, wanted.items()))
data['images'] = {url: value for url, value in images.items() if value}

out = here.parent / 'output/design-lab'
out.mkdir(parents=True, exist_ok=True)
(out / 'data.json').write_text(json.dumps(data, separators=(',', ':')))
print(json.dumps({'items': sum(1 for _ in every_item()), 'pictures': len(data['images']), 'missed': len(images) - len(data['images']),
                  'bytes': (out / 'data.json').stat().st_size, 'counts': counts}))
