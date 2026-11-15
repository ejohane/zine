import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// The local development copy of production must never carry anything that can sign in or act
// on the outside world. This builds a tiny "production" snapshot with those rows and loads it.
const dir = mkdtempSync(join(tmpdir(), 'zine-local-restore-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const python = (code: string, ...args: string[]) =>
  execFileSync('python3', ['-c', code, ...args], { encoding: 'utf8' });
const migrate = `
import glob, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
for path in sorted(glob.glob('migrations/*.sql')):
    db.executescript(open(path).read())
db.commit()
`;

describe('local development data', () => {
  it('copies content but no credentials, webhooks or queued work', () => {
    const snapshot = join(dir, 'snapshot.sqlite');
    const local = join(dir, 'local.sqlite');
    python(migrate, snapshot);
    python(migrate, local);
    python(
      `
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
now = '2026-11-15T00:00:00Z'
db.execute("INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at) VALUES('tok_1','user_1','prod','hash',?,?)", (now, now))
db.execute("INSERT INTO connections(owner_id,provider,credentials,status,created_at,updated_at) VALUES('user_1','google','secret','active',?,?)", (now, now))
db.execute("INSERT INTO jobs(id,owner_id,kind,payload_json,status,available_at,lease_token,created_at,updated_at) VALUES('job_1','user_1','sync','{}','pending',?,'lease',?,?)", (now, now, now))
db.commit()
`,
      snapshot
    );
    const output = execFileSync('python3', ['scripts/local-restore.py', snapshot, local], {
      encoding: 'utf8',
    });
    expect(JSON.parse(output).loaded).toBe(true);
    const counts = JSON.parse(
      python(
        `
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
one = lambda sql: db.execute(sql).fetchone()[0]
print(json.dumps({
  'tokens': one('SELECT COUNT(*) FROM api_tokens'),
  'connections': one('SELECT COUNT(*) FROM connections'),
  'pending': one("SELECT COUNT(*) FROM jobs WHERE status IN ('pending','running')"),
  'leases': one('SELECT COUNT(*) FROM jobs WHERE lease_token IS NOT NULL'),
  'jobs': one('SELECT COUNT(*) FROM jobs'),
}))
`,
        local
      )
    );
    expect(counts).toEqual({ tokens: 0, connections: 0, pending: 0, leases: 0, jobs: 1 });
  });

  it('refuses to load into a database that already has rows', () => {
    const snapshot = join(dir, 'snapshot.sqlite');
    const local = join(dir, 'local.sqlite');
    expect(() =>
      execFileSync('python3', ['scripts/local-restore.py', snapshot, local], { stdio: 'pipe' })
    ).toThrow();
  });
});
