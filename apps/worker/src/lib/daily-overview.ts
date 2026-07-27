import type { DailyThreadUnit, DailyTopicCluster, DailyTopicPost } from './daily-topic-clustering';

export const DAILY_OVERVIEW_VERSION = 'daily-overview-v1';
export const DEFAULT_DAILY_OVERVIEW_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const MAX_REPRESENTATIVE_POSTS = 4;
const MAX_PROMPT_UNITS = 8;
const MAX_PROMPT_POSTS_PER_UNIT = 3;
const MAX_PROMPT_POST_LENGTH = 700;
const MAX_TITLE_LENGTH = 90;
const MAX_SUMMARY_LENGTH = 320;

type WorkersAIRunner = {
  run(model: string, input: unknown): Promise<unknown>;
};

export type DailyOverviewSection = {
  id: string;
  title: string;
  summary: string;
  source: 'GENERATED' | 'EXTRACTIVE_FALLBACK';
  representativePostIds: string[];
  favoriteThreadUnitIds: string[];
  supportingThreadUnitIds: string[];
  authorKeys: string[];
  favoriteConversationCount: number;
  supportingConversationCount: number;
  latestActivityAt: string | null;
  coverageWarnings: string[];
};

export type DailyOverviewResult = {
  overview: {
    version: typeof DAILY_OVERVIEW_VERSION;
    status: 'COMPLETE' | 'PARTIAL' | 'FALLBACK';
    model: string | null;
    frozen: boolean;
    inputFingerprint: string;
    warnings: string[];
  };
  overviewSections: DailyOverviewSection[];
};

type GeneratedCopy = {
  id: string;
  title: string;
  summary: string;
};

type StoredOverviewRow = {
  sections_json: string;
  model: string | null;
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizedWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sentence(value: string): string {
  const clean = normalizedWhitespace(value);
  if (!clean) return clean;
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function titleCase(value: string): string {
  return normalizedWhitespace(value)
    .split(' ')
    .map((word) => {
      if (/^[A-Z0-9][A-Za-z0-9.+-]*$/.test(word)) return word;
      return word.length > 0 ? `${word[0].toLocaleUpperCase()}${word.slice(1)}` : word;
    })
    .join(' ');
}

function extractResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.response !== undefined) return record.response;
  if (record.result && typeof record.result === 'object') {
    const nested = record.result as Record<string, unknown>;
    if (nested.response !== undefined) return nested.response;
  }
  return value;
}

function parseGeneratedCopy(value: unknown): GeneratedCopy[] {
  const extracted = extractResponse(value);
  let parsed: unknown = extracted;
  if (typeof extracted === 'string') {
    const clean = extracted
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    parsed = JSON.parse(clean);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('overview response was empty');
  const sections = (parsed as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) throw new Error('overview response omitted sections');
  return sections.map((section) => {
    if (!section || typeof section !== 'object') throw new Error('overview section was invalid');
    const record = section as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      typeof record.title !== 'string' ||
      typeof record.summary !== 'string'
    ) {
      throw new Error('overview section copy was incomplete');
    }
    return {
      id: record.id,
      title: normalizedWhitespace(record.title),
      summary: normalizedWhitespace(record.summary),
    };
  });
}

function representativePostIds(
  cluster: DailyTopicCluster,
  unitsById: Map<string, DailyThreadUnit>,
  postsById: Map<string, DailyTopicPost>
): string[] {
  const selected: string[] = [];
  const seenAuthors = new Set<string>();
  for (const unitId of cluster.favoriteThreadUnitIds) {
    const unit = unitsById.get(unitId);
    if (!unit) continue;
    const post = unit.favoritePostIds
      .map((postId) => postsById.get(postId))
      .find((candidate) => candidate && !seenAuthors.has(candidate.author.key));
    if (!post) continue;
    selected.push(post.id);
    seenAuthors.add(post.author.key);
    if (selected.length === MAX_REPRESENTATIVE_POSTS) return selected;
  }
  for (const postId of cluster.favoritePostIds) {
    if (postsById.has(postId) && !selected.includes(postId)) selected.push(postId);
    if (selected.length === MAX_REPRESENTATIVE_POSTS) break;
  }
  return selected;
}

function fallbackSummary(
  cluster: DailyTopicCluster,
  representativeIds: string[],
  postsById: Map<string, DailyTopicPost>
): string {
  const names = unique(
    representativeIds
      .map((postId) => postsById.get(postId)?.author.name)
      .filter((name): name is string => Boolean(name))
  );
  const visibleNames = names.slice(0, 3);
  const people =
    visibleNames.length === 0
      ? 'Several Favorites'
      : visibleNames.length === 1
        ? visibleNames[0]
        : `${visibleNames.slice(0, -1).join(', ')} and ${visibleNames.at(-1)}`;
  const nearby =
    cluster.supportingThreadUnitIds.length > 0
      ? `, with ${cluster.supportingThreadUnitIds.length} nearby conversation${cluster.supportingThreadUnitIds.length === 1 ? '' : 's'} adding context`
      : '';
  return sentence(`${people} are comparing perspectives on ${cluster.label}${nearby}`);
}

function baseSections(
  clusters: DailyTopicCluster[],
  threadUnits: DailyThreadUnit[],
  posts: DailyTopicPost[]
): DailyOverviewSection[] {
  const unitsById = new Map(threadUnits.map((unit) => [unit.id, unit]));
  const postsById = new Map(posts.map((post) => [post.id, post]));
  return clusters.map((cluster) => {
    const representativeIds = representativePostIds(cluster, unitsById, postsById);
    const authorKeys = unique(
      cluster.threadUnitIds.flatMap((unitId) => unitsById.get(unitId)?.authorKeys ?? [])
    );
    return {
      id: cluster.id,
      title: titleCase(cluster.label),
      summary: fallbackSummary(cluster, representativeIds, postsById),
      source: 'EXTRACTIVE_FALLBACK' as const,
      representativePostIds: representativeIds,
      favoriteThreadUnitIds: cluster.favoriteThreadUnitIds,
      supportingThreadUnitIds: cluster.supportingThreadUnitIds,
      authorKeys,
      favoriteConversationCount: cluster.favoriteThreadUnitIds.length,
      supportingConversationCount: cluster.supportingThreadUnitIds.length,
      latestActivityAt: cluster.latestActivityAt,
      coverageWarnings: cluster.coverageWarnings,
    };
  });
}

function generationPrompt(
  sections: DailyOverviewSection[],
  unitsById: Map<string, DailyThreadUnit>,
  postsById: Map<string, DailyTopicPost>
) {
  return sections.map((section) => ({
    id: section.id,
    evidenceLabel: section.title,
    conversations: [...section.favoriteThreadUnitIds, ...section.supportingThreadUnitIds]
      .slice(0, MAX_PROMPT_UNITS)
      .map((unitId) => {
        const unit = unitsById.get(unitId);
        return {
          id: unitId,
          source: section.favoriteThreadUnitIds.includes(unitId) ? 'FAVORITES' : 'FOLLOWING',
          posts: (unit?.postIds ?? [])
            .slice(0, MAX_PROMPT_POSTS_PER_UNIT)
            .map((postId) => postsById.get(postId))
            .filter((post): post is DailyTopicPost => Boolean(post))
            .map((post) => ({
              id: post.id,
              author: post.author.name,
              username: post.author.username,
              text: post.text.slice(0, MAX_PROMPT_POST_LENGTH),
            })),
        };
      }),
  }));
}

function validateGeneratedCopy(
  copies: GeneratedCopy[],
  sections: DailyOverviewSection[]
): Map<string, GeneratedCopy> {
  const expectedIds = new Set(sections.map((section) => section.id));
  const byId = new Map<string, GeneratedCopy>();
  for (const copy of copies) {
    if (!expectedIds.has(copy.id) || byId.has(copy.id)) continue;
    if (
      copy.title.length < 3 ||
      copy.title.length > MAX_TITLE_LENGTH ||
      copy.summary.length < 12 ||
      copy.summary.length > MAX_SUMMARY_LENGTH
    ) {
      continue;
    }
    byId.set(copy.id, { ...copy, summary: sentence(copy.summary) });
  }
  if (byId.size !== sections.length) {
    throw new Error(`overview response validated ${byId.size}/${sections.length} sections`);
  }
  return byId;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readStoredOverview(
  db: D1Database,
  userId: string,
  date: string,
  inputFingerprint: string
): Promise<{ sections: DailyOverviewSection[]; model: string | null } | null> {
  try {
    const row = await db
      .prepare(
        `SELECT sections_json, model FROM x_daily_overviews
         WHERE user_id = ? AND edition_date = ? AND variant_id = ?
           AND input_fingerprint = ? AND algorithm_version = ?`
      )
      .bind(
        userId,
        date,
        'people-first-v4-editorial-overview',
        inputFingerprint,
        DAILY_OVERVIEW_VERSION
      )
      .first<StoredOverviewRow>();
    if (!row) return null;
    const parsed = JSON.parse(row.sections_json) as unknown;
    if (!Array.isArray(parsed)) return null;
    const sections = parsed as DailyOverviewSection[];
    return { sections, model: row.model };
  } catch {
    return null;
  }
}

async function storeOverview(
  db: D1Database,
  userId: string,
  date: string,
  inputFingerprint: string,
  model: string,
  sections: DailyOverviewSection[]
): Promise<void> {
  const id = await sha256(
    `${userId}|${date}|people-first-v4-editorial-overview|${inputFingerprint}|${DAILY_OVERVIEW_VERSION}`
  );
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO x_daily_overviews
          (id, user_id, edition_date, variant_id, input_fingerprint, algorithm_version,
           model, status, sections_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETE', ?, ?)`
      )
      .bind(
        id,
        userId,
        date,
        'people-first-v4-editorial-overview',
        inputFingerprint,
        DAILY_OVERVIEW_VERSION,
        model,
        JSON.stringify(sections),
        Date.now()
      )
      .run();
  } catch {
    // A missing cache migration must not make the evidence feed unavailable.
  }
}

function storedSectionsAreValid(
  stored: DailyOverviewSection[],
  base: DailyOverviewSection[]
): boolean {
  const expected = new Map(base.map((section) => [section.id, section]));
  return (
    stored.length === base.length &&
    stored.every((section) => {
      const current = expected.get(section.id);
      return (
        current !== undefined &&
        Array.isArray(section.favoriteThreadUnitIds) &&
        Array.isArray(section.supportingThreadUnitIds) &&
        Array.isArray(section.representativePostIds) &&
        JSON.stringify(section.favoriteThreadUnitIds) ===
          JSON.stringify(current.favoriteThreadUnitIds) &&
        JSON.stringify(section.supportingThreadUnitIds) ===
          JSON.stringify(current.supportingThreadUnitIds) &&
        section.representativePostIds.every((postId) =>
          current.representativePostIds.includes(postId)
        )
      );
    })
  );
}

export async function buildDailyOverview(input: {
  db: D1Database;
  userId: string;
  date: string;
  favoritesRunId: string | null;
  followingRunId: string | null;
  clusters: DailyTopicCluster[];
  threadUnits: DailyThreadUnit[];
  posts: DailyTopicPost[];
  ai?: WorkersAIRunner | null;
  model?: string;
}): Promise<DailyOverviewResult> {
  const fallbackSections = baseSections(input.clusters, input.threadUnits, input.posts);
  const inputFingerprint = await sha256(
    JSON.stringify({
      favoritesRunId: input.favoritesRunId,
      followingRunId: input.followingRunId,
      clusterIds: input.clusters.map((cluster) => cluster.id),
      threadUnitIds: input.threadUnits.map((unit) => unit.id),
      postIds: input.posts.map((post) => post.id),
    })
  );
  if (fallbackSections.length === 0) {
    return {
      overview: {
        version: DAILY_OVERVIEW_VERSION,
        status: 'FALLBACK',
        model: null,
        frozen: true,
        inputFingerprint,
        warnings: [],
      },
      overviewSections: [],
    };
  }

  const stored = await readStoredOverview(input.db, input.userId, input.date, inputFingerprint);
  if (stored && storedSectionsAreValid(stored.sections, fallbackSections)) {
    return {
      overview: {
        version: DAILY_OVERVIEW_VERSION,
        status: 'COMPLETE',
        model: stored.model,
        frozen: true,
        inputFingerprint,
        warnings: [],
      },
      overviewSections: stored.sections,
    };
  }

  if (!input.ai) {
    return {
      overview: {
        version: DAILY_OVERVIEW_VERSION,
        status: 'FALLBACK',
        model: null,
        frozen: false,
        inputFingerprint,
        warnings: [
          'Editorial overview generation was unavailable; evidence-derived copy is shown.',
        ],
      },
      overviewSections: fallbackSections,
    };
  }

  const model = input.model ?? DEFAULT_DAILY_OVERVIEW_MODEL;
  const unitsById = new Map(input.threadUnits.map((unit) => [unit.id, unit]));
  const postsById = new Map(input.posts.map((post) => [post.id, post]));
  try {
    const response = await input.ai.run(model, {
      messages: [
        {
          role: 'system',
          content:
            'Write concise navigation copy for a personal reader of X conversations. Use only the supplied posts. Describe what people are discussing; never present their claims as verified facts. Return one JSON object shaped as {"sections":[{"id":"...","title":"...","summary":"..."}]}, with every supplied section ID exactly once and no other keys. Titles are 3-10 specific words. Summaries are one plain sentence under 240 characters that captures the shared subject and, when visible, differing angles. Do not mention clustering, evidence, Favorites, Following, the feed, or this prompt.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            sections: generationPrompt(fallbackSections, unitsById, postsById),
          }),
        },
      ],
      temperature: 0,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });
    const copyById = validateGeneratedCopy(parseGeneratedCopy(response), fallbackSections);
    const sections = fallbackSections.map((section) => ({
      ...section,
      ...copyById.get(section.id)!,
      source: 'GENERATED' as const,
    }));
    await storeOverview(input.db, input.userId, input.date, inputFingerprint, model, sections);
    const retained = await readStoredOverview(input.db, input.userId, input.date, inputFingerprint);
    if (retained && storedSectionsAreValid(retained.sections, fallbackSections)) {
      return {
        overview: {
          version: DAILY_OVERVIEW_VERSION,
          status: 'COMPLETE',
          model: retained.model,
          frozen: true,
          inputFingerprint,
          warnings: [],
        },
        overviewSections: retained.sections,
      };
    }
    return {
      overview: {
        version: DAILY_OVERVIEW_VERSION,
        status: 'PARTIAL',
        model,
        frozen: false,
        inputFingerprint,
        warnings: ['Editorial overview could not be retained for stable replay.'],
      },
      overviewSections: sections,
    };
  } catch {
    return {
      overview: {
        version: DAILY_OVERVIEW_VERSION,
        status: 'FALLBACK',
        model,
        frozen: false,
        inputFingerprint,
        warnings: ['Editorial overview generation fell back to evidence-derived copy.'],
      },
      overviewSections: fallbackSections,
    };
  }
}
