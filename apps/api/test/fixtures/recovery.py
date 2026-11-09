"""Synthetic snapshot with historical job identities and private text, used by D1 regression."""
import json, sqlite3, sys
from pathlib import Path
folder = Path(sys.argv[1])
db = sqlite3.connect(folder / 'source.sqlite')
for migration in sorted(Path('migrations').glob('*.sql')):
    db.executescript(migration.read_text())
at = '2026-11-09T00:00:00.000Z'
db.execute("INSERT INTO content_items(id,identity_key,canonical_url,platform,kind,created_at) VALUES('cnt_restore','restore-fixture','https://example.com/restore','web','article',?)", (at,))
db.execute("INSERT INTO personal_items(id,owner_id,content_id,status,created_at,updated_at) VALUES('itm_restore','restore-owner','cnt_restore','saved',?,?)", (at, at))
db.execute("INSERT INTO context_entries(id,item_id,text,origin,contributor,created_at,updated_at) VALUES('ctx_restore','itm_restore',?,'explicit','fixture',?,?)", ('Retained café; context', at, at))
db.execute("INSERT INTO search_documents(content_id,owner_id,item_id,field,text) VALUES('cnt_restore','restore-owner','itm_restore','context',?)", ('Retained café; context',))
db.execute("UPDATE index_requests SET requested_revision=9,indexed_revision=9 WHERE item_id='itm_restore'")
for revision in range(1, 10):
    db.execute("INSERT INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,'restore-owner','itm_restore','index','{}','succeeded',?,?,?)", ('job_index_itm_restore_' + str(revision), at, at, at))
db.execute("INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at) VALUES('tok_restore','restore-owner','Fixture secret','hash-only','2030-01-01T00:00:00.000Z',?)", (at,))
db.commit()
triggers = [{'name': row[0], 'sql': row[1]} for row in db.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger'")]
(folder / 'triggers.json').write_text(json.dumps(triggers))
db.close()
