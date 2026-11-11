/** Plan public subscription routes while preserving original creation and intake boundaries. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { identify, publicUrl } from '../src/identity';
import { stableId } from '../src/lib';
import { cloudflare, environments } from './cloudflare-control';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const [directory, mode, limitInput, ...extra] = process.argv.slice(2);
const limit = Number(limitInput);
assert.ok(directory && !extra.length);
assert.ok(
  (!mode && !limitInput) || (mode === '--apply' && Number.isSafeInteger(limit) && limit > 0)
);
const source = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')) as {
  owner: string;
  database: string;
  startedAt: string;
  sections: Record<string, { sha256: string; count: number }>;
};
assert.equal(source.owner, owner);
assert.equal(source.database, '82911dea-5a6b-411b-ab4b-4145cb0c191d');
assert.equal(new Date(source.startedAt).toISOString(), source.startedAt);
async function section<T>(name: string) {
  const bytes = await readFile(resolve(directory, name + '.json'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sections[name].sha256);
  const rows = JSON.parse(bytes.toString()) as T[];
  assert.equal(rows.length, source.sections[name].count);
  return rows;
}
type Common = {
  id: string;
  status: string;
  auto_bookmark: number;
  created_at: number;
  updated_at: number;
};
const [channels, feeds, newsletters] = await Promise.all([
  section<Common & { provider: string; provider_channel_id: string; creator_name: string | null }>(
    'subscriptions'
  ),
  section<
    Common & {
      feed_url: string;
      title: string | null;
      site_url: string | null;
      last_success_at: number | null;
    }
  >('rssFeeds'),
  section<{ status: string }>('newsletterFeeds'),
]);
const rows = [
  ...channels.flatMap((row) => {
    if (row.provider === 'YOUTUBE') {
      assert.match(row.provider_channel_id, /^UC[A-Za-z0-9_-]+$/);
      const url = 'https://www.youtube.com/channel/' + row.provider_channel_id;
      return [
        {
          ...row,
          section: 'subscriptions',
          platform: 'youtube',
          url,
          route: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + row.provider_channel_id,
          routeKind: 'youtube_feed',
          name: row.creator_name,
          lastSuccessAt: null,
        },
      ];
    }
    assert.equal(row.provider, 'SPOTIFY');
    const identity = identify('https://open.spotify.com/show/' + row.provider_channel_id);
    assert.equal(identity.kind, 'show');
    return [
      {
        ...row,
        section: 'subscriptions',
        platform: 'spotify',
        url: identity.url,
        route: identity.url,
        routeKind: 'spotify_show',
        name: row.creator_name,
        lastSuccessAt: null,
      },
    ];
  }),
  ...feeds.map((row) => {
    const route = publicUrl(row.feed_url).href;
    const url = row.site_url ? publicUrl(row.site_url).href : route;
    return {
      ...row,
      section: 'rssFeeds',
      platform: 'web',
      url,
      route,
      routeKind: 'feed',
      name: row.title,
      lastSuccessAt: row.last_success_at,
    };
  }),
];
const path = `d1/database/${environments.production.databaseId}/query`;
async function query<T>(sql: string, params: string[] = [owner]) {
  const [result] = await cloudflare<{ success: boolean; results: T[] }[]>(path, 'POST', {
    sql,
    params,
  });
  assert.ok(result?.success);
  return result.results;
}
const existing = await query<{
  id: string;
  url: string;
  status: string;
}>(`SELECT s.id,r.url,s.status
  FROM subscriptions s JOIN source_routes r ON r.id=s.route_id WHERE s.owner_id=?`);
const byRoute = new Map(existing.map((row) => [publicUrl(row.url).href, row]));
const eligible = rows.filter((row) => !byRoute.has(publicUrl(row.route).href));
const q = (value: string | number | null) => {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value));
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
};
if (mode) {
  const ownerSql = q(owner);
  let writes = 0;
  for (const row of eligible.slice(0, limit)) {
    const id = await stableId('sub', owner, 'legacy-library', row.section, row.id);
    const sourceId = await stableId('src', owner, row.url);
    const routeId = await stableId('route', sourceId, row.route);
    const created = new Date(row.created_at).toISOString();
    const updated = new Date(row.updated_at).toISOString();
    const lastSuccess =
      row.lastSuccessAt === null ? null : new Date(row.lastSuccessAt).toISOString();
    const active = row.status === 'ACTIVE';
    const guard = q('legacy-subscription-' + randomUUID());
    const sql = [
      `INSERT INTO write_guards(id,valid) VALUES(${guard}, CASE WHEN
        COALESCE((SELECT generation FROM owner_generations WHERE owner_id=${ownerSql}),0)=0
        AND NOT EXISTS(SELECT 1 FROM subscriptions s JOIN source_routes r ON r.id=s.route_id
          WHERE s.owner_id=${ownerSql} AND r.url=${q(row.route)}) THEN 1 ELSE 0 END)`,
      `INSERT OR IGNORE INTO sources(id,owner_id,identity_key,platform,url,name,created_at)
        VALUES(${[sourceId, owner, row.url, row.platform, row.url, row.name, created].map(q).join(',')})`,
      `INSERT OR IGNORE INTO source_routes(id,source_id,url,kind)
        VALUES(${[routeId, sourceId, row.route, row.routeKind].map(q).join(',')})`,
      `INSERT INTO subscriptions(id,owner_id,source_id,route_id,auto_save,filters_json,status,initialized,
        next_poll_at,last_success_at,created_at,updated_at,intake_since_at)
        VALUES(${[
          id,
          owner,
          sourceId,
          routeId,
          row.auto_bookmark,
          '{}',
          active ? 'active' : 'unsubscribed',
          1,
          new Date(Date.now() + (5 + (writes % 20) * 3) * 60000).toISOString(),
          lastSuccess,
          created,
          updated,
          source.startedAt,
        ]
          .map(q)
          .join(',')})`,
      `DELETE FROM write_guards WHERE id=${guard}`,
    ].join(';\n');
    const result = await cloudflare<{ success: boolean }[]>(path, 'POST', { sql });
    assert.ok(result.every((entry) => entry.success));
    const [readback] = await query<{
      created_at: string;
      intake_since_at: string;
      auto_save: number;
      status: string;
    }>(
      'SELECT created_at,intake_since_at,auto_save,status FROM subscriptions WHERE owner_id=? AND id=?',
      [owner, id]
    );
    assert.deepEqual(readback, {
      created_at: created,
      intake_since_at: source.startedAt,
      auto_save: row.auto_bookmark,
      status: active ? 'active' : 'unsubscribed',
    });
    writes++;
  }
  console.log(
    JSON.stringify({
      mode: 'apply-and-readback',
      verified: writes,
      existingRoutesPreserved: existing.length,
    })
  );
} else {
  console.log(
    JSON.stringify({
      mode: 'dry-run',
      publicSourceDefinitions: rows.length,
      newRoutes: eligible.length,
      existingRouteMatches: rows.length - eligible.length,
      activeNewRoutes: eligible.filter((row) => row.status === 'ACTIVE').length,
      newsletterDefinitions: newsletters.length,
      activeNewslettersRequiringConnectorAndConsent: newsletters.filter(
        (row) => row.status === 'ACTIVE'
      ).length,
    })
  );
}
