#!/usr/bin/env bun
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promisify } from 'node:util';
import { Database } from 'bun:sqlite';

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const WORKER_DIR = join(REPO_ROOT, 'apps/worker');
const SNAPSHOT_DIR = join(REPO_ROOT, '.local-data/prod-user-snapshot');
const BACKUP_DIR = join(REPO_ROOT, '.local-data/local-d1-backups');
const RAW_SQL = join(SNAPSHOT_DIR, 'prod-raw.sql');
const RAW_DB = join(SNAPSHOT_DIR, 'prod-raw.sqlite');
const SANITIZED_SQL = join(SNAPSHOT_DIR, 'local-sanitized.sql');
const ARTICLE_BODIES_DIR = join(SNAPSHOT_DIR, 'article-bodies');
const STAGED_STATE_DIR = join(SNAPSHOT_DIR, 'staged-wrangler-state');
const STATE_DIR = join(WORKER_DIR, '.wrangler/state');
const MIGRATIONS_DIR = join(WORKER_DIR, 'src/db/migrations');

const PROD_DATABASE = 'zine-db-production';
const PROD_ENV = 'production';
const PROD_ARTICLE_BUCKET = 'zine-article-content-prod';
const LOCAL_ARTICLE_BUCKET = 'zine-article-content-dev';
const PROD_USER_ID = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const LOCAL_USER_ID = 'dev-user-001';
const LOCAL_EMAIL = 'dev@example.com';
const ARTICLE_BODY_TRANSFER_CONCURRENCY = 6;
const LOCAL_R2_RESTORE_CONCURRENCY = 1;

const SUPPORTED_ARGS = new Set([
  '--yes',
  '-y',
  '--skip-export',
  '--skip-restore',
  '--keep-raw',
  '--include-article-bodies',
]);

export function parseSyncOptions(argv) {
  const unknownArgs = argv.filter((arg) => !SUPPORTED_ARGS.has(arg));
  if (unknownArgs.length > 0) {
    throw new Error(
      `Unknown argument${unknownArgs.length === 1 ? '' : 's'}: ${unknownArgs.join(', ')}`
    );
  }

  const args = new Set(argv);
  const options = {
    assumeYes: args.has('--yes') || args.has('-y'),
    skipExport: args.has('--skip-export'),
    skipRestore: args.has('--skip-restore'),
    keepRaw: args.has('--keep-raw'),
    includeArticleBodies: args.has('--include-article-bodies'),
  };

  if (options.includeArticleBodies && options.skipRestore) {
    throw new Error('--include-article-bodies cannot be combined with --skip-restore.');
  }

  return options;
}

const { assumeYes, skipExport, skipRestore, keepRaw, includeArticleBodies } = parseSyncOptions(
  import.meta.main ? process.argv.slice(2) : []
);
const execFileAsync = promisify(execFile);

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
  });
}

function runSqlite(dbPath, sql) {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 100,
  });

  if (result.status !== 0) {
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    throw new Error(`sqlite3 failed with exit code ${result.status}`);
  }

  return result.stdout;
}

function runCaptured(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 100,
  });

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    const tail = output.split('\n').slice(-80).join('\n');
    if (tail) console.error(tail);
    throw new Error(`${command} failed with exit code ${result.status}`);
  }

  if (options.successMessage) {
    console.log(options.successMessage);
  }
}

async function runCapturedAsync(command, args, options = {}) {
  try {
    await execFileAsync(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 100,
    });
  } catch (error) {
    const output = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`.trim();
    const tail = output.split('\n').slice(-40).join('\n');
    if (tail) console.error(tail);
    throw new Error(`${command} ${args.slice(0, 4).join(' ')} failed`);
  }
}

function assertLocalDevStackStopped() {
  if (skipRestore) return;

  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  if (result.status !== 0) return;

  const runningWrangler = result.stdout
    .split('\n')
    .filter((line) => line.includes(REPO_ROOT))
    .filter((line) => /(?:\.bin\/wrangler|wrangler-dist\/cli\.js)\s+dev\b/.test(line));

  if (runningWrangler.length > 0) {
    throw new Error(
      [
        'The local Zine dev stack is running in this worktree.',
        'Stop bun run dev:worktree before replacing local Wrangler state, then restart it after the sync.',
      ].join('\n')
    );
  }
}

async function mapWithConcurrency(values, concurrency, operation) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await operation(values[index], index);
    }
  });
  await Promise.all(workers);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function confirmDestructiveLocalRestore() {
  if (assumeYes || skipRestore) return;

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      [
        '',
        'This will export production D1 data, sanitize one user, and replace local Wrangler D1 state.',
        `Production user: ${PROD_USER_ID}`,
        `Local user:      ${LOCAL_USER_ID}`,
        "Type 'restore local d1' to continue: ",
      ].join('\n')
    );

    if (answer.trim() !== 'restore local d1') {
      console.log('Aborted.');
      process.exit(1);
    }
  } finally {
    rl.close();
  }
}

function ensureTools() {
  run('sqlite3', ['--version'], { stdio: 'pipe' });
  run('bun', ['--version'], { stdio: 'pipe' });
}

function exportProductionD1() {
  if (skipExport) {
    if (!existsSync(RAW_SQL)) {
      throw new Error(`--skip-export was passed, but ${RAW_SQL} does not exist.`);
    }
    console.log(`Using existing production export: ${RAW_SQL}`);
    return;
  }

  rmSync(RAW_SQL, { force: true });
  run(
    'bun',
    ['wrangler', 'd1', 'export', PROD_DATABASE, '--env', PROD_ENV, '--remote', '--output', RAW_SQL],
    { cwd: WORKER_DIR }
  );
}

function buildRawSqlite() {
  rmSync(RAW_DB, { force: true });
  const rawSql = readFileSync(RAW_SQL, 'utf8');
  runSqlite(RAW_DB, rawSql);
}

function sanitizeSqlite() {
  const prodUser = sqlString(PROD_USER_ID);
  const localUser = sqlString(LOCAL_USER_ID);
  const localEmail = sqlString(LOCAL_EMAIL);
  const articleContentKeyReset = includeArticleBodies ? '' : ',\n       article_content_key = NULL';

  runSqlite(
    RAW_DB,
    `
PRAGMA foreign_keys = OFF;

CREATE TEMP TABLE keep_user_items AS
  SELECT id FROM user_items WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_tags AS
  SELECT id FROM tags WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_collections AS
  SELECT id FROM collections WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_provider_connections AS
  SELECT id FROM provider_connections WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_gmail_mailboxes AS
  SELECT id FROM gmail_mailboxes WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_newsletter_feeds AS
  SELECT id FROM newsletter_feeds WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_subscriptions AS
  SELECT id FROM subscriptions WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_rss_feeds AS
  SELECT id FROM rss_feeds WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_sources AS
  SELECT id FROM sources WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_daily_editions AS
  SELECT id FROM daily_editions WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_editorial_experiments AS
  SELECT id FROM editorial_experiments WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_people_daily_editions AS
  SELECT id FROM people_daily_editions WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_items AS
  SELECT DISTINCT item_id AS id FROM user_items WHERE user_id = ${prodUser}
  UNION
  SELECT DISTINCT si.item_id AS id
    FROM subscription_items si
    JOIN subscriptions s ON s.id = si.subscription_id
   WHERE s.user_id = ${prodUser}
  UNION
  SELECT DISTINCT rfi.item_id AS id
    FROM rss_feed_items rfi
    JOIN rss_feeds rf ON rf.id = rfi.rss_feed_id
   WHERE rf.user_id = ${prodUser}
  UNION
  SELECT DISTINCT item_id AS id FROM x_bookmark_items WHERE user_id = ${prodUser}
  UNION
  SELECT DISTINCT item_id AS id FROM newsletter_feed_messages WHERE user_id = ${prodUser};

CREATE TEMP TABLE keep_item_enrichments AS
  SELECT id FROM item_enrichments WHERE item_id IN (SELECT id FROM keep_items);

CREATE TEMP TABLE keep_creators AS
  SELECT DISTINCT creator_id AS id FROM items
   WHERE id IN (SELECT id FROM keep_items) AND creator_id IS NOT NULL
  UNION
  SELECT DISTINCT creator_id AS id FROM subscriptions
   WHERE user_id = ${prodUser} AND creator_id IS NOT NULL;

DELETE FROM dead_letter_queue;
DELETE FROM item_embedding_refs;
DELETE FROM rss_discovery_cache;
DELETE FROM newsletter_unsubscribe_events;
DELETE FROM api_tokens;

DELETE FROM editorial_experiment_reviews
 WHERE user_id != ${prodUser}
    OR experiment_id NOT IN (SELECT id FROM keep_editorial_experiments);

DELETE FROM editorial_experiment_variants
 WHERE user_id != ${prodUser}
    OR experiment_id NOT IN (SELECT id FROM keep_editorial_experiments);

DELETE FROM editorial_experiments WHERE user_id != ${prodUser};

UPDATE editorial_experiments
   SET promoted_edition_id = NULL
 WHERE promoted_edition_id IS NOT NULL
   AND promoted_edition_id NOT IN (SELECT id FROM keep_daily_editions);

DELETE FROM editorial_feedback_events
 WHERE user_id != ${prodUser}
    OR edition_id NOT IN (SELECT id FROM keep_daily_editions);

DELETE FROM editorial_runs WHERE user_id != ${prodUser};

UPDATE editorial_runs
   SET edition_id = NULL
 WHERE edition_id IS NOT NULL
   AND edition_id NOT IN (SELECT id FROM keep_daily_editions);

DELETE FROM daily_editions WHERE user_id != ${prodUser};

DELETE FROM people_daily_active_editions
 WHERE user_id != ${prodUser}
    OR edition_id NOT IN (SELECT id FROM keep_people_daily_editions);

DELETE FROM people_daily_builds WHERE user_id != ${prodUser};

UPDATE people_daily_builds
   SET edition_id = NULL
 WHERE edition_id IS NOT NULL
   AND edition_id NOT IN (SELECT id FROM keep_people_daily_editions);

DELETE FROM people_daily_editions WHERE user_id != ${prodUser};

DELETE FROM home_screen_sections
 WHERE user_id != ${prodUser}
    OR (collection_id IS NOT NULL AND collection_id NOT IN (SELECT id FROM keep_collections));

DELETE FROM person_social_profiles
 WHERE user_id != ${prodUser}
    OR user_person_id NOT IN (SELECT id FROM user_people WHERE user_id = ${prodUser});

DELETE FROM user_person_mentions
 WHERE user_id != ${prodUser}
    OR user_item_id NOT IN (SELECT id FROM keep_user_items)
    OR user_person_id NOT IN (SELECT id FROM user_people WHERE user_id = ${prodUser})
    OR item_id NOT IN (SELECT id FROM keep_items)
    OR item_enrichment_id NOT IN (SELECT id FROM keep_item_enrichments);

DELETE FROM user_people WHERE user_id != ${prodUser};

DELETE FROM collection_item_overrides
 WHERE collection_id NOT IN (SELECT id FROM keep_collections)
    OR user_item_id NOT IN (SELECT id FROM keep_user_items);

DELETE FROM home_collection_sections
 WHERE user_id != ${prodUser}
    OR collection_id NOT IN (SELECT id FROM keep_collections);

DELETE FROM user_item_tags
 WHERE user_item_id NOT IN (SELECT id FROM keep_user_items)
    OR tag_id NOT IN (SELECT id FROM keep_tags);

DELETE FROM user_item_consumption_events
 WHERE user_id != ${prodUser}
    OR user_item_id NOT IN (SELECT id FROM keep_user_items)
    OR item_id NOT IN (SELECT id FROM keep_items);

DELETE FROM user_item_enrichments
 WHERE user_id != ${prodUser}
    OR user_item_id NOT IN (SELECT id FROM keep_user_items)
    OR item_id NOT IN (SELECT id FROM keep_items);

DELETE FROM x_bookmark_items
 WHERE user_id != ${prodUser}
    OR item_id NOT IN (SELECT id FROM keep_items);

DELETE FROM x_bookmark_syncs
 WHERE user_id != ${prodUser}
    OR provider_connection_id NOT IN (SELECT id FROM keep_provider_connections);

DELETE FROM newsletter_feed_messages
 WHERE user_id != ${prodUser}
    OR gmail_mailbox_id NOT IN (SELECT id FROM keep_gmail_mailboxes)
    OR newsletter_feed_id NOT IN (SELECT id FROM keep_newsletter_feeds)
    OR item_id NOT IN (SELECT id FROM keep_items);

DELETE FROM newsletter_feeds
 WHERE user_id != ${prodUser}
    OR gmail_mailbox_id NOT IN (SELECT id FROM keep_gmail_mailboxes);

DELETE FROM gmail_mailboxes
 WHERE user_id != ${prodUser}
    OR provider_connection_id NOT IN (SELECT id FROM keep_provider_connections);

DELETE FROM provider_items_seen WHERE user_id != ${prodUser};
DELETE FROM user_notifications WHERE user_id != ${prodUser};

DELETE FROM subscription_items
 WHERE subscription_id NOT IN (SELECT id FROM keep_subscriptions)
    OR item_id NOT IN (SELECT id FROM keep_items);

DELETE FROM subscriptions WHERE user_id != ${prodUser};

DELETE FROM rss_feed_items
 WHERE rss_feed_id NOT IN (SELECT id FROM keep_rss_feeds)
    OR item_id NOT IN (SELECT id FROM keep_items);

DELETE FROM rss_feeds WHERE user_id != ${prodUser};
DELETE FROM tags WHERE user_id != ${prodUser};
DELETE FROM collections WHERE user_id != ${prodUser};
DELETE FROM sources WHERE user_id != ${prodUser};
DELETE FROM provider_connections WHERE user_id != ${prodUser};
DELETE FROM user_items WHERE user_id != ${prodUser};

DELETE FROM item_enrichments WHERE item_id NOT IN (SELECT id FROM keep_items);
DELETE FROM items WHERE id NOT IN (SELECT id FROM keep_items);
DELETE FROM creators WHERE id NOT IN (SELECT id FROM keep_creators);
DELETE FROM users WHERE id != ${prodUser};

UPDATE users SET id = ${localUser}, email = ${localEmail} WHERE id = ${prodUser};

UPDATE user_items SET user_id = ${localUser};
UPDATE user_item_consumption_events SET user_id = ${localUser};
UPDATE tags SET user_id = ${localUser};
UPDATE collections SET user_id = ${localUser};
UPDATE home_collection_sections SET user_id = ${localUser};
UPDATE user_item_enrichments SET user_id = ${localUser};
UPDATE user_people SET user_id = ${localUser};
UPDATE user_person_mentions SET user_id = ${localUser};
UPDATE sources SET user_id = ${localUser};
UPDATE provider_connections SET user_id = ${localUser};
UPDATE x_bookmark_syncs SET user_id = ${localUser};
UPDATE x_bookmark_items SET user_id = ${localUser};
UPDATE gmail_mailboxes SET user_id = ${localUser};
UPDATE newsletter_feeds SET user_id = ${localUser};
UPDATE newsletter_feed_messages SET user_id = ${localUser};
UPDATE rss_feeds SET user_id = ${localUser};
UPDATE subscriptions SET user_id = ${localUser};
UPDATE user_notifications SET user_id = ${localUser};
UPDATE provider_items_seen SET user_id = ${localUser};
UPDATE person_social_profiles SET user_id = ${localUser};
UPDATE home_screen_sections SET user_id = ${localUser};
UPDATE daily_editions SET user_id = ${localUser};
UPDATE editorial_runs SET user_id = ${localUser};
UPDATE editorial_feedback_events SET user_id = ${localUser};
UPDATE editorial_experiments SET user_id = ${localUser};
UPDATE editorial_experiment_variants SET user_id = ${localUser};
UPDATE editorial_experiment_reviews SET user_id = ${localUser};
UPDATE people_daily_editions SET user_id = ${localUser};
UPDATE people_daily_builds SET user_id = ${localUser};
UPDATE people_daily_active_editions SET user_id = ${localUser};

UPDATE provider_connections
   SET provider_user_id = 'local-redacted-' || lower(provider),
       access_token = 'local-redacted-access-token',
       refresh_token = 'local-redacted-refresh-token',
       token_expires_at = 0,
       status = 'EXPIRED',
       last_refreshed_at = NULL;

UPDATE x_bookmark_syncs
   SET status = 'IDLE',
       daily_sync_enabled = 0,
       last_cursor = NULL,
       last_error = NULL,
       rate_limited_until = NULL;

UPDATE gmail_mailboxes
   SET google_sub = 'local-redacted-google-sub',
       email = ${localEmail},
       history_id = NULL,
       watch_expiration_at = NULL,
       last_sync_status = 'IDLE',
       last_sync_error = NULL;

UPDATE newsletter_feeds
   SET canonical_key = 'local-newsletter-' || id,
       list_id = NULL,
       from_address = CASE
         WHEN from_address IS NULL THEN NULL
         ELSE 'newsletter-' || substr(id, 1, 8) || '@example.com'
       END,
       unsubscribe_mailto = NULL,
       unsubscribe_url = NULL,
       unsubscribe_post_header = NULL;

UPDATE newsletter_feed_messages
   SET gmail_message_id = 'local-message-' || id,
       gmail_thread_id = CASE
         WHEN gmail_thread_id IS NULL THEN NULL
         ELSE 'local-thread-' || id
       END;

UPDATE items
   SET raw_metadata = NULL${articleContentKeyReset};

UPDATE user_notifications SET data = NULL;
UPDATE rss_feeds SET last_error = NULL;
UPDATE item_enrichments SET error_message = NULL;
UPDATE user_item_enrichments SET error_message = NULL;

`
  );

  const foreignKeyViolations = runSqlite(RAW_DB, 'PRAGMA foreign_key_check;').trim();
  if (foreignKeyViolations) {
    const preview = foreignKeyViolations.split('\n').slice(0, 20).join('\n');
    throw new Error(`Sanitized snapshot has foreign key violations:\n${preview}`);
  }
}

export function collectArticleBodyObjects(db) {
  return db
    .query(
      `
SELECT object_key AS objectKey,
       CASE WHEN object_key LIKE '%.json' THEN 'application/json; charset=utf-8'
            ELSE 'text/html; charset=utf-8'
        END AS contentType
  FROM (
    SELECT DISTINCT versions.r2_key AS object_key
      FROM article_body_states states
      JOIN article_body_versions versions ON versions.id = states.current_version_id
     WHERE versions.r2_key IS NOT NULL
    UNION
    SELECT DISTINCT article_content_key AS object_key
      FROM items
     WHERE article_content_key IS NOT NULL
  )
 ORDER BY object_key
`
    )
    .all();
}

function articleBodyFilePath(objectKey) {
  const digest = createHash('sha256').update(objectKey).digest('hex');
  const extension = objectKey.endsWith('.json') ? '.json' : '.html';
  return join(ARTICLE_BODIES_DIR, `${digest}${extension}`);
}

async function downloadArticleBodies() {
  if (!includeArticleBodies) return [];

  const db = new Database(RAW_DB, { readonly: true });
  let objects;
  try {
    objects = collectArticleBodyObjects(db);
  } finally {
    db.close();
  }

  if (!skipExport) {
    rmSync(ARTICLE_BODIES_DIR, { recursive: true, force: true });
  }
  mkdirSync(ARTICLE_BODIES_DIR, { recursive: true });

  if (objects.length === 0) {
    console.log('No article body objects are referenced by the sanitized snapshot.');
    return [];
  }

  console.log(
    `Downloading ${objects.length} referenced article body objects from production R2...`
  );
  let completed = 0;
  let reused = 0;
  await mapWithConcurrency(objects, ARTICLE_BODY_TRANSFER_CONCURRENCY, async (object) => {
    const filePath = articleBodyFilePath(object.objectKey);
    const canReuse = skipExport && existsSync(filePath) && statSync(filePath).size > 0;
    if (canReuse) {
      reused += 1;
    } else {
      await runCapturedAsync(
        'bun',
        [
          'wrangler',
          'r2',
          'object',
          'get',
          `${PROD_ARTICLE_BUCKET}/${object.objectKey}`,
          '--env',
          PROD_ENV,
          '--file',
          filePath,
        ],
        { cwd: WORKER_DIR }
      );
    }
    completed += 1;
    if (completed % 25 === 0 || completed === objects.length) {
      console.log(`Downloaded ${completed}/${objects.length} article body objects.`);
    }
  });
  if (reused > 0) {
    console.log(`Reused ${reused} previously downloaded article body objects.`);
  }

  return objects.map((object) => ({ ...object, filePath: articleBodyFilePath(object.objectKey) }));
}

async function restoreLocalArticleBodies(objects) {
  if (!includeArticleBodies || objects.length === 0) return;

  console.log(`Restoring ${objects.length} article body objects into local R2...`);
  let completed = 0;
  await mapWithConcurrency(objects, LOCAL_R2_RESTORE_CONCURRENCY, async (object) => {
    await runCapturedAsync(
      'bun',
      [
        'wrangler',
        'r2',
        'object',
        'put',
        `${LOCAL_ARTICLE_BUCKET}/${object.objectKey}`,
        '--file',
        object.filePath,
        '--content-type',
        object.contentType,
        '--local',
        '--persist-to',
        STAGED_STATE_DIR,
      ],
      { cwd: WORKER_DIR }
    );
    completed += 1;
    if (completed % 25 === 0 || completed === objects.length) {
      console.log(`Restored ${completed}/${objects.length} article body objects.`);
    }
  });
}

function markRepoMigrationsApplied() {
  const migrationNames = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const values = migrationNames.map((name) => `(${sqlString(name)})`).join(',\n  ');

  runSqlite(
    RAW_DB,
    `
INSERT OR IGNORE INTO d1_migrations (name)
VALUES
  ${values};
`
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Uint8Array) {
    return `X'${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}'`;
  }
  return sqlString(value);
}

function dumpSanitizedSql() {
  const db = new Database(RAW_DB, { readonly: true });
  try {
    const schemaRows = db
      .query(
        `
SELECT type, name, tbl_name, sql
  FROM sqlite_schema
 WHERE sql IS NOT NULL
   AND name NOT LIKE 'sqlite_%'
 ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 2 ELSE 3 END, rowid
`
      )
      .all();

    const tableRows = schemaRows.filter((row) => row.type === 'table');
    const indexRows = schemaRows.filter((row) => row.type === 'index');
    const lines = ['PRAGMA foreign_keys=OFF;'];

    for (const row of tableRows) {
      lines.push(`${row.sql};`);
    }

    for (const table of tableRows) {
      const tableName = table.name;
      const columns = db.query(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
      const columnNames = columns.map((column) => column.name);
      if (columnNames.length === 0) continue;

      const selectSql = `SELECT ${columnNames
        .map((name) => quoteIdentifier(name))
        .join(', ')} FROM ${quoteIdentifier(tableName)}`;
      const rows = db.query(selectSql).all();
      if (rows.length === 0) continue;

      const insertPrefix = `INSERT INTO ${quoteIdentifier(tableName)} (${columnNames
        .map((name) => quoteIdentifier(name))
        .join(', ')}) VALUES`;

      for (const row of rows) {
        const values = columnNames.map((name) => sqlValue(row[name])).join(', ');
        lines.push(`${insertPrefix} (${values});`);
      }
    }

    for (const row of indexRows) {
      lines.push(`${row.sql};`);
    }

    writeFileSync(SANITIZED_SQL, `${lines.join('\n')}\n`);
  } finally {
    db.close();
  }
}

function installStagedLocalState() {
  if (skipRestore) return;

  if (existsSync(STATE_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const backupPath = join(BACKUP_DIR, `state-${stamp}`);
    renameSync(STATE_DIR, backupPath);
    console.log(`Backed up existing local Wrangler state to ${backupPath}`);
  }

  renameSync(STAGED_STATE_DIR, STATE_DIR);
  console.log('Installed the staged local Wrangler state.');
}

function buildStagedLocalD1() {
  if (skipRestore) {
    console.log(`Skipping local restore. Sanitized SQL is at ${SANITIZED_SQL}`);
    return;
  }

  rmSync(STAGED_STATE_DIR, { recursive: true, force: true });
  runCaptured(
    'bun',
    [
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--local',
      '--persist-to',
      STAGED_STATE_DIR,
      '--file',
      SANITIZED_SQL,
    ],
    {
      cwd: WORKER_DIR,
      successMessage: 'Staged local D1 snapshot imported.',
    }
  );
  runCaptured(
    'bun',
    ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', STAGED_STATE_DIR],
    {
      cwd: WORKER_DIR,
      successMessage: 'Staged local D1 migrations are marked current.',
    }
  );
}

function cleanupRawArtifacts() {
  if (keepRaw) {
    console.log(`Keeping raw production export artifacts in ${SNAPSHOT_DIR}.`);
    return;
  }

  rmSync(RAW_SQL, { force: true });
  rmSync(RAW_DB, { force: true });
  rmSync(ARTICLE_BODIES_DIR, { recursive: true, force: true });
}

function printCounts() {
  const counts = runSqlite(
    RAW_DB,
    `
.mode column
SELECT 'users' AS table_name, count(*) AS count FROM users
UNION ALL SELECT 'items', count(*) FROM items
UNION ALL SELECT 'user_items', count(*) FROM user_items
UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions
UNION ALL SELECT 'provider_connections', count(*) FROM provider_connections
UNION ALL SELECT 'rss_feeds', count(*) FROM rss_feeds
UNION ALL SELECT 'gmail_mailboxes', count(*) FROM gmail_mailboxes;
`
  );
  console.log(counts.trim());
}

async function main() {
  assertLocalDevStackStopped();
  await confirmDestructiveLocalRestore();
  ensureTools();
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  exportProductionD1();
  buildRawSqlite();
  sanitizeSqlite();
  markRepoMigrationsApplied();
  dumpSanitizedSql();
  printCounts();
  const articleBodyObjects = await downloadArticleBodies();
  buildStagedLocalD1();
  await restoreLocalArticleBodies(articleBodyObjects);
  installStagedLocalState();
  cleanupRawArtifacts();
  console.log('');
  if (skipRestore) {
    console.log(`Sanitized snapshot generated for ${LOCAL_USER_ID}.`);
  } else {
    console.log(`Sanitized local snapshot restored for ${LOCAL_USER_ID}.`);
  }
  if (includeArticleBodies) {
    console.log(
      `Restored ${articleBodyObjects.length} referenced article body objects to local R2.`
    );
  }
  console.log(`Sanitized SQL is at ${SANITIZED_SQL}.`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
