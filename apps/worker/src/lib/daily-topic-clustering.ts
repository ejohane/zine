export const DAILY_TOPIC_ALGORITHM_VERSION = 'daily-topics-v1';
export const DEFAULT_DAILY_TOPIC_EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b';

const MAX_TOPICS = 5;
const MAX_SUPPORTING_UNITS = 8;
const MAX_TOPIC_CANDIDATES = 40;
const MAX_SEMANTIC_UNITS = 256;
const MAX_SEMANTIC_SEEDS = 8;
const MAX_EMBEDDING_TEXT_LENGTH = 1_600;
const SEMANTIC_EXPANSION_THRESHOLD = 0.8;
const SEMANTIC_STRONG_THRESHOLD = 0.87;

const TOPIC_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'another',
  'because',
  'before',
  'being',
  'below',
  'could',
  'does',
  'doing',
  'from',
  'getting',
  'have',
  'here',
  'into',
  'just',
  'like',
  'looking',
  'make',
  'more',
  'much',
  'need',
  'only',
  'other',
  'really',
  'should',
  'some',
  'still',
  'than',
  'that',
  'their',
  'there',
  'these',
  'they',
  'thing',
  'think',
  'this',
  'those',
  'through',
  'today',
  'very',
  'want',
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

type TopicPostRelationship = {
  type: string;
  tweetId: string;
  evidenceSource?: string | null;
  target?: { text?: string | null } | null;
};

type TopicPostLink = {
  url?: string;
  normalizedUrl?: string;
  displayUrl?: string | null;
  card?: { domain?: string | null } | null;
};

export type DailyTopicPost = {
  id: string;
  text: string;
  publishedAt: string | null;
  observedAt: string | null;
  kind: string;
  conversationId?: string | null;
  structure?: unknown;
  author: { key: string; username: string; name: string };
  repostedBy?: { key: string; username: string; name: string } | null;
  relationships: TopicPostRelationship[];
  links: TopicPostLink[];
  sourcePosition: number | null;
};

export type DailyThreadUnit = {
  id: string;
  conversationId: string | null;
  rootPostId: string;
  postIds: string[];
  favoritePostIds: string[];
  followingPostIds: string[];
  contextPostIds: string[];
  authorKeys: string[];
  favoriteAuthorKeys: string[];
  authors: string[];
  favoriteAuthors: string[];
  relationshipTypes: string[];
  structureStatus: 'EXACT' | 'PARTIAL';
  latestActivityAt: string | null;
  firstSourcePosition: number | null;
  coverageWarnings: string[];
};

export type DailyTopicSignal = {
  type:
    | 'DIRECT_REFERENCE'
    | 'SHARED_PHRASE'
    | 'SHARED_LINK'
    | 'SHARED_MARKER'
    | 'SEMANTIC_SIMILARITY';
  value: string;
  threadUnitIds: string[];
};

export type DailyTopicCluster = {
  id: string;
  label: string;
  labelSource: 'EXTRACTED_PHRASE' | 'CANONICAL_LINK';
  labelTerms: string[];
  evidence: string;
  evidenceSignals: DailyTopicSignal[];
  threadUnitIds: string[];
  favoriteThreadUnitIds: string[];
  supportingThreadUnitIds: string[];
  postIds: string[];
  favoritePostIds: string[];
  contextPostIds: string[];
  favoriteAuthors: string[];
  supportingAuthors: string[];
  score: number;
  latestActivityAt: string | null;
  coverageWarnings: string[];
};

export type DailyTopicClusteringResult = {
  algorithm: {
    version: string;
    method: 'THREAD_FIRST_EVIDENCE_CLUSTERING';
    semanticStatus: 'COMPLETE' | 'PARTIAL' | 'FALLBACK';
    embeddingModel: string | null;
    maxTopics: number;
    minimumFavoriteAuthors: number;
    candidateLimit: number;
    semanticUnitLimit: number;
  };
  threadUnits: DailyThreadUnit[];
  topicClusters: DailyTopicCluster[];
  favoriteThreadUnitIds: string[];
  followingThreadUnitIds: string[];
  warnings: string[];
};

export type DailyTopicEmbeddingProvider = {
  model: string;
  embed(texts: string[]): Promise<number[][]>;
};

type WorkersAIRunner = {
  run(model: string, input: unknown): Promise<unknown>;
};

function embeddingBatchFromResponse(response: unknown): number[][] {
  if (!response || typeof response !== 'object') {
    throw new Error('embedding response was empty');
  }
  const record = response as Record<string, unknown>;
  const direct = record.data;
  if (Array.isArray(direct) && direct.every((value) => Array.isArray(value))) {
    return direct as number[][];
  }
  if (
    Array.isArray(direct) &&
    direct.every(
      (value) =>
        value &&
        typeof value === 'object' &&
        Array.isArray((value as Record<string, unknown>).embedding)
    )
  ) {
    return direct.map((value) => (value as { embedding: number[] }).embedding);
  }
  const result = record.result;
  if (result && typeof result === 'object') {
    const nested = (result as Record<string, unknown>).data;
    if (Array.isArray(nested) && nested.every((value) => Array.isArray(value))) {
      return nested as number[][];
    }
  }
  throw new Error('embedding response did not contain a vector batch');
}

export function createWorkersAIDailyTopicEmbeddingProvider(
  ai: WorkersAIRunner | null | undefined,
  model = DEFAULT_DAILY_TOPIC_EMBEDDING_MODEL
): DailyTopicEmbeddingProvider | null {
  if (!ai) return null;
  return {
    model,
    async embed(texts: string[]) {
      const values: number[][] = [];
      for (let offset = 0; offset < texts.length; offset += 32) {
        const batch = texts.slice(offset, offset + 32);
        const response = await ai.run(model, { text: batch });
        const vectors = embeddingBatchFromResponse(response);
        if (vectors.length !== batch.length) {
          throw new Error(`embedding batch returned ${vectors.length}/${batch.length} vectors`);
        }
        values.push(...vectors);
      }
      return values;
    },
  };
}

type FeatureKind = 'REFERENCE' | 'URL' | 'MODEL' | 'TRIGRAM' | 'BIGRAM' | 'MARKER' | 'TOKEN';

type Feature = {
  key: string;
  kind: FeatureKind;
  value: string;
  surface: string;
  weight: number;
};

type UnitProfile = {
  unit: DailyThreadUnit;
  features: Map<string, Feature>;
  text: string;
};

type TopicCandidate = {
  anchors: Feature[];
  favoriteUnitIds: Set<string>;
  supportingUnitIds: Set<string>;
  semanticEvidence: Map<string, number>;
};

function timestamp(post: DailyTopicPost): number {
  return Date.parse(post.publishedAt ?? post.observedAt ?? '') || 0;
}

function latestActivity(posts: DailyTopicPost[]): string | null {
  const latest = Math.max(0, ...posts.map(timestamp));
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function structureStatus(post: DailyTopicPost): 'EXACT' | 'PARTIAL' {
  if (!post.structure || typeof post.structure !== 'object') return 'PARTIAL';
  return (post.structure as { status?: unknown }).status === 'EXACT' ? 'EXACT' : 'PARTIAL';
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function orderedPosts(posts: DailyTopicPost[]): DailyTopicPost[] {
  const ids = new Set(posts.map((post) => post.id));
  const parentById = new Map<string, string>();
  for (const post of posts) {
    const parent = post.relationships.find(
      (relationship) => relationship.type === 'REPLY_TO' && ids.has(relationship.tweetId)
    );
    if (parent) parentById.set(post.id, parent.tweetId);
  }
  const depthMemo = new Map<string, number>();
  const depth = (id: string, visiting = new Set<string>()): number => {
    const cached = depthMemo.get(id);
    if (cached !== undefined) return cached;
    const parent = parentById.get(id);
    if (!parent || visiting.has(id)) return 0;
    visiting.add(id);
    const value = depth(parent, visiting) + 1;
    depthMemo.set(id, value);
    return value;
  };
  return [...posts].sort(
    (left, right) =>
      depth(left.id) - depth(right.id) ||
      timestamp(left) - timestamp(right) ||
      left.id.localeCompare(right.id)
  );
}

export function buildDailyThreadUnits(
  posts: DailyTopicPost[],
  favoritePostIds: Set<string>,
  followingPostIds: Set<string>
): DailyThreadUnit[] {
  const postById = new Map(posts.map((post) => [post.id, post]));
  const parents = new Map(posts.map((post) => [post.id, post.id]));
  const find = (id: string): string => {
    const parent = parents.get(id) ?? id;
    if (parent === id) return id;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };
  const union = (leftId: string, rightId: string) => {
    const left = find(leftId);
    const right = find(rightId);
    if (left === right) return;
    const [first, second] = [left, right].sort();
    parents.set(second, first);
  };

  const byConversation = new Map<string, string[]>();
  for (const post of posts) {
    if (post.conversationId) {
      byConversation.set(post.conversationId, [
        ...(byConversation.get(post.conversationId) ?? []),
        post.id,
      ]);
    }
    for (const relationship of post.relationships) {
      if (relationship.type === 'REPLY_TO' && postById.has(relationship.tweetId)) {
        union(post.id, relationship.tweetId);
      }
    }
  }
  for (const ids of byConversation.values()) {
    for (let index = 1; index < ids.length; index++) union(ids[0], ids[index]);
  }

  const grouped = new Map<string, DailyTopicPost[]>();
  for (const post of posts) {
    const root = find(post.id);
    grouped.set(root, [...(grouped.get(root) ?? []), post]);
  }

  return [...grouped.values()]
    .map((groupPosts): DailyThreadUnit => {
      const ordered = orderedPosts(groupPosts);
      const ids = new Set(ordered.map((post) => post.id));
      const conversationIds = unique(
        ordered.flatMap((post) => (post.conversationId ? [post.conversationId] : []))
      );
      const conversationId = conversationIds.length === 1 ? conversationIds[0] : null;
      const root =
        ordered.find(
          (post) =>
            !post.relationships.some(
              (relationship) => relationship.type === 'REPLY_TO' && ids.has(relationship.tweetId)
            )
        ) ?? ordered[0];
      const favoritePosts = ordered.filter((post) => favoritePostIds.has(post.id));
      const followingPosts = ordered.filter((post) => followingPostIds.has(post.id));
      const contextPosts = ordered.filter(
        (post) => !favoritePostIds.has(post.id) && !followingPostIds.has(post.id)
      );
      const exact = ordered.every((post) => structureStatus(post) === 'EXACT');
      const relationshipTypes = unique(
        ordered.flatMap((post) =>
          post.relationships
            .filter(
              (relationship) => relationship.type === 'REPLY_TO' && ids.has(relationship.tweetId)
            )
            .map((relationship) => relationship.type)
        )
      );
      if (conversationId && ordered.length > 1) relationshipTypes.push('CONVERSATION_ID');
      const sourcePositions = [...favoritePosts, ...followingPosts]
        .map((post) => post.sourcePosition)
        .filter((position): position is number => position !== null);
      const stableIdentity = conversationId ?? root.id;
      return {
        id: `${conversationId ? 'conversation' : 'post'}:${stableIdentity}`,
        conversationId,
        rootPostId: root.id,
        postIds: ordered.map((post) => post.id),
        favoritePostIds: favoritePosts.map((post) => post.id),
        followingPostIds: followingPosts.map((post) => post.id),
        contextPostIds: contextPosts.map((post) => post.id),
        authorKeys: unique(ordered.map((post) => post.author.key)),
        favoriteAuthorKeys: unique(
          favoritePosts.map((post) => post.repostedBy?.key ?? post.author.key)
        ),
        authors: unique(ordered.map((post) => post.author.username)),
        favoriteAuthors: unique(
          favoritePosts.map((post) => post.repostedBy?.username ?? post.author.username)
        ),
        relationshipTypes: unique(relationshipTypes),
        structureStatus: exact ? 'EXACT' : 'PARTIAL',
        latestActivityAt: latestActivity(ordered),
        firstSourcePosition: sourcePositions.length > 0 ? Math.min(...sourcePositions) : null,
        coverageWarnings: exact ? [] : ['Some posts in this thread have partial structure.'],
      };
    })
    .sort(
      (left, right) =>
        (left.firstSourcePosition ?? Number.MAX_SAFE_INTEGER) -
          (right.firstSourcePosition ?? Number.MAX_SAFE_INTEGER) ||
        (Date.parse(right.latestActivityAt ?? '') || 0) -
          (Date.parse(left.latestActivityAt ?? '') || 0) ||
        left.id.localeCompare(right.id)
    );
}

function normalizedToken(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/^[@#]/, '')
    .replace(/[^a-z0-9_]/g, '');
  if (normalized.length > 4 && normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
  if (
    normalized.length > 4 &&
    normalized.endsWith('s') &&
    !normalized.endsWith('ss') &&
    !normalized.endsWith('us')
  ) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function featureWeight(kind: FeatureKind): number {
  switch (kind) {
    case 'REFERENCE':
      return 9;
    case 'URL':
      return 8;
    case 'MODEL':
      return 6;
    case 'TRIGRAM':
      return 4;
    case 'BIGRAM':
      return 2.5;
    case 'MARKER':
      return 3;
    case 'TOKEN':
      return 1;
  }
}

function addFeature(
  features: Map<string, Feature>,
  kind: FeatureKind,
  value: string,
  surface: string
) {
  const key = `${kind.toLocaleLowerCase()}:${value}`;
  if (!features.has(key)) {
    features.set(key, { key, kind, value, surface, weight: featureWeight(kind) });
  }
}

function contentTokens(
  text: string
): Array<{ value: string; surface: string; marker: string | null }> {
  const prepared = text.replace(/[\u2010-\u2015-]/g, ' ');
  const raw = prepared.match(/[@#]?[\p{L}\p{N}_]+/gu) ?? [];
  return raw.flatMap((surface) => {
    const marker = surface.startsWith('@') || surface.startsWith('#') ? surface[0] : null;
    const value = normalizedToken(surface);
    if (!value || TOPIC_STOP_WORDS.has(value)) return [];
    if (value.length < 3 && !/\d/.test(value)) return [];
    return [{ value, surface: surface.replace(/^[@#]/, ''), marker }];
  });
}

function canonicalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hostname = url.hostname.replace(/^www\./, '').toLocaleLowerCase();
    url.hash = '';
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

function profileForUnit(
  unit: DailyThreadUnit,
  postsById: Map<string, DailyTopicPost>
): UnitProfile {
  const features = new Map<string, Feature>();
  const textParts: string[] = [];
  for (const postId of unit.postIds) {
    const post = postsById.get(postId);
    if (!post) continue;
    const texts = [
      post.text,
      ...post.relationships.flatMap((relationship) =>
        relationship.type === 'QUOTE_OF' || relationship.type === 'REPOST_OF'
          ? [relationship.target?.text ?? '']
          : []
      ),
    ].filter(Boolean);
    for (const text of texts) {
      textParts.push(text);
      const tokens = contentTokens(text);
      for (const token of tokens) {
        addFeature(features, 'TOKEN', token.value, token.surface);
        if (token.marker) {
          addFeature(
            features,
            'MARKER',
            `${token.marker}${token.value}`,
            `${token.marker}${token.surface}`
          );
        }
      }
      for (let index = 0; index < tokens.length - 1; index++) {
        const left = tokens[index];
        const right = tokens[index + 1];
        const value = `${left.value} ${right.value}`;
        const surface = `${left.surface} ${right.surface}`;
        addFeature(
          features,
          /\d/.test(left.value) || /\d/.test(right.value) ? 'MODEL' : 'BIGRAM',
          value,
          surface
        );
      }
      for (let index = 0; index < tokens.length - 2; index++) {
        const slice = tokens.slice(index, index + 3);
        addFeature(
          features,
          'TRIGRAM',
          slice.map((token) => token.value).join(' '),
          slice.map((token) => token.surface).join(' ')
        );
      }
    }
    for (const link of post.links) {
      const url = canonicalUrl(link.normalizedUrl ?? link.url);
      if (!url) continue;
      let surface = link.displayUrl ?? link.card?.domain ?? url;
      try {
        surface = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        // The canonical URL remains explicit evidence when its host cannot be displayed.
      }
      addFeature(features, 'URL', url, surface);
    }
  }
  return {
    unit,
    features,
    text: textParts.join('\n\n').slice(0, MAX_EMBEDDING_TEXT_LENGTH),
  };
}

function featureSimilarity(left: UnitProfile, right: UnitProfile): number {
  const keys = new Set([...left.features.keys(), ...right.features.keys()]);
  let intersection = 0;
  let union = 0;
  for (const key of keys) {
    const leftWeight = left.features.get(key)?.weight ?? 0;
    const rightWeight = right.features.get(key)?.weight ?? 0;
    intersection += Math.min(leftWeight, rightWeight);
    union += Math.max(leftWeight, rightWeight);
  }
  return union > 0 ? intersection / union : 0;
}

function cosine(left: number[] | undefined, right: number[] | undefined): number {
  if (!left || !right || left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function authorKeysForUnit(
  unit: DailyThreadUnit,
  postsById: Map<string, DailyTopicPost>
): string[] {
  return unique(
    unit.favoritePostIds.flatMap((postId) => {
      const post = postsById.get(postId);
      return post ? [post.repostedBy?.key ?? post.author.key] : [];
    })
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}

function signalType(feature: Feature): DailyTopicSignal['type'] {
  if (feature.kind === 'REFERENCE') return 'DIRECT_REFERENCE';
  if (feature.kind === 'URL') return 'SHARED_LINK';
  if (feature.kind === 'MARKER') return 'SHARED_MARKER';
  return 'SHARED_PHRASE';
}

function labelForAnchors(anchors: Feature[]): {
  label: string;
  labelTerms: string[];
  source: DailyTopicCluster['labelSource'];
} {
  const ordered = [...anchors].sort(
    (left, right) =>
      right.weight - left.weight ||
      right.value.split(' ').length - left.value.split(' ').length ||
      left.value.localeCompare(right.value)
  );
  const selected: Feature[] = [];
  for (const anchor of ordered) {
    if (
      selected.some(
        (existing) => existing.value.includes(anchor.value) || anchor.value.includes(existing.value)
      )
    ) {
      continue;
    }
    selected.push(anchor);
    if (selected.length === 2) break;
  }
  const labelTerms = selected.map((feature) => feature.surface.trim()).filter(Boolean);
  const fallback = ordered[0]?.surface || 'Shared evidence';
  return {
    label: (labelTerms.length > 0 ? labelTerms : [fallback]).join(' · '),
    labelTerms: labelTerms.length > 0 ? labelTerms : [fallback],
    source: selected[0]?.kind === 'URL' ? 'CANONICAL_LINK' : 'EXTRACTED_PHRASE',
  };
}

function quotedUnitIds(
  unit: DailyThreadUnit,
  postsById: Map<string, DailyTopicPost>,
  unitIdByPostId: Map<string, string>
): string[] {
  return unique(
    unit.postIds.flatMap((postId) => {
      const post = postsById.get(postId);
      return (
        post?.relationships.flatMap((relationship) =>
          relationship.type === 'QUOTE_OF' || relationship.type === 'REPOST_OF'
            ? [unitIdByPostId.get(relationship.tweetId)].filter((value): value is string =>
                Boolean(value)
              )
            : []
        ) ?? []
      );
    })
  );
}

export async function buildDailyTopicClustering(
  posts: DailyTopicPost[],
  favoritePostIds: Set<string>,
  followingPostIds: Set<string>,
  options: {
    embeddingProvider?: DailyTopicEmbeddingProvider | null;
  } = {}
): Promise<DailyTopicClusteringResult> {
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const threadUnits = buildDailyThreadUnits(posts, favoritePostIds, followingPostIds);
  const unitsById = new Map(threadUnits.map((unit) => [unit.id, unit]));
  const unitIdByPostId = new Map(
    threadUnits.flatMap((unit) => unit.postIds.map((postId) => [postId, unit.id] as const))
  );
  const profiles = new Map(
    threadUnits.map((unit) => [unit.id, profileForUnit(unit, postsById)] as const)
  );
  for (const unit of threadUnits) {
    for (const referencedUnitId of quotedUnitIds(unit, postsById, unitIdByPostId)) {
      if (referencedUnitId === unit.id) continue;
      const sourceProfile = profiles.get(unit.id);
      const targetProfile = profiles.get(referencedUnitId);
      if (!sourceProfile || !targetProfile) continue;
      const targetAnchors = [...targetProfile.features.values()].filter(
        (feature) => feature.kind !== 'TOKEN' && feature.kind !== 'REFERENCE'
      );
      if (targetAnchors.length === 0) continue;
      const surface = labelForAnchors(targetAnchors).labelTerms[0];
      if (!surface) continue;
      const referenceValue = referencedUnitId;
      addFeature(sourceProfile.features, 'REFERENCE', referenceValue, surface);
      addFeature(targetProfile.features, 'REFERENCE', referenceValue, surface);
    }
  }
  const favoriteUnits = threadUnits.filter((unit) => unit.favoritePostIds.length > 0);
  const followingUnits = threadUnits.filter(
    (unit) => unit.favoritePostIds.length === 0 && unit.followingPostIds.length > 0
  );
  const warnings: string[] = [];
  const embeddings = new Map<string, number[]>();
  const semanticUnits = favoriteUnits.slice(0, MAX_SEMANTIC_UNITS);
  let semanticStatus: 'COMPLETE' | 'PARTIAL' | 'FALLBACK' = 'FALLBACK';
  if (options.embeddingProvider && favoriteUnits.length >= 2) {
    try {
      const texts = semanticUnits.map((unit) => profiles.get(unit.id)?.text ?? '');
      const values = await options.embeddingProvider.embed(texts);
      if (values.length !== semanticUnits.length) {
        throw new Error('embedding count did not match Favorite thread units');
      }
      for (let index = 0; index < semanticUnits.length; index++) {
        embeddings.set(semanticUnits[index].id, values[index]);
      }
      semanticStatus = semanticUnits.length === favoriteUnits.length ? 'COMPLETE' : 'PARTIAL';
      if (semanticStatus === 'PARTIAL') {
        warnings.push(
          `Semantic expansion covered the first ${semanticUnits.length}/${favoriteUnits.length} Favorite thread units in source order; explicit evidence still covered every unit.`
        );
      }
    } catch (error) {
      warnings.push(
        `Semantic similarity was unavailable; explicit phrases, links, and relationships were used (${error instanceof Error ? error.message : String(error)}).`
      );
    }
  } else if (favoriteUnits.length >= 2) {
    warnings.push('Semantic similarity was unavailable; explicit phrases and links were used.');
  }

  const featureSupport = new Map<
    string,
    { feature: Feature; unitIds: Set<string>; authorKeys: Set<string> }
  >();
  for (const unit of favoriteUnits) {
    const authorKeys = authorKeysForUnit(unit, postsById);
    for (const feature of profiles.get(unit.id)?.features.values() ?? []) {
      if (feature.kind === 'TOKEN' && feature.value.length < 5) continue;
      const support = featureSupport.get(feature.key) ?? {
        feature,
        unitIds: new Set<string>(),
        authorKeys: new Set<string>(),
      };
      support.unitIds.add(unit.id);
      authorKeys.forEach((authorKey) => support.authorKeys.add(authorKey));
      featureSupport.set(feature.key, support);
    }
  }

  const qualifyingFeatureSupport = [...featureSupport.values()]
    .filter(({ feature, authorKeys, unitIds }) => {
      if (unitIds.size < 2) return false;
      if (authorKeys.size < 2) return false;
      if (feature.kind === 'TOKEN') return authorKeys.size >= 3;
      if (feature.kind === 'MARKER') return authorKeys.size >= 3;
      return true;
    })
    .sort(
      (left, right) =>
        right.authorKeys.size - left.authorKeys.size ||
        right.unitIds.size - left.unitIds.size ||
        right.feature.weight - left.feature.weight ||
        left.feature.key.localeCompare(right.feature.key)
    );
  if (qualifyingFeatureSupport.length > MAX_TOPIC_CANDIDATES) {
    warnings.push(
      `Topic candidate evaluation retained the strongest ${MAX_TOPIC_CANDIDATES}/${qualifyingFeatureSupport.length} corroborated evidence signals.`
    );
  }
  const candidates: TopicCandidate[] = qualifyingFeatureSupport
    .slice(0, MAX_TOPIC_CANDIDATES)
    .map(({ feature, unitIds }) => ({
      anchors: [feature],
      favoriteUnitIds: new Set(unitIds),
      supportingUnitIds: new Set<string>(),
      semanticEvidence: new Map<string, number>(),
    }));

  const mergedCandidates: TopicCandidate[] = [];
  for (const candidate of candidates) {
    const existing = mergedCandidates.find(
      (other) =>
        jaccard(other.favoriteUnitIds, candidate.favoriteUnitIds) >= 0.75 ||
        [...candidate.favoriteUnitIds].every((unitId) => other.favoriteUnitIds.has(unitId))
    );
    if (existing) {
      existing.anchors.push(...candidate.anchors);
      candidate.favoriteUnitIds.forEach((unitId) => existing.favoriteUnitIds.add(unitId));
    } else {
      mergedCandidates.push(candidate);
    }
  }

  for (const candidate of mergedCandidates) {
    const seeds = [...candidate.favoriteUnitIds].slice(0, MAX_SEMANTIC_SEEDS);
    for (const unit of semanticUnits) {
      if (candidate.favoriteUnitIds.has(unit.id)) continue;
      const profile = profiles.get(unit.id);
      if (!profile) continue;
      const lexical = Math.max(
        0,
        ...seeds.map((seedId) => featureSimilarity(profile, profiles.get(seedId)!))
      );
      const semantic = Math.max(
        0,
        ...seeds.map((seedId) => cosine(embeddings.get(unit.id), embeddings.get(seedId)))
      );
      if (
        semantic >= SEMANTIC_STRONG_THRESHOLD ||
        (semantic >= SEMANTIC_EXPANSION_THRESHOLD && lexical >= 0.08)
      ) {
        candidate.favoriteUnitIds.add(unit.id);
        candidate.semanticEvidence.set(unit.id, semantic);
      }
    }

    const explicitSupport = new Set(
      [...candidate.favoriteUnitIds].flatMap((unitId) =>
        quotedUnitIds(unitsById.get(unitId)!, postsById, unitIdByPostId)
      )
    );
    for (const unitId of explicitSupport) {
      const unit = unitsById.get(unitId);
      if (unit?.favoritePostIds.length) candidate.favoriteUnitIds.add(unitId);
    }
    for (const unit of followingUnits) {
      const profile = profiles.get(unit.id);
      if (!profile) continue;
      const hasAnchor = candidate.anchors.some((anchor) => profile.features.has(anchor.key));
      const lexical = Math.max(
        0,
        ...[...candidate.favoriteUnitIds]
          .slice(0, MAX_SEMANTIC_SEEDS)
          .map((favoriteUnitId) => featureSimilarity(profile, profiles.get(favoriteUnitId)!))
      );
      if (hasAnchor || lexical >= 0.22 || explicitSupport.has(unit.id)) {
        candidate.supportingUnitIds.add(unit.id);
      }
    }
    for (const unitId of explicitSupport) {
      if (!candidate.favoriteUnitIds.has(unitId)) candidate.supportingUnitIds.add(unitId);
    }
  }

  const rankedCandidates = mergedCandidates
    .map((candidate) => {
      const favoriteUnitsForCandidate = [...candidate.favoriteUnitIds]
        .map((unitId) => unitsById.get(unitId))
        .filter((unit): unit is DailyThreadUnit => Boolean(unit));
      const favoriteAuthors = unique(
        favoriteUnitsForCandidate.flatMap((unit) => unit.favoriteAuthors)
      );
      const favoriteAuthorKeys = unique(
        favoriteUnitsForCandidate.flatMap((unit) => unit.favoriteAuthorKeys)
      );
      const favoritePosts = unique(
        favoriteUnitsForCandidate.flatMap((unit) => unit.favoritePostIds)
      );
      const score =
        favoriteAuthorKeys.length * 100 +
        favoriteUnitsForCandidate.length * 25 +
        favoritePosts.length * 5 +
        Math.min(candidate.supportingUnitIds.size, 10) * 2;
      return { candidate, favoriteAuthors, favoriteAuthorKeys, favoritePosts, score };
    })
    .filter(({ favoriteAuthorKeys }) => favoriteAuthorKeys.length >= 2)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.anchors[0].key.localeCompare(right.candidate.anchors[0].key)
    );

  const selected: typeof rankedCandidates = [];
  for (const ranked of rankedCandidates) {
    const duplicate = selected.some(({ candidate }) => {
      const overlap = jaccard(candidate.favoriteUnitIds, ranked.candidate.favoriteUnitIds);
      return overlap >= 0.75;
    });
    if (duplicate) continue;
    selected.push(ranked);
    if (selected.length === MAX_TOPICS) break;
  }

  const topicClusters = selected.map(
    ({ candidate, favoriteAuthors, favoriteAuthorKeys, favoritePosts, score }) => {
      const favoriteUnitIds = [...candidate.favoriteUnitIds].sort((left, right) => {
        const leftUnit = unitsById.get(left)!;
        const rightUnit = unitsById.get(right)!;
        return (
          (leftUnit.firstSourcePosition ?? Number.MAX_SAFE_INTEGER) -
            (rightUnit.firstSourcePosition ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right)
        );
      });
      const supportingUnitIds = [...candidate.supportingUnitIds]
        .filter((unitId) => !candidate.favoriteUnitIds.has(unitId) && unitsById.has(unitId))
        .sort((left, right) => {
          const leftUnit = unitsById.get(left)!;
          const rightUnit = unitsById.get(right)!;
          return (
            (leftUnit.firstSourcePosition ?? Number.MAX_SAFE_INTEGER) -
              (rightUnit.firstSourcePosition ?? Number.MAX_SAFE_INTEGER) ||
            left.localeCompare(right)
          );
        })
        .slice(0, MAX_SUPPORTING_UNITS);
      const unitIds = [...favoriteUnitIds, ...supportingUnitIds];
      const clusterUnits = unitIds.map((unitId) => unitsById.get(unitId)!);
      const label = labelForAnchors(candidate.anchors);
      const signals: DailyTopicSignal[] = candidate.anchors.slice(0, 5).map((anchor) => ({
        type: signalType(anchor),
        value: anchor.surface,
        threadUnitIds: favoriteUnitIds.filter((unitId) =>
          profiles.get(unitId)?.features.has(anchor.key)
        ),
      }));
      if (candidate.semanticEvidence.size > 0) {
        signals.push({
          type: 'SEMANTIC_SIMILARITY',
          value: options.embeddingProvider?.model ?? DEFAULT_DAILY_TOPIC_EMBEDDING_MODEL,
          threadUnitIds: [...candidate.semanticEvidence.keys()].sort(),
        });
      }
      const supportingAuthors = unique(
        supportingUnitIds.flatMap((unitId) => unitsById.get(unitId)?.authors ?? [])
      );
      const postIds = unique(clusterUnits.flatMap((unit) => unit.postIds));
      const latest = clusterUnits
        .map((unit) => Date.parse(unit.latestActivityAt ?? '') || 0)
        .reduce((maximum, value) => Math.max(maximum, value), 0);
      const coverageWarnings = unique(clusterUnits.flatMap((unit) => unit.coverageWarnings));
      const stableKey = [...favoriteUnitIds, ...candidate.anchors.map((anchor) => anchor.key)]
        .sort()
        .join('|');
      return {
        id: `topic:${DAILY_TOPIC_ALGORITHM_VERSION}:${stableHash(stableKey)}`,
        label: label.label,
        labelSource: label.source,
        labelTerms: label.labelTerms,
        evidence: `${favoriteUnitIds.length} Favorite conversation${favoriteUnitIds.length === 1 ? '' : 's'} from ${favoriteAuthorKeys.length} authors share explicit evidence${supportingUnitIds.length > 0 ? `, with ${supportingUnitIds.length} supporting context conversation${supportingUnitIds.length === 1 ? '' : 's'}` : ''}.`,
        evidenceSignals: signals,
        threadUnitIds: unitIds,
        favoriteThreadUnitIds: favoriteUnitIds,
        supportingThreadUnitIds: supportingUnitIds,
        postIds,
        favoritePostIds: favoritePosts,
        contextPostIds: postIds.filter((postId) => !favoritePostIds.has(postId)),
        favoriteAuthors,
        supportingAuthors,
        score,
        latestActivityAt: latest > 0 ? new Date(latest).toISOString() : null,
        coverageWarnings,
      } satisfies DailyTopicCluster;
    }
  );

  const clusteredUnitIds = new Set(topicClusters.flatMap((topic) => topic.threadUnitIds));
  return {
    algorithm: {
      version: DAILY_TOPIC_ALGORITHM_VERSION,
      method: 'THREAD_FIRST_EVIDENCE_CLUSTERING',
      semanticStatus,
      embeddingModel:
        semanticStatus === 'COMPLETE' || semanticStatus === 'PARTIAL'
          ? (options.embeddingProvider?.model ?? null)
          : null,
      maxTopics: MAX_TOPICS,
      minimumFavoriteAuthors: 2,
      candidateLimit: MAX_TOPIC_CANDIDATES,
      semanticUnitLimit: MAX_SEMANTIC_UNITS,
    },
    threadUnits,
    topicClusters,
    favoriteThreadUnitIds: favoriteUnits
      .filter((unit) => !clusteredUnitIds.has(unit.id))
      .map((unit) => unit.id),
    followingThreadUnitIds: followingUnits
      .filter((unit) => !clusteredUnitIds.has(unit.id))
      .map((unit) => unit.id),
    warnings,
  };
}
