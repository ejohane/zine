import { Hono } from 'hono';
import { z } from 'zod4';
import { requiredScope } from './permissions';
import { all, ApiError, now, stmt } from './lib';
import type { AppEnv, Env } from './types';

// Explicit export projections exclude access-token hashes and encrypted grants.
// Cursors enumerate a live library, not an implicit point-in-time snapshot.
const sections: Record<string, string> = {
  items:
    'SELECT p.*,p.id AS exportKey,c.canonical_url,c.platform,c.kind FROM personal_items p JOIN content_items c ON c.id=p.content_id WHERE p.owner_id=?',
  occurrences: 'SELECT o.*,o.id AS exportKey FROM save_occurrences o WHERE o.owner_id=?',
  context:
    'SELECT d.*,d.id AS exportKey FROM context_entries d JOIN personal_items p ON p.id=d.item_id WHERE p.owner_id=?',
  tags: "SELECT d.*,d.item_id||':'||d.tag AS exportKey FROM item_tags d JOIN personal_items p ON p.id=d.item_id WHERE p.owner_id=?",
  progress:
    'SELECT d.*,d.item_id AS exportKey FROM progress d JOIN personal_items p ON p.id=d.item_id WHERE p.owner_id=?',
  annotations:
    'SELECT d.*,d.id AS exportKey FROM annotations d JOIN personal_items p ON p.id=d.item_id WHERE p.owner_id=?',
  collections: 'SELECT d.*,d.id AS exportKey FROM collections d WHERE d.owner_id=?',
  collectionMembers:
    "SELECT d.*,d.collection_id||':'||d.item_id AS exportKey FROM collection_members d JOIN collections c ON c.id=d.collection_id WHERE c.owner_id=?",
  collectionNotes:
    'SELECT d.*,d.id AS exportKey FROM collection_notes d JOIN collections c ON c.id=d.collection_id WHERE c.owner_id=?',
  collectionReferences:
    "SELECT r.*,r.note_id||':'||r.item_id AS exportKey FROM collection_note_references r JOIN collection_notes n ON n.id=r.note_id JOIN collections c ON c.id=n.collection_id WHERE c.owner_id=?",
  sources: 'SELECT d.*,d.id AS exportKey FROM sources d WHERE d.owner_id=?',
  routes:
    'SELECT d.*,d.id AS exportKey FROM source_routes d JOIN sources s ON s.id=d.source_id WHERE s.owner_id=?',
  subscriptions:
    'SELECT id,source_id,route_id,auto_save,filters_json,status,initialized,next_poll_at,last_success_at,last_error_code,created_at,updated_at,id AS exportKey FROM subscriptions WHERE owner_id=?',
  subscriptionSeen:
    "SELECT d.*,d.subscription_id||':'||d.entry_key AS exportKey FROM subscription_seen d JOIN subscriptions s ON s.id=d.subscription_id WHERE s.owner_id=?",
  enrichment: 'SELECT d.*,d.id AS exportKey FROM contributions d WHERE d.owner_id=?',
  components:
    "SELECT d.*,d.content_id||':'||d.component AS exportKey FROM enrichment_components d WHERE d.owner_id=?",
  events:
    'SELECT id,type,subject_id,data_json,occurred_at,id AS exportKey FROM service_events WHERE owner_id=?',
  webhooks:
    'SELECT id,url,enabled,created_at,updated_at,id AS exportKey FROM webhooks WHERE owner_id=?',
  connections:
    'SELECT provider,status,created_at,updated_at,provider AS exportKey FROM connections WHERE owner_id=?',
  relationships:
    'SELECT r.*,r.id AS exportKey,c.canonical_url AS target_url FROM item_relationships r JOIN content_items c ON c.id=r.target_content_id WHERE r.owner_id=?',
  aliases: 'SELECT a.*,a.alias_item_id AS exportKey FROM item_aliases a WHERE a.owner_id=?',
  reconciliations: 'SELECT r.*,r.id AS exportKey FROM reconciliation_events r WHERE r.owner_id=?',
};
export async function exportSection(
  env: Env,
  owner: string,
  section: string,
  cursor: string,
  limit: number
) {
  const sql = sections[section];
  if (!sql) throw new ApiError(404, 'export_section_not_found', 'Unknown export section');
  const rows = await all<
    Record<string, unknown> & {
      exportKey: string;
      artifact_key?: string | null;
      value_json?: string | null;
    }
  >(
    env.DB,
    `SELECT * FROM (${sql}) WHERE exportKey>? ORDER BY exportKey LIMIT ?`,
    owner,
    cursor,
    limit + 1
  );
  const page = rows.slice(0, limit);
  const records = [];
  for (const row of page) {
    const { artifact_key: artifactKey, value_json: rawValue, ...record } = row;
    Reflect.deleteProperty(record, 'exportKey');
    if (section === 'enrichment') {
      if (artifactKey) {
        const artifact = await env.ARTIFACTS.get(artifactKey);
        if (!artifact)
          throw new ApiError(
            503,
            'export_artifact_unavailable',
            'An export artifact is temporarily unavailable'
          );
        record.value = await artifact.json();
      } else record.value = rawValue ? JSON.parse(rawValue) : null;
    }
    for (const name of Object.keys(record))
      if (name.endsWith('_json') && typeof record[name] === 'string') {
        record[name.slice(0, -5)] = JSON.parse(record[name] as string);
        delete record[name];
      }
    records.push(record);
  }
  return {
    schemaVersion: 1,
    consistency: 'live',
    section,
    records,
    nextCursor: rows.length > limit ? page.at(-1)!.exportKey : null,
  };
}
export async function eraseAccountData(env: Env, owner: string) {
  const timestamp = now();
  const contentIds = JSON.stringify(
    (
      await all<{ content_id: string }>(
        env.DB,
        'SELECT content_id FROM personal_items WHERE owner_id=? UNION SELECT target_content_id AS content_id FROM item_relationships WHERE owner_id=?',
        owner,
        owner
      )
    ).map((row) => row.content_id)
  );
  const orphan =
    'id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM personal_items p WHERE p.content_id=content_items.id) AND NOT EXISTS(SELECT 1 FROM contributions d WHERE d.content_id=content_items.id) AND NOT EXISTS(SELECT 1 FROM item_relationships r WHERE r.target_content_id=content_items.id)';
  await env.DB.batch([
    stmt(
      env.DB,
      'INSERT INTO owner_generations(owner_id,generation) VALUES(?,(SELECT COALESCE(MAX(generation),0)+1 FROM personal_items WHERE owner_id=?)) ON CONFLICT(owner_id) DO UPDATE SET generation=MAX(owner_generations.generation+1,excluded.generation)',
      owner,
      owner
    ),
    stmt(
      env.DB,
      'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM contributions WHERE owner_id=? AND artifact_key IS NOT NULL',
      timestamp,
      owner
    ),
    stmt(
      env.DB,
      'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT p.artifact_key,? FROM subscription_snapshots p JOIN subscriptions s ON s.id=p.subscription_id WHERE s.owner_id=?',
      timestamp,
      owner
    ),
    stmt(
      env.DB,
      'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM understanding_artifacts WHERE owner_id=?',
      timestamp,
      owner
    ),
    stmt(env.DB, 'DELETE FROM understanding_artifacts WHERE owner_id=?', owner),
    stmt(
      env.DB,
      'INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at) SELECT artifact_key,? FROM material_artifacts WHERE owner_id=?',
      timestamp,
      owner
    ),
    stmt(env.DB, 'DELETE FROM material_artifacts WHERE owner_id=?', owner),
    ...[
      'event_retention',
      'webhook_deliveries',
      'webhooks',
      'operational_alerts',
      'api_tokens',
      'item_relationships',
      'item_aliases',
      'reconciliation_events',
      'connections',
      'jobs',
      'idempotency',
      'search_sessions',
      'search_documents',
      'contributions',
      'enrichment_components',
      'collections',
      'personal_items',
      'subscriptions',
    ].map((table) => stmt(env.DB, `DELETE FROM ${table} WHERE owner_id=?`, owner)),
    stmt(env.DB, 'DELETE FROM service_events WHERE owner_id=?', owner),
    stmt(env.DB, "DELETE FROM service_state WHERE name='ops_cursor' AND value=?", owner),
    stmt(
      env.DB,
      'DELETE FROM source_routes WHERE source_id IN(SELECT id FROM sources WHERE owner_id=?)',
      owner
    ),
    stmt(env.DB, 'DELETE FROM sources WHERE owner_id=?', owner),
    stmt(
      env.DB,
      `DELETE FROM content_aliases WHERE content_id IN(SELECT id FROM content_items WHERE ${orphan})`,
      contentIds
    ),
    stmt(
      env.DB,
      `DELETE FROM content_relationships WHERE from_id IN(SELECT id FROM content_items WHERE ${orphan}) OR to_id IN(SELECT id FROM content_items WHERE ${orphan})`,
      contentIds,
      contentIds
    ),
    stmt(env.DB, `DELETE FROM content_items WHERE ${orphan}`, contentIds),
  ]);
  return { authoritativeDataDeleted: true, derivedArtifactCleanup: 'queued', erasedAt: timestamp };
}
export const portabilityRoutes = new Hono<AppEnv>();
portabilityRoutes.get('/export', (c) =>
  c.json({
    schemaVersion: 1,
    consistency: 'live',
    sections: Object.keys(sections).filter((section) => {
      const scopes = c.get('principal').scopes;
      const required = requiredScope('GET', '/v1/export/' + section);
      return (
        scopes === undefined ||
        (required !== null && required !== 'unsupported' && scopes.includes(required))
      );
    }),
    credentialsIncluded: false,
    description:
      'Page each section; enrichment includes retained material. Concurrent library changes may be reflected between pages.',
  })
);
portabilityRoutes.get('/export/:section', async (c) => {
  const limit = z.coerce.number().int().min(1).max(10).default(10).parse(c.req.query('limit'));
  return c.json(
    await exportSection(
      c.env,
      c.get('principal').userId,
      c.req.param('section'),
      c.req.query('cursor') ?? '',
      limit
    )
  );
});
portabilityRoutes.delete('/account/data', async (c) => {
  if (c.get('principal').contributor.startsWith('api-token:'))
    throw new ApiError(
      403,
      'interactive_login_required',
      'Erase account data through interactive sign-in'
    );
  return c.json(await eraseAccountData(c.env, c.get('principal').userId));
});
