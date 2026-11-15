"""Generate the SQL import for a branch preview database from a production snapshot.

Usage: preview-sql.py <snapshot database.sqlite> <output.sql>

Uses the branch's own migrations (migrations/*.sql) for the target schema and triggers. Keeps the
library and drops what a preview doesn't need: event history, job history, legacy import records
and everything the isolated-restore rules in restore-sql.py already exclude (credentials,
webhooks, semantic index state). Subscriptions are paused. Text is plain-quoted so every statement
stays under D1's 100 KB limit. Prints only counts, never row data.
"""
import ast, glob, json, math, re, sqlite3, sys
from pathlib import Path

source, output = sys.argv[1:]
here = Path(__file__).parent
restore_rules = (here / 'restore-sql.py').read_text()
skip = ast.literal_eval(re.search(r"^skip = (\{.*?\})$", restore_rules, re.S | re.M).group(1))
skip |= {'service_events', 'jobs', 'legacy_import_records', 'idempotency', 'subscription_seen'}
MAX_STATEMENT = 100_000

def quote_id(value):
    if not value.replace('_', '').isalnum():
        raise ValueError('Unexpected database identifier')
    return '"' + value + '"'

def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, str):
        # SQL text can't hold NUL bytes; only then fall back to hex.
        if '\x00' in value:
            return "CAST(X'" + value.encode('utf-8').hex() + "' AS TEXT)"
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    if isinstance(value, (int, float)) and math.isfinite(value):
        return str(value)
    raise ValueError('Unsupported snapshot value')

# The branch schema: what this preview's migrations create.
schema = sqlite3.connect(':memory:')
for path in sorted(glob.glob(str(here.parent / 'migrations' / '*.sql'))):
    schema.executescript(Path(path).read_text())
triggers = schema.execute("SELECT name, sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").fetchall()
branch_columns = {
    table: [r[1] for r in schema.execute(f'PRAGMA table_info({quote_id(table)})')]
    for (table,) in schema.execute("SELECT name FROM sqlite_schema WHERE type='table'")
}

db = sqlite3.connect(f'file:{source}?mode=ro', uri=True)
db.row_factory = sqlite3.Row
tables = [r['name'] for r in db.execute(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' "
    "AND name NOT LIKE 'search_fts%' ORDER BY name")]
tables = [t for t in tables if t not in skip and t in branch_columns]
# Parent tables precede children.
ordered, visiting = [], set()
def visit(table):
    if table in ordered:
        return
    if table in visiting:
        raise ValueError('Unexpected cyclic foreign keys')
    visiting.add(table)
    for foreign_key in db.execute('PRAGMA foreign_key_list(' + quote_id(table) + ')'):
        if foreign_key[2] != table and foreign_key[2] in tables:
            visit(foreign_key[2])
    visiting.remove(table)
    ordered.append(table)
for table in tables:
    visit(table)

counts, largest = {}, 0
with open(output, 'w', encoding='utf-8') as out:
    def statement(sql):
        global largest
        size = len(sql.encode('utf-8'))
        if size > MAX_STATEMENT:
            raise SystemExit(f'A statement is {size} bytes, over the D1 limit')
        largest = max(largest, size)
        out.write(sql + ';\n')
    statement('PRAGMA defer_foreign_keys=ON')
    for name, _ in triggers:
        statement('DROP TRIGGER IF EXISTS ' + quote_id(name))
    for table in ordered:
        columns = [r[1] for r in db.execute(f'PRAGMA table_info({quote_id(table)})') if r[1] in branch_columns[table]]
        names = ','.join(quote_id(c) for c in columns)
        counts[table] = 0
        for row in db.execute(f'SELECT {names} FROM {quote_id(table)}'):
            values = dict(row)
            if table == 'subscriptions':
                values['status'] = 'unsubscribed'
                values['sync_lease_token'] = values['sync_lease_until'] = None
            statement(f'INSERT INTO {quote_id(table)}({names}) VALUES(' + ','.join(literal(values[c]) for c in columns) + ')')
            counts[table] += 1
    statement("INSERT INTO search_fts(search_fts) VALUES('rebuild')")
    for _, sql in triggers:
        statement(sql)
    statement('PRAGMA defer_foreign_keys=OFF')
Path(output).chmod(0o600)
print(json.dumps({'generated': True, 'tables': len(counts), 'rows': sum(counts.values()), 'largestStatementBytes': largest}))
