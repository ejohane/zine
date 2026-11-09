"""Return private rows only to the trusted parent process, never a terminal log."""
import json, sqlite3, sys
path, table = sys.argv[1:]
if not table.replace('_', '').isalnum():
    raise ValueError('Invalid identifier')
db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
db.row_factory = sqlite3.Row
columns = [row[1] for row in db.execute('PRAGMA table_info("'+table+'")')]
rows = [dict(row) for row in db.execute('SELECT * FROM "'+table+'" ORDER BY rowid')]
print(json.dumps({'columns': columns, 'rows': rows}, ensure_ascii=False, separators=(',', ':')))
