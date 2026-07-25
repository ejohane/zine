const DEFAULT_TIMEZONE = 'America/Chicago';
const MAX_RUN_POSTS = 500;
const RELATIONSHIP_QUERY_POST_LIMIT = 90;
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
  source_type: 'FOLLOWING' | 'FAVORITES' | 'LIST';
  source_id: string;
  source_name: string;
  source_url: string | null;
  context_coverage_json: string;
};

type ContextCoverage = {
  budget: number;
  attempted: number;
  completed: number;
  truncated: number;
  failed: number;
  warnings: string[];
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
  snapshot_id: string;
  run_id: string;
  source_id: string;
  source_type: 'FAVORITES' | 'LIST';
  name: string;
  is_selected: number;
  captured_at: number;
  status: 'COMPLETE' | 'PARTIAL';
  failure_reason: string | null;
  supplied_count: number;
  resolved_count: number;
  unresolved_usernames_json: string;
  author_key: string | null;
};

type DailySource = {
  id: string;
  type: 'FAVORITES' | 'LIST' | 'FOLLOWING' | 'FOLLOWING_FALLBACK';
  name: string;
  selected: boolean;
  capturedAt: string | null;
  authorCount: number;
  status?: 'COMPLETE' | 'PARTIAL';
  snapshotId?: string | null;
  runId?: string | null;
  unresolvedCount?: number;
  failureReason?: string | null;
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

function publicRepostAuthor(value: string | null) {
  const parsed = parseJson(value, null);
  if (!parsed || typeof parsed !== 'object') return null;

  const author = parsed as Record<string, unknown>;
  if (typeof author.username !== 'string' || typeof author.name !== 'string') return null;
  const id = typeof author.id === 'string' && author.id ? author.id : null;

  return {
    key: id ? `id:${id}` : `username:${author.username.toLocaleLowerCase()}`,
    username: author.username,
    name: author.name,
    profileUrl: typeof author.profileUrl === 'string' ? author.profileUrl : null,
    profileImageUrl: typeof author.profileImageUrl === 'string' ? author.profileImageUrl : null,
    verified: typeof author.verified === 'boolean' ? author.verified : null,
  };
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
    repostedBy: publicRepostAuthor(row.reposted_by_json),
    sourceIds,
    sourcePosition: row.position,
  };
}

async function archiveRuns(db: D1Database, userId: string): Promise<ArchiveRunRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, requested_count, collected_count, status, started_at, completed_at,
        excluded_ads, failure_reason, source_type, source_id, source_name, source_url,
        context_coverage_json
       FROM x_timeline_runs
       WHERE user_id = ? AND status IN ('COMPLETE', 'PARTIAL') AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, id DESC LIMIT 60`
    )
    .bind(userId)
    .all<ArchiveRunRow>();
  return rows.results;
}

function contextCoverage(run: ArchiveRunRow): ContextCoverage {
  const parsed = parseJson(run.context_coverage_json, {}) as Partial<ContextCoverage>;
  return {
    budget: parsed.budget ?? 0,
    attempted: parsed.attempted ?? 0,
    completed: parsed.completed ?? 0,
    truncated: parsed.truncated ?? 0,
    failed: parsed.failed ?? 0,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}

async function selectRun(
  db: D1Database,
  userId: string,
  date: string | undefined,
  timezone: string,
  sourceTypes: ArchiveRunRow['source_type'][] = ['FOLLOWING']
): Promise<ArchiveRunRow | null> {
  const runs = await archiveRuns(db, userId);
  const eligible = runs.filter((run) => sourceTypes.includes(run.source_type ?? 'FOLLOWING'));
  if (!date) return eligible[0] ?? null;
  return (
    eligible.find(
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

async function contextPostsForRun(
  db: D1Database,
  userId: string,
  runId: string
): Promise<ArchivePostRow[]> {
  const rows = await db
    .prepare(
      `SELECT NULL AS position, c.observed_at, 'CONTEXT' AS presentation,
        NULL AS reposted_by_json, p.tweet_id, p.url, p.text, p.published_at, p.lang,
        p.kind, p.author_key, a.username, a.name AS author_name, a.profile_url,
        a.profile_image_url, a.verified, p.media_json, p.links_json, p.metrics_json,
        p.first_seen_at, p.last_seen_at
       FROM x_timeline_run_context_posts c
       JOIN x_posts p ON p.user_id = c.user_id AND p.tweet_id = c.tweet_id
       JOIN x_authors a ON a.user_id = p.user_id AND a.author_key = p.author_key
       WHERE c.user_id = ? AND c.run_id = ?
       ORDER BY COALESCE(p.published_at, c.observed_at) ASC, p.tweet_id ASC
       LIMIT ?`
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
  const result = new Map<string, DailyRelationship[]>();

  for (let offset = 0; offset < tweetIds.length; offset += RELATIONSHIP_QUERY_POST_LIMIT) {
    const batch = tweetIds.slice(offset, offset + RELATIONSHIP_QUERY_POST_LIMIT);
    const placeholders = batch.map(() => '?').join(',');
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
      .bind(userId, ...batch)
      .all<RelationshipRow>();

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
  }
  return result;
}

async function dailySources(
  db: D1Database,
  userId: string,
  options: { runId?: string; referenceAt?: number } = {}
): Promise<{
  sources: DailySource[];
  authorsBySource: Map<string, Set<string>>;
  warning: string | null;
}> {
  try {
    const byRun = options.runId !== undefined;
    const rows = await db
      .prepare(
        byRun
          ? `SELECT s.id AS snapshot_id, s.run_id, s.source_id, s.source_type, s.name,
               s.is_selected, s.captured_at, s.status, s.failure_reason, s.supplied_count, s.resolved_count,
               s.unresolved_usernames_json, m.author_key
             FROM x_daily_source_snapshots s
             LEFT JOIN x_daily_source_snapshot_members m
               ON m.user_id = s.user_id AND m.snapshot_id = s.id
             WHERE s.user_id = ? AND s.run_id = ? AND s.is_selected = 1
             ORDER BY m.author_key`
          : `WITH latest AS (
               SELECT *, ROW_NUMBER() OVER (
                 PARTITION BY source_id ORDER BY captured_at DESC, id DESC
               ) AS source_rank
               FROM x_daily_source_snapshots
               WHERE user_id = ? AND is_selected = 1 AND captured_at <= ?
             )
             SELECT s.id AS snapshot_id, s.run_id, s.source_id, s.source_type, s.name,
               s.is_selected, s.captured_at, s.status, s.failure_reason, s.supplied_count, s.resolved_count,
               s.unresolved_usernames_json, m.author_key
             FROM latest s
             LEFT JOIN x_daily_source_snapshot_members m
               ON m.user_id = s.user_id AND m.snapshot_id = s.id
             WHERE s.source_rank = 1
             ORDER BY CASE s.source_type WHEN 'FAVORITES' THEN 0 ELSE 1 END, s.name`
      )
      .bind(userId, byRun ? options.runId : (options.referenceAt ?? Date.now()))
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
        authorCount: row.resolved_count,
        status: row.status,
        snapshotId: row.snapshot_id,
        runId: row.run_id,
        unresolvedCount: (parseJson(row.unresolved_usernames_json, []) as unknown[]).length,
        failureReason: row.failure_reason,
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

function uniquePresentationAuthors(posts: DailyPost[]): string[] {
  return [...new Set(posts.map((post) => post.repostedBy?.username ?? post.author.username))];
}

const TOPIC_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'before',
  'being',
  'from',
  'have',
  'into',
  'just',
  'more',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
  'https',
  'http',
]);

function topicTokens(post: DailyPost): Set<string> {
  const values = post.text.toLocaleLowerCase().match(/[#@]?[\p{L}\p{N}_-]{4,}/gu) ?? [];
  return new Set(values.filter((value) => !TOPIC_STOP_WORDS.has(value)));
}

function sharedTopicTerms(leftTokens: Set<string>, rightTokens: Set<string>): string[] {
  return [...leftTokens].filter((token) => rightTokens.has(token)).sort();
}

function dailyPostTimestamp(post: DailyPost): number {
  return Date.parse(post.publishedAt ?? post.observedAt ?? '') || 0;
}

function conversationLatestActivity(posts: DailyPost[]): string | null {
  const latest = Math.max(...posts.map(dailyPostTimestamp));
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function firstSourcePosition(posts: DailyPost[]): number {
  return Math.min(...posts.map((post) => post.sourcePosition ?? Number.MAX_SAFE_INTEGER));
}

function conversationGroups(
  posts: DailyPost[],
  favoritePostIds = new Set(posts.map((post) => post.id)),
  contextWarnings: string[] = []
) {
  const postById = new Map(posts.map((post) => [post.id, post]));
  const topicTokensByPost = new Map(posts.map((post) => [post.id, topicTokens(post)]));
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
    evidenceType: 'DIRECT_RELATIONSHIP' | 'SHARED_LINK' | 'TOPIC_SIMILARITY';
    label: string;
    evidence: string;
    postIds: string[];
    authors: string[];
    relationshipTypes: string[];
    favoritePostIds: string[];
    contextPostIds: string[];
    favoriteAuthors: string[];
    latestActivityAt: string | null;
    coverageWarnings: string[];
    firstFavoritePosition: number;
  }> = [];
  for (const groupPosts of direct.values()) {
    const orderedPosts = [...groupPosts].sort(
      (left, right) => dailyPostTimestamp(left) - dailyPostTimestamp(right)
    );
    const selectedPosts = orderedPosts.slice(0, 8);
    if (!selectedPosts.some((post) => favoritePostIds.has(post.id))) {
      const favoriteAnchor = orderedPosts.find((post) => favoritePostIds.has(post.id));
      if (favoriteAnchor) selectedPosts.splice(-1, 1, favoriteAnchor);
    }
    const authors = uniqueAuthors(selectedPosts);
    const favoritePosts = selectedPosts.filter((post) => favoritePostIds.has(post.id));
    if (groupPosts.length < 2 || favoritePosts.length === 0) continue;
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
      evidence: `${selectedPosts.length} posts are connected by ${relationshipTypes
        .map((type) => type.toLocaleLowerCase().replaceAll('_', ' '))
        .join(', ')} metadata.`,
      postIds: selectedPosts.map((post) => post.id),
      authors,
      relationshipTypes,
      favoritePostIds: favoritePosts.map((post) => post.id),
      contextPostIds: selectedPosts
        .filter((post) => !favoritePostIds.has(post.id))
        .map((post) => post.id),
      favoriteAuthors: uniquePresentationAuthors(favoritePosts),
      latestActivityAt: conversationLatestActivity(selectedPosts),
      coverageWarnings: contextWarnings,
      firstFavoritePosition: firstSourcePosition(favoritePosts),
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
    const uniquePosts = [...new Map(linkedPosts.map((post) => [post.id, post])).values()]
      .filter((post) => !candidates.some((candidate) => candidate.postIds.includes(post.id)))
      .sort(
        (left, right) =>
          firstSourcePosition([left]) - firstSourcePosition([right]) ||
          dailyPostTimestamp(right) - dailyPostTimestamp(left)
      )
      .slice(0, 8);
    const authors = uniqueAuthors(uniquePosts);
    const favoritePosts = uniquePosts.filter((post) => favoritePostIds.has(post.id));
    if (uniquePosts.length < 2 || authors.length < 2 || favoritePosts.length === 0) continue;
    const ids = uniquePosts.map((post) => post.id);
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
      favoritePostIds: favoritePosts.map((post) => post.id),
      contextPostIds: uniquePosts
        .filter((post) => !favoritePostIds.has(post.id))
        .map((post) => post.id),
      favoriteAuthors: uniquePresentationAuthors(favoritePosts),
      latestActivityAt: conversationLatestActivity(uniquePosts),
      coverageWarnings: [],
      firstFavoritePosition: firstSourcePosition(favoritePosts),
    });
  }

  const favoritePosts = posts.filter((post) => favoritePostIds.has(post.id));
  for (let leftIndex = 0; leftIndex < favoritePosts.length; leftIndex++) {
    const left = favoritePosts[leftIndex]!;
    if (candidates.some((candidate) => candidate.postIds.includes(left.id))) continue;
    const related = [left];
    const evidenceTerms = new Set<string>();
    for (let rightIndex = leftIndex + 1; rightIndex < favoritePosts.length; rightIndex++) {
      const right = favoritePosts[rightIndex]!;
      if (candidates.some((candidate) => candidate.postIds.includes(right.id))) continue;
      const terms = sharedTopicTerms(
        topicTokensByPost.get(left.id) ?? new Set(),
        topicTokensByPost.get(right.id) ?? new Set()
      );
      const hasStrongMarker = terms.some((term) => term.startsWith('#') || term.startsWith('@'));
      if (terms.length < 3 && !(hasStrongMarker && terms.length >= 2)) continue;
      related.push(right);
      terms.slice(0, 4).forEach((term) => evidenceTerms.add(term));
      if (related.length === 4) break;
    }
    if (related.length < 2 || uniqueAuthors(related).length < 2) continue;
    const terms = [...evidenceTerms].slice(0, 3);
    candidates.push({
      id: `topic:${related
        .map((post) => post.id)
        .sort()
        .join(':')}`,
      evidenceType: 'TOPIC_SIMILARITY',
      label: `Shared topic · ${terms.join(' · ')}`,
      evidence: `${related.length} Favorite posts share multiple explicit terms: ${terms.join(', ')}.`,
      postIds: related.map((post) => post.id),
      authors: uniqueAuthors(related),
      relationshipTypes: [],
      favoritePostIds: related.map((post) => post.id),
      contextPostIds: [],
      favoriteAuthors: uniquePresentationAuthors(related),
      latestActivityAt: conversationLatestActivity(related),
      coverageWarnings: [],
      firstFavoritePosition: firstSourcePosition(related),
    });
  }

  return candidates
    .sort(
      (a, b) =>
        (({ DIRECT_RELATIONSHIP: 0, SHARED_LINK: 1, TOPIC_SIMILARITY: 2 })[a.evidenceType] ?? 3) -
          ({ DIRECT_RELATIONSHIP: 0, SHARED_LINK: 1, TOPIC_SIMILARITY: 2 }[b.evidenceType] ?? 3) ||
        b.favoriteAuthors.length - a.favoriteAuthors.length ||
        b.favoritePostIds.length - a.favoritePostIds.length ||
        b.authors.length - a.authors.length ||
        (Date.parse(b.latestActivityAt ?? '') || 0) - (Date.parse(a.latestActivityAt ?? '') || 0) ||
        a.firstFavoritePosition - b.firstFavoritePosition ||
        a.id.localeCompare(b.id)
    )
    .slice(0, 3)
    .map(({ firstFavoritePosition: _firstFavoritePosition, ...conversation }) => conversation);
}

export async function getDailyFeed(
  db: D1Database,
  userId: string,
  options: { date?: string; timezone?: string; now?: Date } = {}
) {
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const now = options.now ?? new Date();
  const expectedDate = localDate(now, timezone);
  const requestedDate = options.date ?? expectedDate;
  let favoritesRun = await selectRun(db, userId, requestedDate, timezone, ['FAVORITES', 'LIST']);
  let followingRun = await selectRun(db, userId, requestedDate, timezone, ['FOLLOWING']);
  if (!options.date && !favoritesRun && !followingRun) {
    favoritesRun = await selectRun(db, userId, undefined, timezone, ['FAVORITES', 'LIST']);
    const fallbackDate = favoritesRun
      ? localDate(new Date(favoritesRun.completed_at ?? favoritesRun.started_at), timezone)
      : undefined;
    followingRun = await selectRun(db, userId, fallbackDate, timezone, ['FOLLOWING']);
    if (!favoritesRun && !followingRun) {
      followingRun = await selectRun(db, userId, undefined, timezone, ['FOLLOWING']);
    }
  }
  const primaryRun = favoritesRun ?? followingRun;
  if (!primaryRun) {
    return {
      schemaVersion: 1,
      variant: { id: 'people-first-v2', mode: 'REVIEW' as const },
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
      sections: { favoritePostIds: [], followingPostIds: [] },
      inputs: { favorites: null, following: null, membership: null },
    };
  }

  const frozenAt = new Date(primaryRun.completed_at ?? primaryRun.started_at);
  const date = localDate(frozenAt, timezone);
  const favoriteRows = favoritesRun ? await postsForRun(db, userId, favoritesRun.id) : [];
  const followingRows = followingRun ? await postsForRun(db, userId, followingRun.id) : [];
  const contextRows = [
    ...(favoritesRun ? await contextPostsForRun(db, userId, favoritesRun.id) : []),
    ...(followingRun ? await contextPostsForRun(db, userId, followingRun.id) : []),
  ];
  const primaryRows = [
    ...favoriteRows,
    ...followingRows.filter(
      (row) => !favoriteRows.some((favorite) => favorite.tweet_id === row.tweet_id)
    ),
  ];
  const primaryIds = new Set(primaryRows.map((row) => row.tweet_id));
  const uniqueContextRows = [
    ...new Map(
      contextRows.filter((row) => !primaryIds.has(row.tweet_id)).map((row) => [row.tweet_id, row])
    ).values(),
  ];
  const archivePosts = [...primaryRows, ...uniqueContextRows];
  const relationships = await relationshipsForPosts(
    db,
    userId,
    archivePosts.map((post) => post.tweet_id)
  );
  const sourceResult = await dailySources(db, userId, {
    runId: favoritesRun?.id,
    referenceAt: frozenAt.getTime(),
  });
  const warnings: string[] = [];
  if (sourceResult.warning) warnings.push(sourceResult.warning);
  const membershipSource = favoritesRun
    ? (sourceResult.sources.find((source) => source.id === favoritesRun.source_id) ??
      sourceResult.sources.find((source) => source.type === 'FAVORITES'))
    : null;
  let selectionStatus: 'COMPLETE' | 'STALE' | 'FALLBACK' | 'MISSING';
  if (!favoritesRun) {
    selectionStatus = 'FALLBACK';
    warnings.push(
      'No frozen Favorites list run is available; showing Following as an explicit fallback.'
    );
  } else if (!membershipSource) {
    selectionStatus = 'MISSING';
    warnings.push(
      'The Favorites timeline was captured, but its membership snapshot is unavailable.'
    );
  } else if (
    membershipSource.status !== 'COMPLETE' ||
    (membershipSource.capturedAt &&
      localDate(new Date(membershipSource.capturedAt), timezone) !== date)
  ) {
    selectionStatus = 'STALE';
    warnings.push(
      membershipSource.status !== 'COMPLETE'
        ? 'Favorites membership capture is partial.'
        : 'Favorites membership was captured on a different day than the frozen post run.'
    );
  } else {
    selectionStatus = 'COMPLETE';
  }
  if (membershipSource?.failureReason) warnings.push(membershipSource.failureReason);
  const unresolvedMembershipCount = membershipSource?.unresolvedCount ?? 0;
  if (unresolvedMembershipCount > 0) {
    warnings.push(
      `Favorites membership has ${unresolvedMembershipCount} unresolved username${unresolvedMembershipCount === 1 ? '' : 's'}.`
    );
  }

  const favoriteSourceId = favoritesRun?.source_id ?? 'favorites';
  const followingSourceId = favoritesRun ? 'following' : 'following-fallback';
  const favoritePosts = favoriteRows.map((row) =>
    publicPost(row, [favoriteSourceId], relationships.get(row.tweet_id) ?? [])
  );
  const favoritePostIds = new Set(favoritePosts.map((post) => post.id));
  const followingPosts = followingRows
    .filter((row) => !favoritePostIds.has(row.tweet_id))
    .map((row) => publicPost(row, [followingSourceId], relationships.get(row.tweet_id) ?? []));
  const contextPosts = uniqueContextRows.map((row) =>
    publicPost(row, [], relationships.get(row.tweet_id) ?? [])
  );
  const posts = [...favoritePosts, ...followingPosts, ...contextPosts];
  const favoriteContextCoverage = favoritesRun ? contextCoverage(favoritesRun) : null;
  const contextWarnings: string[] = [];
  if (favoriteContextCoverage?.truncated) {
    contextWarnings.push(
      `${favoriteContextCoverage.truncated} Favorite thread expansion${favoriteContextCoverage.truncated === 1 ? ' was' : 's were'} truncated.`
    );
  }
  if (favoriteContextCoverage?.failed) {
    contextWarnings.push(
      `${favoriteContextCoverage.failed} Favorite thread expansion${favoriteContextCoverage.failed === 1 ? '' : 's'} failed.`
    );
  }
  contextWarnings.push(...(favoriteContextCoverage?.warnings ?? []));
  const conversations = conversationGroups(posts, favoritePostIds, contextWarnings);
  const conversationPostIds = new Set(
    conversations.flatMap((conversation) => conversation.postIds)
  );
  const favoriteUngroupedIds = favoritePosts
    .filter((post) => !conversationPostIds.has(post.id))
    .map((post) => post.id);
  const followingSectionIds = followingPosts
    .filter((post) => !conversationPostIds.has(post.id))
    .map((post) => post.id);
  const runComplete = (run: ArchiveRunRow | null) =>
    !run || (run.status === 'COMPLETE' && run.collected_count >= run.requested_count);
  const archiveComplete = runComplete(favoritesRun) && runComplete(followingRun);
  const contextComplete =
    !favoriteContextCoverage ||
    (favoriteContextCoverage.truncated === 0 && favoriteContextCoverage.failed === 0);
  const membershipComplete = selectionStatus === 'COMPLETE' && unresolvedMembershipCount === 0;
  warnings.push(...contextWarnings);
  for (const run of [favoritesRun, followingRun].filter(Boolean) as ArchiveRunRow[]) {
    if (!runComplete(run)) {
      warnings.push(
        `X ${run.source_name} run ${run.id} is ${run.status.toLocaleLowerCase()} (${run.collected_count}/${run.requested_count} requested posts).`
      );
    }
    if (run.failure_reason) warnings.push(run.failure_reason);
  }
  if (date !== expectedDate) {
    warnings.push(`Frozen review data is from ${date}; the current local date is ${expectedDate}.`);
  }
  const status =
    archiveComplete && contextComplete && favoritesRun && membershipComplete
      ? ('COMPLETE' as const)
      : ('PARTIAL' as const);

  return {
    schemaVersion: 1,
    variant: { id: 'people-first-v2', mode: 'REVIEW' as const },
    date,
    timezone,
    frozenAt: frozenAt.toISOString(),
    freshness: { isCurrent: date === expectedDate, status, warnings },
    coverage: {
      status,
      archiveStatus: archiveComplete ? ('COMPLETE' as const) : ('PARTIAL' as const),
      selectionStatus,
      runId: primaryRun.id,
      requestedCount: primaryRun.requested_count,
      collectedCount: primaryRun.collected_count,
      message:
        status === 'COMPLETE'
          ? 'Frozen Favorites, Following, and membership coverage are complete for this review slice.'
          : 'This review slice is usable with the coverage limits shown above.',
    },
    sources: [
      ...(favoritesRun
        ? [
            membershipSource ?? {
              id: favoriteSourceId,
              type: favoritesRun.source_type as 'FAVORITES' | 'LIST',
              name: favoritesRun.source_name,
              selected: true,
              capturedAt: favoritesRun.completed_at
                ? new Date(favoritesRun.completed_at).toISOString()
                : null,
              authorCount: new Set(favoriteRows.map((row) => row.author_key)).size,
              status: 'PARTIAL' as const,
              snapshotId: null,
              runId: favoritesRun.id,
              unresolvedCount: 0,
              failureReason: 'membership_snapshot_unavailable',
            },
          ]
        : []),
      ...(followingRun
        ? [
            {
              id: followingSourceId,
              type: favoritesRun ? ('FOLLOWING' as const) : ('FOLLOWING_FALLBACK' as const),
              name: 'Following',
              selected: true,
              capturedAt: followingRun.completed_at
                ? new Date(followingRun.completed_at).toISOString()
                : null,
              authorCount: new Set(followingRows.map((row) => row.author_key)).size,
            },
          ]
        : []),
    ],
    conversations,
    posts,
    sections: {
      favoritePostIds: favoriteUngroupedIds,
      followingPostIds: followingSectionIds,
    },
    inputs: {
      favorites: favoritesRun
        ? {
            runId: favoritesRun.id,
            sourceId: favoritesRun.source_id,
            sourceName: favoritesRun.source_name,
            sourceUrl: favoritesRun.source_url,
            status: favoritesRun.status,
            requestedCount: favoritesRun.requested_count,
            collectedCount: favoritesRun.collected_count,
            contextCoverage: favoriteContextCoverage,
            frozenAt: favoritesRun.completed_at
              ? new Date(favoritesRun.completed_at).toISOString()
              : null,
          }
        : null,
      following: followingRun
        ? {
            runId: followingRun.id,
            sourceId: followingRun.source_id,
            sourceName: followingRun.source_name,
            sourceUrl: followingRun.source_url,
            status: followingRun.status,
            requestedCount: followingRun.requested_count,
            collectedCount: followingRun.collected_count,
            contextCoverage: contextCoverage(followingRun),
            frozenAt: followingRun.completed_at
              ? new Date(followingRun.completed_at).toISOString()
              : null,
          }
        : null,
      membership: membershipSource
        ? {
            snapshotId: membershipSource.snapshotId ?? null,
            runId: membershipSource.runId ?? favoritesRun?.id ?? null,
            sourceId: membershipSource.id,
            capturedAt: membershipSource.capturedAt,
            status: membershipSource.status ?? 'PARTIAL',
            resolvedCount: membershipSource.authorCount,
            unresolvedCount: membershipSource.unresolvedCount ?? 0,
            failureReason: membershipSource.failureReason ?? null,
          }
        : null,
    },
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
  const activityFavoritesRun = await selectRun(db, userId, options.date, timezone, [
    'FAVORITES',
    'LIST',
  ]);
  const sourceResult = await dailySources(db, userId, {
    runId: activityFavoritesRun?.id,
    referenceAt: Date.parse(`${options.date}T23:59:59.999Z`),
  });
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
    'Shows every post available in the frozen Favorites and Following archives, which are sampled timelines rather than a complete author export.',
  ];
  if (sourceResult.warning) warnings.push(sourceResult.warning);
  if (relevantRuns.some((run) => run.status !== 'COMPLETE')) {
    warnings.push('At least one archive run in this range has partial coverage.');
  }

  return {
    schemaVersion: 1,
    variant: { id: 'people-first-v2', mode: 'REVIEW' as const },
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
