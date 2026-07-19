import {
  EDITORIAL_CANDIDATE_SCHEMA_VERSION,
  EditorialCandidateArtifactSchema,
  EditorialSnapshotSchema,
  normalizeEditorialFeedbackCanonicalUrl,
  normalizeEditorialFeedbackCreatorKey,
  normalizeEditorialFeedbackTopicTokens,
  type EditorialCandidate,
  type EditorialCandidateArtifact,
  type EditorialCandidateFeedbackImpact,
  type EditorialCandidateScore,
  type EditorialCandidateZineMatch,
  type EditorialFeedbackPreference,
  type EditorialFeedbackProfile,
  type EditorialSnapshotDocument,
} from '@zine/editorial-schema';

const WEIGHTS = {
  xConversation: 0.24,
  attention: 0.2,
  endorsement: 0.15,
  momentum: 0.1,
  novelty: 0.08,
  zineResonance: 0.15,
  sourceQuality: 0.08,
} as const;

const STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'after',
  'again',
  'against',
  'all',
  'also',
  'always',
  'am',
  'any',
  'are',
  'as',
  'asking',
  'at',
  'be',
  'because',
  'before',
  'been',
  'being',
  'between',
  'both',
  'but',
  'by',
  'can',
  'come',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'done',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'get',
  'getting',
  'good',
  'got',
  'going',
  'great',
  'had',
  'has',
  'have',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'know',
  'like',
  'look',
  'make',
  'making',
  'may',
  'me',
  'might',
  'more',
  'most',
  'much',
  'must',
  'my',
  'myself',
  'need',
  'new',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'one',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'people',
  'really',
  'said',
  'same',
  'say',
  'says',
  'see',
  'she',
  'should',
  'so',
  'some',
  'something',
  'still',
  'such',
  'take',
  'than',
  'that',
  'the',
  'their',
  'there',
  'these',
  'them',
  'themselves',
  'then',
  'they',
  'this',
  'those',
  'through',
  'thing',
  'things',
  'time',
  'to',
  'today',
  'too',
  'under',
  'until',
  'up',
  'use',
  'used',
  'using',
  'very',
  'was',
  'want',
  'way',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'work',
  'would',
  'year',
  'yesterday',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'https',
]);

const ENDORSEMENT_PATTERN =
  /\b(read|watch|listen|recommend(?:ed|ing)?|worth (?:a )?(?:read|watch|listen)|must[- ](?:read|watch|listen)|great (?:piece|article|post|thread|episode|video)|check (?:this|it) out)\b/i;

type WorkingCluster = {
  id: string;
  key: string;
  kind: 'ATOMIC' | 'CONVERSATION_BUNDLE';
  suggestedTitle: string | null;
  xDocuments: EditorialSnapshotDocument[];
  tokens: Set<string>;
  topicAnchors: Set<string>;
  canonicalUrls: Set<string>;
  zineMatches: EditorialCandidateZineMatch[];
};

type ConversationBundleDefinition = {
  key: string;
  title: string;
  matches: (text: string) => boolean;
  anchors: string[];
};

const MODEL_CONTEXT_PATTERN =
  /\b(ai|llms?|models?|gpt(?:-?5(?:\.6)?)?|claude|fable|kimi|grok|gemini|anthropic|openai|xai|inference|tokens?)\b/i;
const MODEL_MARKET_PATTERN =
  /\b(subscriptions?|plans?|included|limits?|credits?|quota|costs?|prices?|tokens?|per task|tps|latency|inference|local(?:ly)?|hardware|vram|electricity|benchmarks?|value|access)\b/i;
const MODEL_GOVERNANCE_PATTERN =
  /(open[ -](?:source|weights?)|regulat|gatekeep|geopolit|\bgovern(?:ance|ment)?\b|\bchinese?\b|\bamerica(?:n)?\b.*\bai\b|\bai\b.*\bamerica(?:n)?\b)/i;
const AGENT_CONTEXT_PATTERN = /\b(agents?|agentic|codex|claude code|software)\b/i;
const AGENT_CONTROL_PATTERN =
  /\b(loops?|graphs?|recursive|feedback|telemetry|testing|tests?|review|context|harness|traces?|verifiable|assertions?)\b/i;
const BUSY_LOOP_PATTERN = /\b(busy[ -]?loops?|orphaned[ -]?loops?|cpu)\b/i;

const CONVERSATION_BUNDLES: ConversationBundleDefinition[] = [
  {
    key: 'MODEL_GOVERNANCE',
    title: 'Open-model competition becomes a policy argument',
    matches: (text) => MODEL_CONTEXT_PATTERN.test(text) && MODEL_GOVERNANCE_PATTERN.test(text),
    anchors: [
      'ai',
      'model',
      'open',
      'source',
      'weight',
      'regulation',
      'policy',
      'competition',
      'chinese',
      'america',
      'cyber',
    ],
  },
  {
    key: 'AGENT_CONTROL_LOOP',
    title: 'Agent loops are becoming control systems',
    matches: (text) =>
      !BUSY_LOOP_PATTERN.test(text) &&
      ((AGENT_CONTEXT_PATTERN.test(text) && AGENT_CONTROL_PATTERN.test(text)) ||
        (/\bloop(?:s)?\b/i.test(text) && /\bgraph(?:s)?\b/i.test(text))),
    anchors: [
      'agent',
      'loop',
      'graph',
      'recursive',
      'feedback',
      'telemetry',
      'testing',
      'review',
      'context',
      'harness',
      'trace',
    ],
  },
  {
    key: 'MODEL_MARKET',
    title: 'The model market shifts on access, cost, and deployment',
    matches: (text) => MODEL_CONTEXT_PATTERN.test(text) && MODEL_MARKET_PATTERN.test(text),
    anchors: [
      'ai',
      'model',
      'gpt',
      'claude',
      'fable',
      'kimi',
      'grok',
      'gemini',
      'token',
      'cost',
      'price',
      'plan',
      'subscription',
      'access',
      'inference',
      'local',
      'hardware',
      'vram',
    ],
  },
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.replace(/[.…]+$/u, ''));
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.startsWith('utm_') ||
        ['ref', 'ref_src', 's', 'si', 'feature', 'taid'].includes(key)
      ) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function tokensFor(value: string): Set<string> {
  const tokens = value
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\p{Pd}_]+/gu, ' ')
    .match(/[\p{L}\p{N}][\p{L}\p{N}]{1,}/gu);
  return new Set(
    (tokens ?? [])
      .map((token) => {
        if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
        if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) {
          return token.slice(0, -1);
        }
        return token;
      })
      .filter((token) => !STOP_WORDS.has(token))
  );
}

function documentTokens(document: EditorialSnapshotDocument): Set<string> {
  return tokensFor(
    [
      document.source.title,
      document.text,
      document.summary,
      ...document.signals.tags.filter((tag) => !tag.startsWith('x-run:')),
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function urlsFor(document: EditorialSnapshotDocument): Set<string> {
  const values = new Set<string>();
  for (const link of document.links) {
    const normalized = normalizeUrl(link.normalizedUrl ?? link.redirectUrl ?? link.url);
    if (normalized && !/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(normalized)) {
      values.add(normalized);
    }
  }
  for (const match of (document.text ?? '').matchAll(/https?:\/\/[^\s)\]}>,]+/g)) {
    const normalized = normalizeUrl(match[0].replace(/[.…]+$/u, ''));
    if (normalized && !/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(normalized)) {
      values.add(normalized);
    }
  }
  return values;
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let size = 0;
  for (const value of left) if (right.has(value)) size++;
  return size;
}

function tokenFrequency(documents: EditorialSnapshotDocument[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const document of documents) {
    for (const token of documentTokens(document)) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }
  return frequencies;
}

function tokenWeight(
  token: string,
  frequencies: Map<string, number>,
  documentCount: number
): number {
  const frequency = frequencies.get(token) ?? 1;
  return Math.log((documentCount + 1) / (frequency + 0.5)) + 1;
}

function weightedContainment(
  left: Set<string>,
  right: Set<string>,
  frequencies: Map<string, number>,
  documentCount: number
): number {
  if (left.size === 0 || right.size === 0) return 0;
  let sharedWeight = 0;
  let leftWeight = 0;
  let rightWeight = 0;
  for (const token of left) {
    const weight = tokenWeight(token, frequencies, documentCount);
    leftWeight += weight;
    if (right.has(token)) sharedWeight += weight;
  }
  for (const token of right) rightWeight += tokenWeight(token, frequencies, documentCount);
  return sharedWeight / Math.min(leftWeight, rightWeight);
}

function semanticDocumentMatch(
  left: Set<string>,
  right: Set<string>,
  frequencies: Map<string, number>,
  documentCount: number
): boolean {
  const shared = [...left].filter((token) => right.has(token));
  if (shared.length < 2) return false;
  const uncommonThreshold = Math.max(6, Math.ceil(documentCount * 0.02));
  const uncommonShared = shared.filter(
    (token) => (frequencies.get(token) ?? 1) <= uncommonThreshold
  );
  return (
    uncommonShared.length >= 2 &&
    weightedContainment(left, right, frequencies, documentCount) >= 0.22
  );
}

function clusterMatches(
  cluster: WorkingCluster,
  tokens: Set<string>,
  urls: Set<string>,
  frequencies: Map<string, number>,
  documentCount: number
): boolean {
  if (intersectionSize(cluster.canonicalUrls, urls) > 0) return true;
  const fixedSeed = cluster.xDocuments[0];
  return fixedSeed
    ? semanticDocumentMatch(documentTokens(fixedSeed), tokens, frequencies, documentCount)
    : false;
}

function clusterKey(tokens: Set<string>, urls: Set<string>, sourceId: string): string {
  const url = [...urls].sort()[0];
  if (url) return `url:${url}`;
  const topic = [...tokens].sort().slice(0, 6).join(':');
  return topic ? `topic:${topic}` : `source:${sourceId}`;
}

function titleFor(cluster: WorkingCluster): string {
  if (cluster.suggestedTitle) return cluster.suggestedTitle;
  for (const document of cluster.xDocuments) {
    for (const link of document.links) {
      const cardTitle = link.card?.title?.trim();
      if (cardTitle) return cardTitle.slice(0, 500);
    }
  }
  const strongest = [...cluster.xDocuments].sort(
    (left, right) => engagementStrength(right) - engagementStrength(left)
  )[0];
  const text = strongest?.text?.replace(/\s+/g, ' ').trim();
  if (text) return (text.length > 140 ? `${text.slice(0, 137)}...` : text).slice(0, 500);
  const url = [...cluster.canonicalUrls][0];
  return url ? `Conversation around ${new URL(url).hostname}` : 'X conversation';
}

function engagementStrength(document: EditorialSnapshotDocument): number {
  const engagement = document.engagement;
  if (!engagement) return 0;
  return (
    (engagement.likes ?? 0) +
    (engagement.reposts ?? 0) * 2 +
    (engagement.replies ?? 0) * 1.5 +
    Math.log10((engagement.views ?? 0) + 1) * 5
  );
}

function zineRelationship(
  document: EditorialSnapshotDocument,
  exactSource: boolean,
  creatorMatch: boolean
): EditorialCandidateZineMatch['relationship'] {
  if (exactSource) return 'EXACT_SOURCE';
  if (document.source.userState === 'FINISHED' || document.signals.isFinished) {
    return 'PREVIOUSLY_FINISHED';
  }
  if (document.source.userState === 'BOOKMARKED' && !document.signals.isFinished) {
    return 'UNFINISHED_CONTEXT';
  }
  return creatorMatch ? 'CREATOR_MATCH' : 'TOPIC_MATCH';
}

function matchZineDocuments(
  cluster: WorkingCluster,
  zineDocuments: EditorialSnapshotDocument[]
): EditorialCandidateZineMatch[] {
  const matches: EditorialCandidateZineMatch[] = [];
  const topicTokens = clusterTopicTokens(cluster);
  const xCreators = new Set(
    cluster.xDocuments
      .map((item) => item.source.creator?.trim().toLocaleLowerCase())
      .filter((creator): creator is string => Boolean(creator))
  );
  for (const document of zineDocuments) {
    const normalizedSourceUrl = normalizeUrl(document.source.canonicalUrl);
    const exactSource = normalizedSourceUrl
      ? cluster.canonicalUrls.has(normalizedSourceUrl)
      : false;
    const creatorMatch = document.source.creator
      ? xCreators.has(document.source.creator.trim().toLocaleLowerCase())
      : false;
    const titleTokenSet = tokensFor(document.source.title ?? '');
    const documentTokenSet = documentTokens(document);
    const shared = intersectionSize(topicTokens, documentTokenSet);
    const titleShared = intersectionSize(topicTokens, titleTokenSet);
    const clusterCoverage = shared / Math.max(1, Math.min(topicTokens.size, 12));
    const titleCoverage = titleShared / Math.max(1, Math.min(titleTokenSet.size, 6));
    const tagMatches = document.signals.tags.filter((tag) =>
      topicTokens.has(tag.toLocaleLowerCase())
    ).length;
    if (!exactSource && shared < 2 && tagMatches === 0) continue;

    const matchScore = exactSource
      ? 100
      : clamp(clusterCoverage * 45 + titleCoverage * 55 + Math.min(25, tagMatches * 15));
    if (!exactSource && matchScore < 30) continue;
    const relationship = zineRelationship(document, exactSource, creatorMatch);
    matches.push({
      sourceId: document.source.id,
      relationship,
      matchScore,
      reason:
        relationship === 'EXACT_SOURCE'
          ? 'The X conversation links the same canonical source already present in Zine.'
          : relationship === 'PREVIOUSLY_FINISHED'
            ? 'A previously finished Zine item provides personal context for this conversation.'
            : relationship === 'UNFINISHED_CONTEXT'
              ? 'An unfinished saved item aligns with this X conversation.'
              : relationship === 'CREATOR_MATCH'
                ? 'A creator in this Zine item also appears in the X conversation.'
                : 'Topics in this Zine item overlap with the X conversation.',
    });
  }
  return matches.sort((left, right) => right.matchScore - left.matchScore).slice(0, 5);
}

function clusterTopicTokens(cluster: WorkingCluster): Set<string> {
  if (cluster.topicAnchors.size > 0) return cluster.topicAnchors;
  const counts = new Map<string, number>();
  for (const document of cluster.xDocuments) {
    for (const token of documentTokens(document)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  const minimum = cluster.xDocuments.length === 1 ? 1 : Math.ceil(cluster.xDocuments.length / 2);
  return new Set([...counts].filter(([, count]) => count >= minimum).map(([token]) => token));
}

function buildConversationBundles(documents: EditorialSnapshotDocument[]): {
  clusters: WorkingCluster[];
  assignedSourceIds: Set<string>;
} {
  const clusters: WorkingCluster[] = [];
  const assignedSourceIds = new Set<string>();
  const ordered = [...documents].sort(
    (left, right) =>
      engagementStrength(right) - engagementStrength(left) ||
      left.source.id.localeCompare(right.source.id)
  );

  for (const definition of CONVERSATION_BUNDLES) {
    const matches = ordered.filter(
      (document) =>
        !assignedSourceIds.has(document.source.id) &&
        definition.matches(document.text ?? document.summary ?? '')
    );
    const voices = new Set(
      matches.map((document) => document.source.creator ?? document.source.id)
    );
    if (matches.length < 2 || voices.size < 2) continue;

    const sourceIds = matches.map((document) => document.source.id).sort();
    const canonicalUrls = new Set<string>();
    const tokens = new Set<string>();
    for (const document of matches) {
      for (const url of urlsFor(document)) canonicalUrls.add(url);
      for (const token of documentTokens(document)) tokens.add(token);
      assignedSourceIds.add(document.source.id);
    }
    const observedAnchors = new Set(
      definition.anchors
        .flatMap((anchor) => [...tokensFor(anchor)])
        .filter((anchor) => tokens.has(anchor))
    );
    clusters.push({
      id: `cluster_${stableHash(`bundle:${definition.key}:${sourceIds.join(':')}`)}`,
      key: `bundle:${definition.key}`,
      kind: 'CONVERSATION_BUNDLE',
      suggestedTitle: definition.title,
      xDocuments: matches,
      tokens,
      topicAnchors: observedAnchors,
      canonicalUrls,
      zineMatches: [],
    });
  }

  return { clusters, assignedSourceIds };
}

function scoreCluster(
  cluster: WorkingCluster,
  snapshotWindowStart: number,
  engagementValues: number[]
): { score: EditorialCandidateScore; reasons: string[] } {
  const authors = new Set(
    cluster.xDocuments.map((document) => document.source.creator ?? 'unknown')
  );
  const runIds = new Set(
    cluster.xDocuments.flatMap((document) =>
      document.signals.tags
        .filter((tag) => tag.startsWith('x-run:'))
        .map((tag) => tag.slice('x-run:'.length))
    )
  );
  const explicitRecommendations = cluster.xDocuments.filter((document) =>
    ENDORSEMENT_PATTERN.test(document.text ?? '')
  ).length;
  const linkedPosts = cluster.xDocuments.filter((document) => urlsFor(document).size > 0).length;
  const firstSeenAt = Math.min(
    ...cluster.xDocuments.map((document) => Date.parse(document.firstSeenAt))
  );
  const observedTimes = cluster.xDocuments.map((document) => Date.parse(document.observedAt));
  const observedSpanHours =
    (Math.max(...observedTimes) - Math.min(...observedTimes)) / (60 * 60 * 1_000);

  const xConversation = clamp(cluster.xDocuments.length * 14 + Math.max(0, authors.size - 1) * 18);
  const strongestEngagement = Math.max(
    ...cluster.xDocuments.map((document) => engagementStrength(document))
  );
  const attention = percentileScore(strongestEngagement, engagementValues);
  const endorsement = clamp(explicitRecommendations * 28 + linkedPosts * 14);
  const momentum =
    runIds.size < 2
      ? 0
      : clamp(
          Math.min(52, runIds.size * 18) +
            Math.min(24, cluster.xDocuments.length * 6) +
            Math.min(24, observedSpanHours * 3)
        );
  const novelty = firstSeenAt >= snapshotWindowStart ? 100 : 35;
  const zineResonance = clamp(
    cluster.zineMatches.reduce((total, match, index) => {
      const multiplier = index === 0 ? 0.65 : index === 1 ? 0.2 : index === 2 ? 0.1 : 0.025;
      const exactBonus = match.relationship === 'EXACT_SOURCE' && index === 0 ? 30 : 0;
      return total + match.matchScore * multiplier + exactBonus;
    }, 0)
  );
  const sourceQuality = clamp(
    (linkedPosts > 0 ? 62 : 30) + Math.min(24, Math.max(0, authors.size - 1) * 12)
  );
  let penalties = 0;
  if (authors.size <= 1) penalties += 4;
  if (linkedPosts === 0) penalties += 3;
  if (cluster.xDocuments.every((document) => (document.text?.trim().length ?? 0) < 40)) {
    penalties += 12;
  }
  if (
    cluster.xDocuments.length === 1 &&
    linkedPosts === 0 &&
    explicitRecommendations === 0 &&
    cluster.zineMatches.length === 0 &&
    (cluster.xDocuments[0]?.text?.trim().length ?? 0) < 80
  ) {
    penalties += 10;
  }
  penalties = clamp(penalties);
  const total = clamp(
    xConversation * WEIGHTS.xConversation +
      attention * WEIGHTS.attention +
      endorsement * WEIGHTS.endorsement +
      momentum * WEIGHTS.momentum +
      novelty * WEIGHTS.novelty +
      zineResonance * WEIGHTS.zineResonance +
      sourceQuality * WEIGHTS.sourceQuality -
      penalties
  );

  const reasons = [
    cluster.kind === 'CONVERSATION_BUNDLE'
      ? 'A named topic plus compatible facets formed this deterministic conversation bundle.'
      : 'Exact artifacts or high-information topical anchors formed this atomic cluster.',
    `${cluster.xDocuments.length} X post${cluster.xDocuments.length === 1 ? '' : 's'} from ${authors.size} independent voice${authors.size === 1 ? '' : 's'}.`,
    explicitRecommendations > 0
      ? `${explicitRecommendations} post${explicitRecommendations === 1 ? '' : 's'} used explicit recommendation language.`
      : 'No explicit recommendation language was detected.',
    linkedPosts > 0
      ? `${linkedPosts} post${linkedPosts === 1 ? '' : 's'} linked an underlying source.`
      : 'The conversation did not include a captured underlying link.',
    `The strongest X post ranked in the top ${Math.max(1, Math.ceil(100 - attention))}% of captured attention.`,
    cluster.zineMatches.length > 0
      ? `${cluster.zineMatches.length} Zine connection${cluster.zineMatches.length === 1 ? '' : 's'} increased personal resonance.`
      : 'No strong Zine resonance was found; the candidate remains X-led.',
  ];
  return {
    score: {
      xConversation,
      attention,
      endorsement,
      momentum,
      novelty,
      zineResonance,
      sourceQuality,
      penalties,
      feedbackAdjustment: 0,
      total,
    },
    reasons,
  };
}

function percentileScore(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0 || value <= 0) return 0;
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((sortedValues[middle] ?? 0) <= value) low = middle + 1;
    else high = middle;
  }
  return clamp((low / sortedValues.length) * 100);
}

function preferenceMap(
  values: EditorialFeedbackPreference[]
): Map<string, EditorialFeedbackPreference> {
  return new Map(values.map((value) => [value.key, value]));
}

function averagePreference(
  values: EditorialFeedbackPreference[],
  field: 'affinity' | 'novelty'
): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value[field], 0) / values.length;
}

function preferenceSignalCount(value: EditorialFeedbackPreference): number {
  return Object.values(value.signalCounts).reduce((total, count) => total + count, 0);
}

function feedbackImpactForCluster(
  cluster: WorkingCluster,
  profile: EditorialFeedbackProfile | undefined,
  zineDocumentsById: Map<string, EditorialSnapshotDocument>,
  baseTotal: number
): EditorialCandidateFeedbackImpact | null {
  if (!profile || profile.eventCount === 0) return null;

  const topicKeys = new Set(
    normalizeEditorialFeedbackTopicTokens([...clusterTopicTokens(cluster)])
  );
  const creatorKeys = new Set(
    [
      ...cluster.xDocuments.map((document) => document.source.creator),
      ...cluster.zineMatches.map(
        (match) => zineDocumentsById.get(match.sourceId)?.source.creator ?? null
      ),
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeEditorialFeedbackCreatorKey)
      .filter((value): value is string => Boolean(value))
  );
  const canonicalUrlKeys = new Set(
    [
      ...cluster.canonicalUrls,
      ...cluster.xDocuments.map((document) => document.source.canonicalUrl),
    ]
      .map(normalizeEditorialFeedbackCanonicalUrl)
      .filter((value): value is string => Boolean(value))
  );
  const sourceIdKeys = new Set([
    ...cluster.xDocuments.map((document) => document.source.id),
    ...cluster.zineMatches.map((match) => match.sourceId),
  ]);

  const topicsByKey = preferenceMap(profile.topics);
  const creatorsByKey = preferenceMap(profile.creators);
  const urlsByKey = preferenceMap(profile.canonicalUrls);
  const sourcesByKey = preferenceMap(profile.sourceIds);
  const matchedTopics = [...topicKeys].filter((key) => topicsByKey.has(key)).sort();
  const matchedCreators = [...creatorKeys].filter((key) => creatorsByKey.has(key)).sort();
  const matchedCanonicalUrls = [...canonicalUrlKeys].filter((key) => urlsByKey.has(key)).sort();
  const matchedSourceIds = [...sourceIdKeys].filter((key) => sourcesByKey.has(key)).sort();
  const topicPreferences = matchedTopics.flatMap((key) => {
    const value = topicsByKey.get(key);
    return value ? [value] : [];
  });
  const creatorPreferences = matchedCreators.flatMap((key) => {
    const value = creatorsByKey.get(key);
    return value ? [value] : [];
  });
  const exactPreferences = [
    ...matchedCanonicalUrls.flatMap((key) => {
      const value = urlsByKey.get(key);
      return value ? [value] : [];
    }),
    ...matchedSourceIds.flatMap((key) => {
      const value = sourcesByKey.get(key);
      return value ? [value] : [];
    }),
  ];
  const allPreferences = [...topicPreferences, ...creatorPreferences, ...exactPreferences];
  if (allPreferences.length === 0) return null;

  const round = (value: number) => Math.round(value * 10) / 10;
  const affinityAdjustment = round(
    Math.max(
      -8,
      Math.min(
        8,
        averagePreference(exactPreferences, 'affinity') * 2.5 +
          averagePreference(creatorPreferences, 'affinity') * 1.25 +
          averagePreference(topicPreferences, 'affinity') * 0.75
      )
    )
  );
  const noveltyAdjustment = round(
    Math.max(
      -8,
      Math.min(
        0,
        averagePreference(exactPreferences, 'novelty') * 2 +
          averagePreference(creatorPreferences, 'novelty') * 0.75 +
          averagePreference(topicPreferences, 'novelty') * 0.5
      )
    )
  );
  const requestedAdjustment = round(
    Math.max(-8, Math.min(8, affinityAdjustment + noveltyAdjustment))
  );
  const adjustment = round(clamp(baseTotal + requestedAdjustment) - baseTotal);

  return {
    baseTotal,
    affinityAdjustment,
    noveltyAdjustment,
    adjustment,
    matchedTopics,
    matchedCreators,
    matchedCanonicalUrls,
    matchedSourceIds,
    matchedSignalCount: Math.min(
      profile.eventCount,
      allPreferences.reduce((total, value) => total + preferenceSignalCount(value), 0)
    ),
  };
}

export function buildEditorialCandidateArtifact(
  rawSnapshot: unknown,
  generatedAt?: Date
): EditorialCandidateArtifact {
  const snapshot = EditorialSnapshotSchema.parse(rawSnapshot);
  const xDocuments = snapshot.documents.filter((document) => document.source.origin === 'X');
  const zineDocuments = snapshot.documents.filter((document) => document.source.origin === 'ZINE');
  const zineDocumentsById = new Map(
    zineDocuments.map((document) => [document.source.id, document])
  );
  const frequencies = tokenFrequency(xDocuments);
  const engagementValues = xDocuments
    .map((document) => engagementStrength(document))
    .sort((left, right) => left - right);
  const bundleResult = buildConversationBundles(xDocuments);
  const workingClusters: WorkingCluster[] = [...bundleResult.clusters];

  for (const document of [...xDocuments].sort(
    (left, right) =>
      engagementStrength(right) - engagementStrength(left) ||
      left.source.id.localeCompare(right.source.id)
  )) {
    if (bundleResult.assignedSourceIds.has(document.source.id)) continue;
    const tokens = documentTokens(document);
    const urls = urlsFor(document);
    let cluster = workingClusters.find((candidate) =>
      clusterMatches(candidate, tokens, urls, frequencies, xDocuments.length)
    );
    if (!cluster) {
      const key = clusterKey(tokens, urls, document.source.id);
      cluster = {
        id: `cluster_${stableHash(key)}`,
        key,
        kind: 'ATOMIC',
        suggestedTitle: null,
        xDocuments: [],
        tokens: new Set(),
        topicAnchors: new Set(),
        canonicalUrls: new Set(),
        zineMatches: [],
      };
      workingClusters.push(cluster);
    }
    cluster.xDocuments.push(document);
    for (const token of tokens) cluster.tokens.add(token);
    for (const url of urls) cluster.canonicalUrls.add(url);
  }

  for (const cluster of workingClusters) {
    cluster.zineMatches = matchZineDocuments(cluster, zineDocuments);
  }

  const candidateInputs = workingClusters.map((cluster) => {
    const title = titleFor(cluster);
    const { score, reasons } = scoreCluster(
      cluster,
      Date.parse(snapshot.window.newContentAfter),
      engagementValues
    );
    const feedbackImpact = feedbackImpactForCluster(
      cluster,
      snapshot.feedbackProfile,
      zineDocumentsById,
      score.total
    );
    if (feedbackImpact) {
      score.feedbackAdjustment = feedbackImpact.adjustment;
      score.total = clamp(feedbackImpact.baseTotal + feedbackImpact.adjustment);
      reasons.push(
        `Explicit feedback adjusted the X-led base score by ${feedbackImpact.adjustment >= 0 ? '+' : ''}${feedbackImpact.adjustment} points across ${feedbackImpact.matchedTopics.length} topic, ${feedbackImpact.matchedCreators.length} creator, and ${feedbackImpact.matchedCanonicalUrls.length + feedbackImpact.matchedSourceIds.length} exact match${feedbackImpact.matchedCanonicalUrls.length + feedbackImpact.matchedSourceIds.length === 1 ? '' : 'es'}.`
      );
    }
    const authors = new Set(
      cluster.xDocuments.map((document) => document.source.creator ?? 'unknown')
    );
    const runIds = new Set(
      cluster.xDocuments.flatMap((document) =>
        document.signals.tags
          .filter((tag) => tag.startsWith('x-run:'))
          .map((tag) => tag.slice('x-run:'.length))
      )
    );
    const representative = [...cluster.xDocuments]
      .sort((left, right) => engagementStrength(right) - engagementStrength(left))
      .filter(
        (document, index, values) =>
          values.findIndex((value) => value.source.creator === document.source.creator) === index
      )
      .slice(0, 3)
      .map((document) => document.source.id);
    const explicitRecommendationCount = cluster.xDocuments.filter((document) =>
      ENDORSEMENT_PATTERN.test(document.text ?? '')
    ).length;
    const linkedPostCount = cluster.xDocuments.filter(
      (document) => urlsFor(document).size > 0
    ).length;
    return {
      cluster,
      title,
      score,
      reasons,
      authors,
      runIds,
      representative,
      explicitRecommendationCount,
      linkedPostCount,
      feedbackImpact,
    };
  });

  candidateInputs.sort(
    (left, right) =>
      right.score.total - left.score.total ||
      right.cluster.xDocuments.length - left.cluster.xDocuments.length ||
      left.cluster.id.localeCompare(right.cluster.id)
  );

  const candidates: EditorialCandidate[] = candidateInputs.map((input, index) => ({
    id: `candidate_${stableHash(`${snapshot.id}:${input.cluster.id}`)}`,
    clusterId: input.cluster.id,
    rank: index + 1,
    title: input.title,
    summary: `${input.cluster.xDocuments.length} X post${input.cluster.xDocuments.length === 1 ? '' : 's'} from ${input.authors.size} independent voice${input.authors.size === 1 ? '' : 's'} formed this candidate.`,
    canonicalUrl: [...input.cluster.canonicalUrls].sort()[0] ?? null,
    xSourceIds: input.cluster.xDocuments.map((document) => document.source.id),
    representativeXSourceIds: input.representative,
    zineMatches: input.cluster.zineMatches,
    independentVoiceCount: input.authors.size,
    xPostCount: input.cluster.xDocuments.length,
    xRunCount: input.runIds.size,
    explicitRecommendationCount: input.explicitRecommendationCount,
    linkedPostCount: input.linkedPostCount,
    score: input.score,
    scoreReasons: input.reasons,
    ...(input.feedbackImpact ? { feedbackImpact: input.feedbackImpact } : {}),
  }));

  const clusters = candidateInputs.map((input) => ({
    id: input.cluster.id,
    key: input.cluster.key,
    title: input.title,
    firstSeenAt: new Date(
      Math.min(...input.cluster.xDocuments.map((document) => Date.parse(document.firstSeenAt)))
    ).toISOString(),
    lastSeenAt: new Date(
      Math.max(...input.cluster.xDocuments.map((document) => Date.parse(document.observedAt)))
    ).toISOString(),
    topics: [...clusterTopicTokens(input.cluster)].sort().slice(0, 30),
    canonicalUrls: [...input.cluster.canonicalUrls].sort(),
    xSourceIds: input.cluster.xDocuments.map((document) => document.source.id),
    zineSourceIds: input.cluster.zineMatches.map((match) => match.sourceId),
  }));

  const coverageNotes = [...snapshot.provenance.warnings];
  if (snapshot.provenance.sourceStatus.xArchive !== 'COMPLETE') {
    coverageNotes.push(
      `X archive input was ${snapshot.provenance.sourceStatus.xArchive.toLocaleLowerCase()}; ranks reflect incomplete coverage.`
    );
  }
  if (xDocuments.length === 0) {
    coverageNotes.push('No X documents were available, so no X-led candidates were produced.');
  }
  if (snapshot.feedbackProfile?.eventCount) {
    const adjustedCandidates = candidates.filter(
      (candidate) => (candidate.score.feedbackAdjustment ?? 0) !== 0
    ).length;
    coverageNotes.push(
      `${snapshot.feedbackProfile.eventCount} explicit tuning event${snapshot.feedbackProfile.eventCount === 1 ? '' : 's'} informed the profile; ${adjustedCandidates} candidate${adjustedCandidates === 1 ? '' : 's'} received a bounded score adjustment.`
    );
  }

  return EditorialCandidateArtifactSchema.parse({
    schemaVersion: EDITORIAL_CANDIDATE_SCHEMA_VERSION,
    id: `candidate_artifact_${stableHash(snapshot.id)}`,
    snapshotId: snapshot.id,
    editionDate: snapshot.editionDate,
    generatedAt: (generatedAt ?? new Date(snapshot.generatedAt)).toISOString(),
    strategy: 'X_LED_V1',
    weights: WEIGHTS,
    provenance: snapshot.provenance,
    clusters,
    candidates,
    coverageNotes,
  });
}
