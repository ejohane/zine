const DEFAULT_TIMEZONE = 'America/Chicago';
const MAX_RUN_POSTS = 500;
const MAX_AUTHOR_POSTS = 500;

type ArchiveRunRow = {
  id: string;
  requested_count: number;
  collected_count: number;
  status: string;
  started_at: number;
  completed_at: number | null;
  excluded_ads: number;
  failure_reason: string | null;
};

type ArchivePostRow = {
  tweet_id: string;
  url: string;
  text: string;
  published_at: number | null;
  lang: string | null;
  kind: string;
  author_key: string;
  username: string;
  author_name: string;
  profile_url: string | null;
  profile_image_url: string | null;
  verified: number | null;
  media_json: string;
  links_json: string;
  metrics_json: string;
  first_seen_at: number;
  last_seen_at: number;
  position: number | null;
  observed_at: number | null;
  presentation: string | null;
  reposted_by_json: string | null;
};

type RelationshipRow = {
  source_tweet_id: string;
  relationship_type: string;
  target_tweet_id: string;
  target_url: string | null;
  target_text: string | null;
  target_author_key: string | null;
  target_username: string | null;
  target_author_name: string | null;
  target_profile_image_url: string | null;
};

type DailySourceRow = {
  source_id: string;
  source_type: 'FAVORITES' | 'LIST';
  name: string;
  is_selected: number;
  captured_at: number;
  author_key: string | null;
};

type DailySource = {
  id: string;
  type: 'FAVORITES' | 'LIST' | 'FOLLOWING_FALLBACK';
  name: string;
  selected: boolean;
  capturedAt: string | null;
  authorCount: number;
};

type DailyRelationship = {
  type: string;
  tweetId: string;
  url: string | null;
  target: {
    tweetId: string;
    text: string;
    url: string;
    author: {
      key: string;
      username: string;
      name: string;
      profileImageUrl: string | null;
    };
  } | null;
};

export type DailyPost = ReturnType<typeof publicPost>;

function parseJson(value: string | null, fallback: unknown): unknown {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function localDate(value: Date, timezone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function postTimestamp(row: ArchivePostRow): number {
  return row.published_at ?? row.observed_at ?? row.last_seen_at;
}

function publicPost(
  row: ArchivePostRow,
  sourceIds: string[],
  relationships: DailyRelationship[] = []
) {
  return {
    id: row.tweet_id,
    url: row.url,
    text: row.text,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
    kind: row.kind,
    author: {
      key: row.author_key,
      username: row.username,
      name: row.author_name,
      profileUrl: row.profile_url,
      profileImageUrl: row.profile_image_url,
      verified: row.verified === null ? null : Boolean(row.verified),
    },
    media: parseJson(row.media_json, []),
    links: parseJson(row.links_json, []),
    metrics: parseJson(row.metrics_json, {}),
    relationships,
    presentation: row.presentation ?? row.kind,
    repostedBy: parseJson(row.reposted_by_json, null),
    sourceIds,
  };
}

async function archiveRuns(db: D1Database, userId: string): Promise<ArchiveRunRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, requested_count, collected_count, status, started_at, completed_at,
        excluded_ads, failure_reason
       FROM x_timeline_runs
       WHERE user_id = ? AND status IN ('COMPLETE', 'PARTIAL') AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, id DESC LIMIT 60`
    )
    .bind(userId)
    .all<ArchiveRunRow>();
  return rows.results;
}

async function selectRun(
  db: D1Database,
  userId: string,
  date: string | undefined,
  timezone: string
): Promise<ArchiveRunRow | null> {
  const runs = await archiveRuns(db, userId);
  if (!date) return runs[0] ?? null;
  return (
    runs.find(
      (run) => localDate(new Date(run.completed_at ?? run.started_at), timezone) === date
    ) ?? null
  );
}

async function postsForRun(
  db: D1Database,
  userId: string,
  runId: string
): Promise<ArchivePostRow[]> {
  const rows = await db
    .prepare(
      `SELECT i.position, i.observed_at, i.presentation, i.reposted_by_json,
        p.tweet_id, p.url, p.text, p.published_at, p.lang, p.kind, p.author_key,
        a.username, a.name AS author_name, a.profile_url, a.profile_image_url, a.verified,
        p.media_json, p.links_json, p.metrics_json, p.first_seen_at, p.last_seen_at
       FROM x_timeline_run_items i
       JOIN x_posts p ON p.user_id = i.user_id AND p.tweet_id = i.tweet_id
       JOIN x_authors a ON a.user_id = p.user_id AND a.author_key = p.author_key
       WHERE i.user_id = ? AND i.run_id = ?
       ORDER BY i.position ASC LIMIT ?`
    )
    .bind(userId, runId, MAX_RUN_POSTS)
    .all<ArchivePostRow>();
  return rows.results;
}

async function relationshipsForPosts(
  db: D1Database,
  userId: string,
  tweetIds: string[]
): Promise<Map<string, DailyRelationship[]>> {
  if (tweetIds.length === 0) return new Map();
  const placeholders = tweetIds.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT r.source_tweet_id, r.relationship_type, r.target_tweet_id, r.target_url,
        target.text AS target_text, target.author_key AS target_author_key,
        target_author.username AS target_username, target_author.name AS target_author_name,
        target_author.profile_image_url AS target_profile_image_url
       FROM x_post_relationships r
       LEFT JOIN x_posts target
         ON target.user_id = r.user_id AND target.tweet_id = r.target_tweet_id
       LEFT JOIN x_authors target_author
         ON target_author.user_id = target.user_id AND target_author.author_key = target.author_key
       WHERE r.user_id = ? AND r.source_tweet_id IN (${placeholders})`
    )
    .bind(userId, ...tweetIds)
    .all<RelationshipRow>();
  const result = new Map<string, DailyRelationship[]>();
  for (const row of rows.results) {
    const target =
      row.target_text && row.target_author_key && row.target_username && row.target_author_name
        ? {
            tweetId: row.target_tweet_id,
            text: row.target_text,
            url: row.target_url ?? `https://x.com/i/status/${row.target_tweet_id}`,
            author: {
              key: row.target_author_key,
              username: row.target_username,
              name: row.target_author_name,
              profileImageUrl: row.target_profile_image_url,
            },
          }
        : null;
    const relationship = {
      type: row.relationship_type,
      tweetId: row.target_tweet_id,
      url: row.target_url,
      target,
    };
    result.set(row.source_tweet_id, [...(result.get(row.source_tweet_id) ?? []), relationship]);
  }
  return result;
}

async function dailySources(
  db: D1Database,
  userId: string
): Promise<{
  sources: DailySource[];
  authorsBySource: Map<string, Set<string>>;
  warning: string | null;
}> {
  try {
    const rows = await db
      .prepare(
        `SELECT s.source_id, s.source_type, s.name, s.is_selected, s.captured_at, m.author_key
         FROM x_daily_sources s
         LEFT JOIN x_daily_source_members m
           ON m.user_id = s.user_id AND m.source_id = s.source_id
         WHERE s.user_id = ? AND s.is_selected = 1
         ORDER BY CASE s.source_type WHEN 'FAVORITES' THEN 0 ELSE 1 END, s.name`
      )
      .bind(userId)
      .all<DailySourceRow>();
    const sourceMap = new Map<string, DailySource>();
    const authorsBySource = new Map<string, Set<string>>();
    for (const row of rows.results) {
      const authors = authorsBySource.get(row.source_id) ?? new Set<string>();
      if (row.author_key) authors.add(row.author_key);
      authorsBySource.set(row.source_id, authors);
      sourceMap.set(row.source_id, {
        id: row.source_id,
        type: row.source_type,
        name: row.name,
        selected: true,
        capturedAt: new Date(row.captured_at).toISOString(),
        authorCount: authors.size,
      });
    }
    return { sources: [...sourceMap.values()], authorsBySource, warning: null };
  } catch (error) {
    return {
      sources: [],
      authorsBySource: new Map(),
      warning: `Favorite/list membership could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function sourceIdsForAuthor(
  authorKey: string,
  sources: DailySource[],
  authorsBySource: Map<string, Set<string>>
): string[] {
  return sources
    .filter((source) => authorsBySource.get(source.id)?.has(authorKey))
    .map((source) => source.id);
}

function uniqueAuthors(posts: DailyPost[]): string[] {
  return [...new Set(posts.map((post) => post.author.username))];
}

function conversationGroups(posts: DailyPost[]) {
  const postById = new Map(posts.map((post) => [post.id, post]));
  const parents = new Map(posts.map((post) => [post.id, post.id]));
  const find = (id: string): string => {
    const parent = parents.get(id) ?? id;
    if (parent === id) return id;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parents.set(right, left);
  };

  for (const post of posts) {
    for (const relationship of post.relationships) {
      if (postById.has(relationship.tweetId)) union(post.id, relationship.tweetId);
    }
  }

  const direct = new Map<string, DailyPost[]>();
  for (const post of posts) {
    const root = find(post.id);
    direct.set(root, [...(direct.get(root) ?? []), post]);
  }

  const candidates: Array<{
    id: string;
    evidenceType: 'DIRECT_RELATIONSHIP' | 'SHARED_LINK';
    label: string;
    evidence: string;
    postIds: string[];
    authors: string[];
    relationshipTypes: string[];
  }> = [];
  for (const groupPosts of direct.values()) {
    const authors = uniqueAuthors(groupPosts);
    if (groupPosts.length < 2 || authors.length < 2) continue;
    const relationshipTypes = [
      ...new Set(
        groupPosts.flatMap((post) =>
          post.relationships
            .filter((relationship) => postById.has(relationship.tweetId))
            .map((relationship) => relationship.type)
        )
      ),
    ];
    candidates.push({
      id: `relationship:${groupPosts
        .map((post) => post.id)
        .sort()
        .join(':')}`,
      evidenceType: 'DIRECT_RELATIONSHIP',
      label: `Direct conversation · ${authors
        .slice(0, 3)
        .map((author) => `@${author}`)
        .join(', ')}`,
      evidence: `${groupPosts.length} posts are connected by ${relationshipTypes
        .map((type) => type.toLocaleLowerCase().replaceAll('_', ' '))
        .join(', ')} metadata.`,
      postIds: groupPosts.slice(0, 4).map((post) => post.id),
      authors,
      relationshipTypes,
    });
  }

  const linkGroups = new Map<string, DailyPost[]>();
  for (const post of posts) {
    for (const link of post.links as Array<{
      normalizedUrl?: string;
      card?: { domain?: string | null } | null;
    }>) {
      if (!link.normalizedUrl) continue;
      linkGroups.set(link.normalizedUrl, [...(linkGroups.get(link.normalizedUrl) ?? []), post]);
    }
  }
  for (const [url, linkedPosts] of linkGroups) {
    const uniquePosts = [...new Map(linkedPosts.map((post) => [post.id, post])).values()];
    const authors = uniqueAuthors(uniquePosts);
    if (uniquePosts.length < 2 || authors.length < 2) continue;
    const ids = uniquePosts.map((post) => post.id);
    if (candidates.some((candidate) => ids.every((id) => candidate.postIds.includes(id)))) continue;
    let domain = url;
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // Keep the normalized URL as explicit evidence when it cannot be parsed.
    }
    candidates.push({
      id: `link:${url}`,
      evidenceType: 'SHARED_LINK',
      label: `Shared link · ${domain}`,
      evidence: `${authors.length} authors linked to the same normalized URL.`,
      postIds: ids.slice(0, 4),
      authors,
      relationshipTypes: [],
    });
  }

  return candidates
    .sort(
      (a, b) =>
        (a.evidenceType === 'DIRECT_RELATIONSHIP' ? 0 : 1) -
          (b.evidenceType === 'DIRECT_RELATIONSHIP' ? 0 : 1) ||
        b.authors.length - a.authors.length ||
        b.postIds.length - a.postIds.length
    )
    .slice(0, 3);
}

export async function getDailyFeed(
  db: D1Database,
  userId: string,
  options: { date?: string; timezone?: string; now?: Date } = {}
) {
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const now = options.now ?? new Date();
  const expectedDate = localDate(now, timezone);
  const run = await selectRun(db, userId, options.date, timezone);
  if (!run) {
    return {
      schemaVersion: 1,
      variant: { id: 'people-first-v1', mode: 'REVIEW' as const },
      date: options.date ?? expectedDate,
      timezone,
      frozenAt: null,
      freshness: { isCurrent: false, status: 'UNAVAILABLE' as const, warnings: [] as string[] },
      coverage: {
        status: 'UNAVAILABLE' as const,
        archiveStatus: 'UNAVAILABLE' as const,
        selectionStatus: 'MISSING' as const,
        runId: null,
        requestedCount: 0,
        collectedCount: 0,
        message: 'No complete or partial X Following archive run is available for this day.',
      },
      sources: [] as DailySource[],
      conversations: [] as ReturnType<typeof conversationGroups>,
      posts: [] as DailyPost[],
    };
  }

  const frozenAt = new Date(run.completed_at ?? run.started_at);
  const date = localDate(frozenAt, timezone);
  const archivePosts = await postsForRun(db, userId, run.id);
  const relationships = await relationshipsForPosts(
    db,
    userId,
    archivePosts.map((post) => post.tweet_id)
  );
  const sourceResult = await dailySources(db, userId);
  let sources = sourceResult.sources;
  let selectionStatus: 'COMPLETE' | 'STALE' | 'FALLBACK' | 'MISSING' =
    sources.length > 0 ? 'COMPLETE' : 'MISSING';
  let selectedRows = archivePosts
    .map((row) => ({
      row,
      sourceIds: sourceIdsForAuthor(row.author_key, sources, sourceResult.authorsBySource),
    }))
    .filter((entry) => entry.sourceIds.length > 0);
  const warnings: string[] = [];
  if (sourceResult.warning) warnings.push(sourceResult.warning);
  if (sources.length === 0 || selectedRows.length === 0) {
    selectionStatus = 'FALLBACK';
    sources = [
      {
        id: 'following-fallback',
        type: 'FOLLOWING_FALLBACK',
        name: 'Following',
        selected: true,
        capturedAt: frozenAt.toISOString(),
        authorCount: new Set(archivePosts.map((post) => post.author_key)).size,
      },
    ];
    selectedRows = archivePosts.map((row) => ({ row, sourceIds: ['following-fallback'] }));
    warnings.push(
      sourceResult.sources.length === 0
        ? 'Favorite and selected-list membership has not been captured; showing the frozen Following run.'
        : 'No posts in the frozen run matched the selected Favorite/list sources; showing Following as an explicit fallback.'
    );
  } else if (
    sources.some(
      (source) => source.capturedAt && localDate(new Date(source.capturedAt), timezone) !== date
    )
  ) {
    selectionStatus = 'STALE';
    warnings.push(
      'Favorite/list membership was captured on a different day than the frozen post run.'
    );
  }

  const sourceRank = new Map(
    sources.map((source, index) => [source.id, source.type === 'FAVORITES' ? -1 : index])
  );
  selectedRows.sort(
    (a, b) =>
      Math.min(...a.sourceIds.map((id) => sourceRank.get(id) ?? 100)) -
        Math.min(...b.sourceIds.map((id) => sourceRank.get(id) ?? 100)) ||
      (a.row.position ?? 10_000) - (b.row.position ?? 10_000)
  );
  const posts = selectedRows.map(({ row, sourceIds }) =>
    publicPost(row, sourceIds, relationships.get(row.tweet_id) ?? [])
  );
  const archiveComplete = run.status === 'COMPLETE' && run.collected_count >= run.requested_count;
  if (!archiveComplete) {
    warnings.push(
      `X run ${run.id} is ${run.status.toLocaleLowerCase()} (${run.collected_count}/${run.requested_count} requested posts).`
    );
  }
  if (run.failure_reason) warnings.push(run.failure_reason);
  if (date !== expectedDate) {
    warnings.push(`Frozen review data is from ${date}; the current local date is ${expectedDate}.`);
  }
  const status =
    archiveComplete && selectionStatus === 'COMPLETE'
      ? ('COMPLETE' as const)
      : ('PARTIAL' as const);

  return {
    schemaVersion: 1,
    variant: { id: 'people-first-v1', mode: 'REVIEW' as const },
    date,
    timezone,
    frozenAt: frozenAt.toISOString(),
    freshness: { isCurrent: date === expectedDate, status, warnings },
    coverage: {
      status,
      archiveStatus: archiveComplete ? ('COMPLETE' as const) : ('PARTIAL' as const),
      selectionStatus,
      runId: run.id,
      requestedCount: run.requested_count,
      collectedCount: run.collected_count,
      message:
        status === 'COMPLETE'
          ? 'Frozen archive coverage and Favorite/list membership are complete for this review slice.'
          : 'This review slice is usable with the coverage limits shown above.',
    },
    sources,
    conversations: conversationGroups(posts),
    posts,
  };
}

async function postsForAuthor(
  db: D1Database,
  userId: string,
  authorKey: string
): Promise<ArchivePostRow[]> {
  const rows = await db
    .prepare(
      `SELECT p.tweet_id, p.url, p.text, p.published_at, p.lang, p.kind, p.author_key,
        a.username, a.name AS author_name, a.profile_url, a.profile_image_url, a.verified,
        p.media_json, p.links_json, p.metrics_json, p.first_seen_at, p.last_seen_at,
        i.position, i.observed_at, i.presentation, i.reposted_by_json
       FROM x_posts p
       JOIN x_authors a ON a.user_id = p.user_id AND a.author_key = p.author_key
       LEFT JOIN x_timeline_run_items i
         ON i.user_id = p.user_id AND i.tweet_id = p.tweet_id
        AND i.observed_at = (
          SELECT MAX(latest.observed_at) FROM x_timeline_run_items latest
          WHERE latest.user_id = p.user_id AND latest.tweet_id = p.tweet_id
        )
       WHERE p.user_id = ? AND p.author_key = ?
       ORDER BY COALESCE(p.published_at, i.observed_at, p.last_seen_at) DESC
       LIMIT ?`
    )
    .bind(userId, authorKey, MAX_AUTHOR_POSTS)
    .all<ArchivePostRow>();
  return rows.results;
}

export async function getDailyAuthorActivity(
  db: D1Database,
  userId: string,
  authorKey: string,
  options: { date: string; range: 'TODAY' | 'WEEK'; timezone?: string; now?: Date }
) {
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const startDate = options.range === 'WEEK' ? addDays(options.date, -6) : options.date;
  const rows = (await postsForAuthor(db, userId, authorKey)).filter((row) => {
    const date = localDate(new Date(postTimestamp(row)), timezone);
    return date >= startDate && date <= options.date;
  });
  const relationshipMap = await relationshipsForPosts(
    db,
    userId,
    rows.map((row) => row.tweet_id)
  );
  const sourceResult = await dailySources(db, userId);
  const posts = rows.map((row) =>
    publicPost(
      row,
      sourceIdsForAuthor(row.author_key, sourceResult.sources, sourceResult.authorsBySource),
      relationshipMap.get(row.tweet_id) ?? []
    )
  );
  const author = posts[0]?.author ?? null;
  const runs = await archiveRuns(db, userId);
  const relevantRuns = runs.filter((run) => {
    const runDate = localDate(new Date(run.completed_at ?? run.started_at), timezone);
    return runDate >= startDate && runDate <= options.date;
  });
  const warnings = [
    'Shows every post available in the X Following archive, which is a sampled timeline rather than a complete author export.',
  ];
  if (sourceResult.warning) warnings.push(sourceResult.warning);
  if (relevantRuns.some((run) => run.status !== 'COMPLETE')) {
    warnings.push('At least one archive run in this range has partial coverage.');
  }

  return {
    schemaVersion: 1,
    variant: { id: 'people-first-v1', mode: 'REVIEW' as const },
    date: options.date,
    range: options.range,
    startDate,
    timezone,
    author,
    coverage: {
      status: relevantRuns.length > 0 ? ('PARTIAL' as const) : ('UNAVAILABLE' as const),
      runIds: relevantRuns.map((run) => run.id),
      warnings,
    },
    posts,
  };
}
