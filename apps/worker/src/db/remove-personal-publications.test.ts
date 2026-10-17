import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';

// The migration never calls providers; avoid loading their Node-only SDKs in workerd.
vi.mock('googleapis', () => ({ google: {} }));

const bindings = env as unknown as {
  DB: D1Database;
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

it('retires populated publication tables without deleting saved content or reading history', async () => {
  const { DB, TEST_MIGRATIONS } = bindings;
  const retirement = TEST_MIGRATIONS.find((migration) => migration.name.startsWith('0040_'))!;
  expect(retirement).toBeDefined();
  await applyD1Migrations(
    DB,
    TEST_MIGRATIONS.filter((migration) => migration !== retirement)
  );
  const statements = [
    "INSERT INTO users(id,created_at,updated_at) VALUES('owner','now','now')",
    "INSERT INTO items(id,content_type,provider,provider_id,canonical_url,title,created_at,updated_at) VALUES('item','ARTICLE','RSS','source','https://example.com','Saved article','now','now')",
    "INSERT INTO user_items(id,user_id,item_id,state,ingested_at,created_at,updated_at) VALUES('bookmark','owner','item','BOOKMARKED','now','now','now')",
    "INSERT INTO user_item_consumption_events(id,user_id,user_item_id,item_id,event_type,occurred_at,source) VALUES('read','owner','bookmark','item','FINISHED',1,'MANUAL_FINISH_TOGGLE')",
    "INSERT INTO personal_publications(id,owner_id,handle,editor_name,created_at) VALUES('pub','owner','owner','Owner',1)",
    "INSERT INTO personal_issues(id,publication_id,kind,created_at) VALUES('issue','pub','INDEPENDENT',1)",
    "INSERT INTO personal_issue_sections(id,issue_id,position) VALUES('section','issue',0)",
    "INSERT INTO personal_issue_selections(id,issue_id,section_id,item_id,metadata_json,source_fingerprint,position) VALUES('selection','issue','section','item','{}','fingerprint',0)",
    "INSERT INTO personal_publication_events(id,publication_id,issue_id,revision,kind,selection_ids_json,occurred_at) VALUES('event','pub','issue',1,'ISSUE_PUBLISHED','[]',1)",
    "INSERT INTO personal_publication_fanout(event_id) VALUES('event')",
    "INSERT INTO personal_publication_outbox(event_id,next_attempt_at) VALUES('event',1)",
    "INSERT INTO personal_publication_subscriptions(publication_id,subscriber_id,subscribed_at) VALUES('pub','owner',1)",
    "INSERT INTO personal_issue_visits(reader_id,issue_id,last_seen_revision,presented_at) VALUES('owner','issue',1,1)",
    "INSERT INTO personal_publication_activity(id,recipient_id,publication_id,generation,logical_key,kind,issue_ids_json,selection_ids_json,created_at) VALUES('activity','owner','pub',1,'key','ISSUE_PUBLISHED','[]','[]',1)",
    "INSERT INTO personal_push_installations(id,owner_id,token,environment,topic,updated_at) VALUES('install','owner','test','sandbox','app.zine.native',1)",
    "INSERT INTO personal_push_jobs(id,activity_id,installation_id,token_version,state,next_attempt_at) VALUES('push','activity','install',1,'PENDING',1)",
    "INSERT INTO weekly_recap_windows(id,user_id,week_start,timezone,start_at,end_at,generated_at,snapshot) VALUES('week','owner','2026-10-05','UTC',1,2,3,'{}')",
    "INSERT INTO weekly_recap_draft_requests(user_id,key,request_hash,window_id,title,saved_ids) VALUES('owner','request','hash','week','Week','[]')",
  ];
  await DB.batch(statements.map((statement) => DB.prepare(statement)));
  await applyD1Migrations(DB, [retirement]);

  const tables = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{
    name: string;
  }>();
  expect(tables.results.filter(({ name }) => /^(personal_|weekly_recap_)/.test(name))).toEqual([]);
  expect(await DB.prepare("SELECT title FROM items WHERE id='item'").first('title')).toBe(
    'Saved article'
  );
  expect(await DB.prepare("SELECT state FROM user_items WHERE id='bookmark'").first('state')).toBe(
    'BOOKMARKED'
  );
  expect(
    await DB.prepare("SELECT event_type FROM user_item_consumption_events WHERE id='read'").first(
      'event_type'
    )
  ).toBe('FINISHED');
  const feedbackColumns = await DB.prepare('PRAGMA table_info(editorial_feedback_events)').all<{
    name: string;
  }>();
  expect(feedbackColumns.results.some(({ name }) => name === 'target_source_snapshot_json')).toBe(
    false
  );
  expect((await DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
