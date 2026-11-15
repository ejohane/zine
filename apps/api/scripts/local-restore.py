"""Copy a production snapshot into the local development database, cleaned.

Usage: local-restore.py <snapshot database.sqlite> <local D1 sqlite file>

The local database must already have the current migrations applied and no rows. Rows are copied
directly between SQLite files, so retained text of any size fits. Cleaning follows the isolated
restore rules in restore-sql.py (same skip list, subscriptions paused, queued work cancelled).
Prints only counts, never row data.
"""
import ast, json, re, sqlite3, sys
from pathlib import Path

source, target = sys.argv[1:]
restore_rules = Path(__file__).with_name('restore-sql.py').read_text()
skip = ast.literal_eval(re.search(r"^skip = (\{.*?\})$", restore_rules, re.S | re.M).group(1))

def quote_id(value):
    if not value.replace('_', '').isalnum():
        raise ValueError('Unexpected database identifier')
    return '"' + value + '"'

db = sqlite3.connect(target)
db.execute('ATTACH DATABASE ? AS snap', (f'file:{source}?mode=ro',))
tables = lambda schema: [r[0] for r in db.execute(
    f"SELECT name FROM {schema}.sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' "
    "AND name NOT LIKE 'search_fts%' AND name NOT IN ('d1_migrations','_cf_KV','_cf_METADATA') ORDER BY name")]
local_tables = set(tables('main'))
for table in local_tables:
    if db.execute(f'SELECT COUNT(*) FROM main.{quote_id(table)}').fetchone()[0]:
        raise SystemExit('Local database is not empty; reset it before loading')

triggers = db.execute("SELECT name, sql FROM main.sqlite_schema WHERE type='trigger'").fetchall()
db.execute('PRAGMA foreign_keys=OFF')
db.execute('BEGIN')
for name, _ in triggers:
    db.execute('DROP TRIGGER main.' + quote_id(name))
counts = {}
for table in tables('snap'):
    if table in skip or table not in local_tables:
        continue
    # Copy the columns both schemas share; columns new on this branch keep their defaults.
    local_columns = {r[1] for r in db.execute(f'PRAGMA main.table_info({quote_id(table)})')}
    columns = [r[1] for r in db.execute(f'PRAGMA snap.table_info({quote_id(table)})') if r[1] in local_columns]
    names = ','.join(quote_id(c) for c in columns)
    db.execute(f'INSERT INTO main.{quote_id(table)}({names}) SELECT {names} FROM snap.{quote_id(table)}')
    counts[table] = db.execute(f'SELECT COUNT(*) FROM main.{quote_id(table)}').fetchone()[0]
# Preserve content while preventing automatic external work.
db.execute("UPDATE subscriptions SET status='unsubscribed', sync_lease_token=NULL, sync_lease_until=NULL")
db.execute("UPDATE jobs SET status='cancelled' WHERE status IN ('pending','running')")
db.execute('UPDATE jobs SET lease_token=NULL, lease_until=NULL')
db.execute("INSERT INTO search_fts(search_fts) VALUES('rebuild')")
# Semantic vectors are not available locally; ask for reindexing so state stays consistent.
db.execute('INSERT INTO index_requests(item_id,requested_revision,indexed_revision) '
           'SELECT item_id, requested_revision + 1, 0 FROM snap.index_requests')
for _, sql in triggers:
    db.execute(sql)
db.execute('COMMIT')
problems = db.execute('PRAGMA foreign_key_check').fetchall()
if problems:
    raise SystemExit(f'Foreign key check failed for {len(problems)} rows')
db.execute('DETACH DATABASE snap')
db.close()
print(json.dumps({'loaded': True, 'tables': len(counts), 'rows': sum(counts.values())}))
