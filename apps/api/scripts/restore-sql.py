"""Generate a private isolated-restore import. No credentials or raw rows go to stdout."""
import json, math, sqlite3, sys
from pathlib import Path
source, trigger_path, output = map(Path, sys.argv[1:])
db = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
triggers = json.loads(trigger_path.read_text())

def quote_id(value):
    if not value.replace('_', '').isalnum():
        raise ValueError('Unexpected database identifier')
    return '"' + value + '"'

def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, str):
        # SQL source cannot contain literal NUL bytes.
        return "CAST(X'" + value.encode('utf-8').hex() + "' AS TEXT)"
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    if isinstance(value, (int, float)) and math.isfinite(value):
        return str(value)
    raise ValueError('Unsupported snapshot value')

skip = {'d1_migrations', '_cf_KV', 'api_tokens', 'connections', 'webhooks',
        'webhook_deliveries', 'indexed_documents', 'index_requests', 'vector_garbage',
        'search_sessions', 'operational_alerts', 'service_checks', 'service_state',
        'understanding_requests', 'understanding_runs', 'understanding_artifacts', 'schema_checksums', 'event_retention'}
tables = [r['name'] for r in db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_fts%' ORDER BY name")]
# Parent tables precede children, including across D1's import processing batches.
ordered, visiting = [], set()
def visit(table):
    if table in ordered or table in skip:
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
tables = ordered
with output.open('w', encoding='utf-8') as out:
    out.write('PRAGMA defer_foreign_keys=ON;\n')
    for trigger in triggers:
        out.write('DROP TRIGGER ' + quote_id(trigger['name']) + ';\n')
    for table in tables:
        if table in skip:
            continue
        for row in db.execute('SELECT * FROM ' + quote_id(table)):
            values = dict(row)
            # Preserve authoritative content while preventing automatic external work.
            if table == 'subscriptions':
                values['status'] = 'unsubscribed'
                values['sync_lease_token'] = values['sync_lease_until'] = None
            if table == 'jobs':
                if values['status'] in ('pending', 'running'):
                    values['status'] = 'cancelled'
                values['lease_token'] = values['lease_until'] = None
            columns = ','.join(quote_id(k) for k in values)
            out.write('INSERT INTO ' + quote_id(table) + '(' + columns + ') VALUES(' + ','.join(literal(v) for v in values.values()) + ');\n')
    out.write("INSERT INTO search_fts(search_fts) VALUES('rebuild');\n")
    for request in db.execute('SELECT item_id,requested_revision FROM index_requests'):
        out.write('INSERT INTO index_requests(item_id,requested_revision,indexed_revision) VALUES(' + literal(request['item_id']) + ',' + str(request['requested_revision'] + 1) + ',0);\n')
    for trigger in triggers:
        out.write(trigger['sql'] + ';\n')
    out.write('PRAGMA defer_foreign_keys=OFF;\n')
output.chmod(0o600)
print(json.dumps({'generated': True, 'tables': len([t for t in tables if t not in skip]), 'liveCredentialsRemoved': True, 'externalWorkPaused': True}))
