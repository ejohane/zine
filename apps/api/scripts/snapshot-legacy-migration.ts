/** Capture owner-scoped migration inputs without exporting connection or token tables. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflare } from './cloudflare-control';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const database = '82911dea-5a6b-411b-ab4b-4145cb0c191d';
const [runName, ...extra] = process.argv.slice(2);
assert.ok(
  runName && /^[a-zA-Z0-9-]+$/.test(runName) && !extra.length,
  'Provide a new snapshot name'
);
const directory = resolve('.local-data/legacy-migration', runName);
const startedAt = new Date().toISOString();
const queries = {
  items: `SELECT u.id,u.item_id,u.state,u.ingested_at,u.bookmarked_at,u.archived_at,u.last_opened_at,
    u.handoff_url,u.progress_position,u.progress_duration,u.progress_updated_at,u.is_finished,
    u.finished_at,u.created_at,u.updated_at,i.provider,i.provider_id,i.canonical_url,i.content_type,
    i.title,i.summary,i.publisher,i.thumbnail_url,i.duration,i.published_at,i.podcast_destinations,
    i.word_count,i.reading_time_minutes,i.article_content_key,i.created_at AS content_created_at,
    i.updated_at AS content_updated_at,c.name AS creator_name,c.image_url AS creator_image_url,
    a.current_version_id AS current_article_version_id
    FROM user_items u JOIN items i ON i.id=u.item_id LEFT JOIN creators c ON c.id=i.creator_id
    LEFT JOIN article_body_states a ON a.item_id=i.id WHERE u.user_id=? ORDER BY u.id`,
  articleVersions: `SELECT b.* FROM article_body_versions b JOIN user_items u ON u.item_id=b.item_id
    WHERE u.user_id=? ORDER BY b.id`,
  tags: 'SELECT * FROM tags WHERE user_id=? ORDER BY id',
  tagAssignments: `SELECT a.* FROM user_item_tags a JOIN user_items u ON u.id=a.user_item_id
    JOIN tags t ON t.id=a.tag_id AND t.user_id=u.user_id WHERE u.user_id=? ORDER BY a.id`,
  collections: 'SELECT * FROM collections WHERE user_id=? ORDER BY id',
  collectionOverrides: `SELECT o.* FROM collection_item_overrides o JOIN collections c ON c.id=o.collection_id
    JOIN user_items u ON u.id=o.user_item_id AND u.user_id=c.user_id WHERE c.user_id=? ORDER BY o.id`,
  consumption: `SELECT id,user_item_id,item_id,event_type,occurred_at,position_seconds,duration_seconds,
    delta_seconds,source,metadata FROM user_item_consumption_events WHERE user_id=? ORDER BY id`,
  itemUnderstanding: `SELECT e.id,e.item_id,e.schema_version,e.content_hash,e.status,e.model_provider,e.model_name,
    e.summary_short,e.summary_detail,e.primary_category,e.secondary_categories_json,e.topics_json,e.entities_json,
    e.intent,e.difficulty,e.evergreen_score,e.time_sensitivity,e.confidence_json,e.source_coverage,e.source_kind,
    e.source_content_hash,e.source_word_count,e.source_quality_score,e.source_quality_warnings_json,
    e.understanding_json,e.created_at,e.updated_at,e.enriched_at FROM item_enrichments e
    JOIN user_items u ON u.item_id=e.item_id WHERE u.user_id=? ORDER BY e.id`,
  personalUnderstanding: `SELECT id,user_item_id,item_id,schema_version,suggested_tags_json,inferred_save_intent,
    reason_to_revisit,status,created_at,updated_at,enriched_at FROM user_item_enrichments
    WHERE user_id=? ORDER BY id`,
  subscriptions: `SELECT s.*, c.name AS creator_name,c.image_url AS creator_image_url FROM subscriptions s
    LEFT JOIN creators c ON c.id=s.creator_id WHERE s.user_id=? ORDER BY s.id`,
  subscriptionItems: `SELECT i.* FROM subscription_items i JOIN subscriptions s ON s.id=i.subscription_id
    WHERE s.user_id=? ORDER BY i.id`,
  rssFeeds: `SELECT id,feed_url,title,description,site_url,image_url,feed_type,baseline_entry_ids_json,
    source_url,source_player,last_polled_at,last_success_at,last_error_at,error_count,status,
    poll_interval_seconds,auto_bookmark,created_at,updated_at FROM rss_feeds WHERE user_id=? ORDER BY id`,
  rssItems: `SELECT i.* FROM rss_feed_items i JOIN rss_feeds f ON f.id=i.rss_feed_id
    WHERE f.user_id=? ORDER BY i.id`,
  newsletterFeeds: `SELECT id,display_name,status,auto_bookmark,first_seen_at,last_seen_at,created_at,updated_at
    FROM newsletter_feeds WHERE user_id=? ORDER BY id`,
  newsletterItems: `SELECT id,newsletter_feed_id,item_id,internal_date,created_at FROM newsletter_feed_messages
    WHERE user_id=? ORDER BY id`,
} as const;

await mkdir(resolve(directory, '..'), { mode: 0o700, recursive: true });
await mkdir(directory, { mode: 0o700 });
const sections: Record<string, { count: number; sha256: string }> = {};
for (const [name, query] of Object.entries(queries)) {
  const rows = [];
  let after = '';
  for (;;) {
    // A live export is a bounded observation. Keyset paging prevents preceding
    // inserts/deletes from shifting a later page's boundary.
    const [page] = await cloudflare<{ success: boolean; results: { id: string }[] }[]>(
      `d1/database/${database}/query`,
      'POST',
      { sql: `SELECT * FROM (${query}) WHERE id > ? ORDER BY id LIMIT 250`, params: [owner, after] }
    );
    assert.ok(page?.success);
    rows.push(...page.results);
    if (page.results.length < 250) break;
    after = page.results.at(-1)!.id;
  }
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, `Duplicate IDs in ${name}`);
  const body = JSON.stringify(rows);
  sections[name] = { count: rows.length, sha256: createHash('sha256').update(body).digest('hex') };
  await writeFile(resolve(directory, name + '.json'), body, { mode: 0o600, flag: 'wx' });
}
await writeFile(
  resolve(directory, 'manifest.json'),
  JSON.stringify({ owner, database, startedAt, completedAt: new Date().toISOString(), sections }),
  { mode: 0o600, flag: 'wx' }
);
console.log(
  JSON.stringify({
    snapshotWritten: true,
    counts: Object.fromEntries(
      Object.entries(sections).map(([name, section]) => [name, section.count])
    ),
  })
);
