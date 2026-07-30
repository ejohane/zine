import {
  buildDailyTopicClustering,
  createWorkersAIDailyTopicEmbeddingProvider,
  DAILY_TOPIC_ALGORITHM_VERSION,
  DEFAULT_DAILY_TOPIC_EMBEDDING_MODEL,
} from './daily-topic-clustering';
import { buildDailyOverview, DAILY_OVERVIEW_VERSION } from './daily-overview';

const DEFAULT_TIMEZONE = 'America/Chicago';
const MAX_RUN_POSTS = 5_000;
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
  collection_policy_json: string;
  termination_reason: string;
  window_coverage_json: string;
  structure_coverage_json: string;
};

type ContextCoverage = {
  budget: number;
  attempted: number;
  completed: number;
  truncated: number;
  failed: number;
  warnings: string[];
};

type CollectionPolicy =
  | { mode: 'COUNT' }
  | {
      mode: 'ROLLING_WINDOW';
      windowHours: number;
      cutoffAt: string;
      boundaryEvidenceRequired: number;
    };

type WindowCoverage = {
  outsideWindow: number;
  missingPublishedAt: number;
  boundaryEvidenceRequired: number;
  boundaryReached: boolean;
};

type StructureCoverage = {
  primaryPosts: number;
  structuredPosts: number;
  replyPosts: number;
  replyParentsKnown: number;
  conversationIdsKnown: number;
  status: 'EXACT' | 'PARTIAL';
  warnings: string[];
};

type ArchivePostRow = {
  tweet_id: string;
  url: string;
  text: string;
  published_at: number | null;
  lang: string | null;
  kind: string;
  conversation_id: string | null;
  structure_json: string;
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
  evidence_source: string | null;
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
  evidenceSource: string | null;
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
    conversationId: row.conversation_id,
    structure: parseJson(row.structure_json, null),
    author: {
      key: row.author_key,
      username: row.username,
      name: row.author_name,
      profileUrl: row.profile_url,
      profileImageUrl: row.profile_image_url,
      verified: row.verified === null ? null : Boolean(row.verified),
    },
    media: parseJson(row.media_json, []) as unknown[],
    links: parseJson(row.links_json, []) as Array<{
      url?: string;
      normalizedUrl?: string;
      displayUrl?: string | null;
      card?: { domain?: string | null } | null;
    }>,
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
        context_coverage_json, collection_policy_json, termination_reason, window_coverage_json,
        structure_coverage_json
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

function collectionPolicy(run: ArchiveRunRow): CollectionPolicy {
  const parsed = parseJson(run.collection_policy_json, { mode: 'COUNT' }) as CollectionPolicy;
  return parsed.mode === 'ROLLING_WINDOW' ? parsed : { mode: 'COUNT' };
}

function windowCoverage(run: ArchiveRunRow): WindowCoverage {
  const parsed = parseJson(run.window_coverage_json, {}) as Partial<WindowCoverage>;
  return {
    outsideWindow: parsed.outsideWindow ?? 0,
    missingPublishedAt: parsed.missingPublishedAt ?? 0,
    boundaryEvidenceRequired: parsed.boundaryEvidenceRequired ?? 0,
    boundaryReached: parsed.boundaryReached ?? false,
  };
}

function structureCoverage(run: ArchiveRunRow): StructureCoverage {
  const parsed = parseJson(run.structure_coverage_json, {}) as Partial<StructureCoverage>;
  return {
    primaryPosts: parsed.primaryPosts ?? 0,
    structuredPosts: parsed.structuredPosts ?? 0,
    replyPosts: parsed.replyPosts ?? 0,
    replyParentsKnown: parsed.replyParentsKnown ?? 0,
    conversationIdsKnown: parsed.conversationIdsKnown ?? 0,
    status: parsed.status === 'EXACT' ? 'EXACT' : 'PARTIAL',
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

async function selectRunById(
  db: D1Database,
  userId: string,
  runId: string,
  sourceTypes: ArchiveRunRow['source_type'][]
): Promise<ArchiveRunRow | null> {
  const row = await db
    .prepare(
      `SELECT id, requested_count, collected_count, status, started_at, completed_at,
        excluded_ads, failure_reason, source_type, source_id, source_name, source_url,
        context_coverage_json, collection_policy_json, termination_reason, window_coverage_json,
        structure_coverage_json
       FROM x_timeline_runs
       WHERE user_id = ? AND id = ? AND status IN ('COMPLETE', 'PARTIAL')
         AND completed_at IS NOT NULL
       LIMIT 1`
    )
    .bind(userId, runId)
    .first<ArchiveRunRow>();
  if (!row || !sourceTypes.includes(row.source_type)) return null;
  return row;
}

async function postsForRun(
  db: D1Database,
  userId: string,
  runId: string
): Promise<ArchivePostRow[]> {
  const rows = await db
    .prepare(
      `SELECT i.position, i.observed_at, i.presentation, i.reposted_by_json,
        p.tweet_id, p.url, p.text, p.published_at, p.lang, p.kind, p.conversation_id,
        p.structure_json, p.author_key,
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
        p.kind, p.conversation_id, p.structure_json, p.author_key,
        a.username, a.name AS author_name, a.profile_url,
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
          r.evidence_source,
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
        evidenceSource: row.evidence_source,
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

export async function getDailyFeed(
  db: D1Database,
  userId: string,
  options: {
    date?: string;
    favoritesRunId?: string;
    followingRunId?: string;
    timezone?: string;
    now?: Date;
    ai?: { run(model: string, input: unknown): Promise<unknown> } | null;
    embeddingModel?: string;
    overviewModel?: string;
  } = {}
) {
  const generationStarted = performance.now();
  const generationTimingsMs: Record<string, number> = {};
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const now = options.now ?? new Date();
  const expectedDate = localDate(now, timezone);
  const requestedDate = options.date ?? expectedDate;
  let favoritesRun = options.favoritesRunId
    ? await selectRunById(db, userId, options.favoritesRunId, ['FAVORITES', 'LIST'])
    : await selectRun(db, userId, requestedDate, timezone, ['FAVORITES', 'LIST']);
  let followingRun = options.followingRunId
    ? await selectRunById(db, userId, options.followingRunId, ['FOLLOWING'])
    : await selectRun(db, userId, requestedDate, timezone, ['FOLLOWING']);
  if (options.favoritesRunId && !favoritesRun) {
    throw new Error(
      `Favorites archive run is unavailable or has the wrong source: ${options.favoritesRunId}`
    );
  }
  if (options.followingRunId && !followingRun) {
    throw new Error(
      `Following archive run is unavailable or has the wrong source: ${options.followingRunId}`
    );
  }
  generationTimingsMs.archiveSelection = Math.round(performance.now() - generationStarted);
  if (
    !options.date &&
    !options.favoritesRunId &&
    !options.followingRunId &&
    !favoritesRun &&
    !followingRun
  ) {
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
      schemaVersion: 3,
      variant: { id: 'people-first-v4-editorial-overview', mode: 'REVIEW' as const },
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
      conversations: [],
      topicClusters: [],
      threadUnits: [],
      overview: {
        version: DAILY_OVERVIEW_VERSION,
        status: 'FALLBACK' as const,
        model: null,
        frozen: true,
        inputFingerprint: '',
        warnings: [] as string[],
      },
      overviewSections: [],
      clustering: {
        version: DAILY_TOPIC_ALGORITHM_VERSION,
        method: 'THREAD_FIRST_EVIDENCE_CLUSTERING' as const,
        semanticStatus: 'FALLBACK' as const,
        embeddingModel: null,
        maxTopics: 5,
        minimumFavoriteAuthors: 2,
        candidateLimit: 40,
        semanticUnitLimit: 256,
      },
      posts: [] as DailyPost[],
      sections: {
        favoritePostIds: [],
        followingPostIds: [],
        favoriteThreadUnitIds: [],
        followingThreadUnitIds: [],
      },
      inputs: { favorites: null, following: null, membership: null },
      generationTimingsMs,
    };
  }

  const frozenAt = new Date(primaryRun.completed_at ?? primaryRun.started_at);
  const date = localDate(frozenAt, timezone);
  const favoritePolicy = favoritesRun ? collectionPolicy(favoritesRun) : null;
  const favoriteCutoff = favoritesRun
    ? Date.parse(
        favoritePolicy?.mode === 'ROLLING_WINDOW'
          ? favoritePolicy.cutoffAt
          : new Date(favoritesRun.started_at - 24 * 60 * 60 * 1_000).toISOString()
      )
    : null;
  const postHydrationStarted = performance.now();
  const rawFavoriteRows = favoritesRun ? await postsForRun(db, userId, favoritesRun.id) : [];
  const favoriteRows = rawFavoriteRows.filter(
    (row) =>
      (favoritePolicy?.mode === 'ROLLING_WINDOW' && row.presentation === 'REPOST') ||
      (row.published_at !== null && favoriteCutoff !== null && row.published_at >= favoriteCutoff)
  );
  const favoriteRowsWithoutTimestamp = rawFavoriteRows.filter(
    (row) =>
      row.published_at === null &&
      !(favoritePolicy?.mode === 'ROLLING_WINDOW' && row.presentation === 'REPOST')
  ).length;
  const favoriteRowsOutsideWindow =
    rawFavoriteRows.length - favoriteRows.length - favoriteRowsWithoutTimestamp;
  const favoriteRepostsUsingTimelinePosition = favoriteRows.filter(
    (row) =>
      row.presentation === 'REPOST' &&
      favoriteCutoff !== null &&
      row.published_at !== null &&
      row.published_at < favoriteCutoff
  ).length;
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
  generationTimingsMs.postHydration = Math.round(performance.now() - postHydrationStarted);
  const relationshipStarted = performance.now();
  const relationships = await relationshipsForPosts(
    db,
    userId,
    archivePosts.map((post) => post.tweet_id)
  );
  generationTimingsMs.relationshipHydration = Math.round(performance.now() - relationshipStarted);
  const membershipStarted = performance.now();
  const sourceResult = await dailySources(db, userId, {
    runId: favoritesRun?.id,
    referenceAt: frozenAt.getTime(),
  });
  generationTimingsMs.membership = Math.round(performance.now() - membershipStarted);
  const warnings: string[] = [];
  if (sourceResult.warning) warnings.push(sourceResult.warning);
  if (favoritesRun && favoritePolicy?.mode !== 'ROLLING_WINDOW') {
    warnings.push(
      'This Favorites run used a legacy count target; Daily View defensively limited it to the 24 hours before capture.'
    );
  }
  if (favoriteRowsOutsideWindow > 0) {
    warnings.push(
      `${favoriteRowsOutsideWindow} Favorites post${favoriteRowsOutsideWindow === 1 ? ' was' : 's were'} outside the rolling 24-hour window and excluded.`
    );
  }
  if (favoriteRowsWithoutTimestamp > 0) {
    warnings.push(
      `${favoriteRowsWithoutTimestamp} Favorites post${favoriteRowsWithoutTimestamp === 1 ? ' has' : 's have'} no publication timestamp and ${favoriteRowsWithoutTimestamp === 1 ? 'was' : 'were'} excluded.`
    );
  }
  if (favoriteRepostsUsingTimelinePosition > 0) {
    warnings.push(
      `${favoriteRepostsUsingTimelinePosition} recent Favorite repost${favoriteRepostsUsingTimelinePosition === 1 ? '' : 's'} ${favoriteRepostsUsingTimelinePosition === 1 ? 'contains' : 'contain'} older original material; rolling-window inclusion follows the verified list activity order.`
    );
  }
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
  const followingPostIds = new Set(followingPosts.map((post) => post.id));
  const favoriteContextCoverage = favoritesRun ? contextCoverage(favoritesRun) : null;
  const favoriteWindowCoverage = favoritesRun ? windowCoverage(favoritesRun) : null;
  const favoriteStructureCoverage = favoritesRun ? structureCoverage(favoritesRun) : null;
  const contextWarnings: string[] = [];
  const missingWindowTimestampCount = favoriteWindowCoverage?.missingPublishedAt ?? 0;
  if (missingWindowTimestampCount > 0) {
    warnings.push(
      `${missingWindowTimestampCount} Favorites timeline item${missingWindowTimestampCount === 1 ? '' : 's'} could not be classified into the rolling window because publication timestamps were missing.`
    );
  }
  if (favoritesRun?.termination_reason === 'SAFETY_LIMIT_REACHED') {
    warnings.push(
      `Favorites collection hit its ${favoritesRun.requested_count}-post safety guard before reaching the 24-hour boundary.`
    );
  }
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
  contextWarnings.push(...(favoriteStructureCoverage?.warnings ?? []));
  const clusteringStarted = performance.now();
  const topicClustering = await buildDailyTopicClustering(
    posts,
    favoritePostIds,
    followingPostIds,
    {
      embeddingProvider: createWorkersAIDailyTopicEmbeddingProvider(
        options.ai,
        options.embeddingModel ?? DEFAULT_DAILY_TOPIC_EMBEDDING_MODEL
      ),
    }
  );
  generationTimingsMs.clusteringAndEmbeddings = Math.round(performance.now() - clusteringStarted);
  const threadUnitsById = new Map(topicClustering.threadUnits.map((unit) => [unit.id, unit]));
  const postById = new Map(posts.map((post) => [post.id, post]));
  const overviewStarted = performance.now();
  const dailyOverview = await buildDailyOverview({
    db,
    userId,
    date,
    favoritesRunId: favoritesRun?.id ?? null,
    followingRunId: followingRun?.id ?? null,
    clusters: topicClustering.topicClusters,
    threadUnits: topicClustering.threadUnits,
    posts,
    ai: options.ai,
    model: options.overviewModel,
  });
  generationTimingsMs.overviewCopy = Math.round(performance.now() - overviewStarted);
  const conversations = topicClustering.topicClusters.map((topic) => {
    const topicPosts = topic.postIds
      .map((postId) => postById.get(postId))
      .filter((post): post is DailyPost => Boolean(post));
    return {
      id: topic.id,
      evidenceType: 'TOPIC_SIMILARITY' as const,
      label: topic.label,
      evidence: topic.evidence,
      postIds: topic.postIds,
      authors: [...new Set(topicPosts.map((post) => post.author.username))],
      relationshipTypes: [
        ...new Set(
          topic.threadUnitIds.flatMap(
            (threadUnitId) => threadUnitsById.get(threadUnitId)?.relationshipTypes ?? []
          )
        ),
      ],
      favoritePostIds: topic.favoritePostIds,
      contextPostIds: topic.contextPostIds,
      favoriteAuthors: topic.favoriteAuthors,
      latestActivityAt: topic.latestActivityAt,
      coverageWarnings: topic.coverageWarnings,
    };
  });
  const favoriteUngroupedThreadIds = new Set(topicClustering.favoriteThreadUnitIds);
  const followingUngroupedThreadIds = new Set(topicClustering.followingThreadUnitIds);
  const unitIdByPostId = new Map(
    topicClustering.threadUnits.flatMap((unit) =>
      unit.postIds.map((postId) => [postId, unit.id] as const)
    )
  );
  const favoriteUngroupedIds = favoritePosts
    .filter((post) => favoriteUngroupedThreadIds.has(unitIdByPostId.get(post.id) ?? ''))
    .map((post) => post.id);
  const followingSectionIds = followingPosts
    .filter((post) => followingUngroupedThreadIds.has(unitIdByPostId.get(post.id) ?? ''))
    .map((post) => post.id);
  const runComplete = (run: ArchiveRunRow | null) => {
    if (!run) return true;
    const policy = collectionPolicy(run);
    if (policy.mode === 'ROLLING_WINDOW') {
      const coverage = windowCoverage(run);
      return (
        run.status === 'COMPLETE' &&
        run.termination_reason === 'WINDOW_BOUNDARY_REACHED' &&
        coverage.boundaryReached &&
        coverage.missingPublishedAt === 0
      );
    }
    return run.status === 'COMPLETE' && run.collected_count >= run.requested_count;
  };
  const archiveComplete = runComplete(favoritesRun) && runComplete(followingRun);
  const contextComplete =
    !favoriteContextCoverage ||
    (favoriteContextCoverage.truncated === 0 && favoriteContextCoverage.failed === 0);
  const membershipComplete = selectionStatus === 'COMPLETE' && unresolvedMembershipCount === 0;
  warnings.push(...contextWarnings);
  warnings.push(...topicClustering.warnings);
  for (const run of [favoritesRun, followingRun].filter(Boolean) as ArchiveRunRow[]) {
    if (!runComplete(run)) {
      const policy = collectionPolicy(run);
      warnings.push(
        policy.mode === 'ROLLING_WINDOW'
          ? `X ${run.source_name} run ${run.id} did not prove complete ${policy.windowHours}-hour coverage (${run.termination_reason.toLocaleLowerCase()}).`
          : `X ${run.source_name} run ${run.id} is ${run.status.toLocaleLowerCase()} (${run.collected_count}/${run.requested_count} requested posts).`
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

  generationTimingsMs.total = Math.round(performance.now() - generationStarted);
  return {
    schemaVersion: 3,
    variant: { id: 'people-first-v4-editorial-overview', mode: 'REVIEW' as const },
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
          ? `Frozen Favorites from the last ${favoritePolicy?.mode === 'ROLLING_WINDOW' ? favoritePolicy.windowHours : 24} hours, Following, and membership coverage are complete for this review slice.`
          : 'This review slice is usable with the coverage limits shown above.',
      collectionMode: favoritePolicy?.mode ?? 'COUNT',
      windowHours: favoritePolicy?.mode === 'ROLLING_WINDOW' ? favoritePolicy.windowHours : null,
      safetyLimit: favoritePolicy?.mode === 'ROLLING_WINDOW' ? favoritesRun?.requested_count : null,
      terminationReason:
        favoritesRun?.termination_reason ?? followingRun?.termination_reason ?? null,
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
    topicClusters: topicClustering.topicClusters,
    threadUnits: topicClustering.threadUnits,
    overview: dailyOverview.overview,
    overviewSections: dailyOverview.overviewSections,
    clustering: topicClustering.algorithm,
    posts,
    sections: {
      favoritePostIds: favoriteUngroupedIds,
      followingPostIds: followingSectionIds,
      favoriteThreadUnitIds: topicClustering.favoriteThreadUnitIds,
      followingThreadUnitIds: topicClustering.followingThreadUnitIds,
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
            collectionPolicy: favoritePolicy,
            terminationReason: favoritesRun.termination_reason,
            windowCoverage: favoriteWindowCoverage,
            contextCoverage: favoriteContextCoverage,
            structureCoverage: structureCoverage(favoritesRun),
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
            collectionPolicy: collectionPolicy(followingRun),
            terminationReason: followingRun.termination_reason,
            windowCoverage: windowCoverage(followingRun),
            contextCoverage: contextCoverage(followingRun),
            structureCoverage: structureCoverage(followingRun),
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
    generationTimingsMs,
  };
}

async function postsForAuthor(
  db: D1Database,
  userId: string,
  authorKey: string
): Promise<ArchivePostRow[]> {
  const rows = await db
    .prepare(
      `SELECT p.tweet_id, p.url, p.text, p.published_at, p.lang, p.kind,
        p.conversation_id, p.structure_json, p.author_key,
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
