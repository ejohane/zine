import {
  EDITORIAL_CANDIDATE_SCHEMA_VERSION,
  EditorialCandidateArtifactV2Schema,
  EditorialSnapshotSchema,
  normalizeEditorialFeedbackCanonicalUrl,
  normalizeEditorialFeedbackCreatorKey,
  normalizeEditorialFeedbackTopicTokens,
  type EditorialCandidateArtifact,
  type EditorialCandidateFraming,
  type EditorialCandidateFeedbackImpact,
  type EditorialCandidateScoreV2,
  type EditorialCandidateV2,
  type EditorialCandidateZineMatch,
  type EditorialFeedbackPreference,
  type EditorialFeedbackProfile,
  type EditorialSnapshot,
  type EditorialSnapshotDocument,
} from '@zine/editorial-schema';

const FEATURE_MODEL = 'CORPUS_TFIDF_V1' as const;
const PORTFOLIO_ALGORITHM = 'MMR_PORTFOLIO_V2' as const;
const HARD_SEMANTIC_DUPLICATE_THRESHOLD = 0.5;

const WEIGHTS = {
  conversationBreadth: 0.16,
  attention: 0.12,
  recommendationStrength: 0.08,
  momentum: 0.1,
  freshness: 0.1,
  personalRelevance: 0.12,
  evidenceQuality: 0.12,
  crossSource: 0.08,
  historicalNovelty: 0.08,
  serendipity: 0.04,
} as const;

// Language-level noise removal only. Subject, industry, product, and event names do not belong here.
const STOP_WORDS = new Set([
  'a',
  'about',
  'after',
  'again',
  'all',
  'also',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'between',
  'both',
  'but',
  'by',
  'can',
  'com',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'for',
  'from',
  'get',
  'got',
  'had',
  'has',
  'have',
  'he',
  'her',
  'here',
  'him',
  'his',
  'how',
  'http',
  'https',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'link',
  'may',
  'me',
  'more',
  'most',
  'my',
  'new',
  'no',
  'not',
  'now',
  'of',
  'on',
  'one',
  'only',
  'or',
  'other',
  'our',
  'out',
  'over',
  'people',
  'said',
  'say',
  'says',
  'she',
  'so',
  'some',
  'source',
  'still',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'today',
  'too',
  'up',
  'very',
  'visit',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'year',
  'you',
  'your',
]);

const ENDORSEMENT_PATTERN =
  /\b(read|watch|listen|recommend(?:ed|ing)?|worth (?:a )?(?:read|watch|listen)|must[- ](?:read|watch|listen)|great (?:piece|article|post|thread|episode|video)|check (?:this|it) out)\b/i;

type WorkingCluster = {
  id: string;
  key: string;
  documents: EditorialSnapshotDocument[];
  features: Set<string>;
  topics: Set<string>;
  canonicalUrls: Set<string>;
  zineMatches: EditorialCandidateZineMatch[];
};

type RawCandidate = {
  cluster: WorkingCluster;
  title: string;
  summary: string;
  framing: EditorialCandidateFraming;
  creators: Set<string>;
  domains: Set<string>;
  runIds: Set<string>;
  representativeSourceIds: string[];
  explicitRecommendationCount: number;
  linkedSourceCount: number;
  historicalSimilarity: number;
  frontPageEligible: boolean;
  eligibilityReasons: string[];
  xOnly: boolean;
  raw: Record<keyof typeof WEIGHTS, number>;
  penalties: number;
};

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, round(value)));
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
    const url = new URL(rawUrl.trim().replace(/[.…]+$/u, ''));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.startsWith('utm_') ||
        ['ref', 'ref_src', 's', 'si', 'feature', 'taid'].includes(key)
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.hash = '';
    url.hostname = url.hostname.toLocaleLowerCase().replace(/^www\./, '');
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function wordSequence(value: string): string[] {
  const tokens = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\p{Pd}_]+/gu, ' ')
    .match(/[\p{L}\p{N}][\p{L}\p{N}]{1,}/gu);
  return (tokens ?? [])
    .map((token) => {
      if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
      if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss'))
        return token.slice(0, -1);
      return token;
    })
    .filter((token) => !STOP_WORDS.has(token));
}

function tokensFor(value: string): Set<string> {
  return new Set(wordSequence(value));
}

function documentText(document: EditorialSnapshotDocument): string {
  return [
    document.source.title,
    document.text,
    document.summary,
    document.source.excerpt,
    ...document.links.flatMap((link) => [link.card?.title, link.card?.description]),
    ...document.signals.tags.filter((tag) => !tag.startsWith('x-run:')),
  ]
    .filter(Boolean)
    .join(' ');
}

function documentFeatures(document: EditorialSnapshotDocument): Set<string> {
  const words = wordSequence(documentText(document));
  const features = new Set(words.map((word) => `u:${word}`));
  for (let index = 0; index < words.length - 1; index++) {
    features.add(`b:${words[index]}_${words[index + 1]}`);
  }
  return features;
}

function isSocialUrl(value: string): boolean {
  try {
    return ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function urlsFor(document: EditorialSnapshotDocument): Set<string> {
  const values = new Set<string>();
  if (document.source.origin !== 'X') {
    const sourceUrl = normalizeUrl(document.source.canonicalUrl);
    if (sourceUrl && !isSocialUrl(sourceUrl)) values.add(sourceUrl);
  }
  for (const link of document.links) {
    const normalized = normalizeUrl(link.normalizedUrl ?? link.redirectUrl ?? link.url);
    if (normalized && !isSocialUrl(normalized)) values.add(normalized);
  }
  for (const match of (document.text ?? '').matchAll(/https?:\/\/[^\s)\]}>,]+/g)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized && !isSocialUrl(normalized)) values.add(normalized);
  }
  return values;
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count++;
  return count;
}

function featureFrequency(featureSets: Set<string>[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const features of featureSets) {
    for (const feature of features) frequencies.set(feature, (frequencies.get(feature) ?? 0) + 1);
  }
  return frequencies;
}

function featureWeight(feature: string, frequencies: Map<string, number>, count: number): number {
  return (
    Math.log((count + 1) / ((frequencies.get(feature) ?? 1) + 0.5)) +
    (feature.startsWith('b:') ? 1.5 : 1)
  );
}

function weightedJaccard(
  left: Set<string>,
  right: Set<string>,
  frequencies: Map<string, number>,
  count: number
): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  let union = 0;
  const all = new Set([...left, ...right]);
  for (const feature of all) {
    const weight = featureWeight(feature, frequencies, count);
    union += weight;
    if (left.has(feature) && right.has(feature)) intersection += weight;
  }
  return union === 0 ? 0 : intersection / union;
}

function documentSimilarity(
  left: EditorialSnapshotDocument,
  right: EditorialSnapshotDocument,
  leftFeatures: Set<string>,
  rightFeatures: Set<string>,
  frequencies: Map<string, number>,
  count: number
): number {
  if (intersectionSize(urlsFor(left), urlsFor(right)) > 0) return 1;
  const ageHours = Math.abs(Date.parse(left.observedAt) - Date.parse(right.observedAt)) / 3_600_000;
  if (ageHours > 96) return 0;
  const shared = [...leftFeatures].filter((feature) => rightFeatures.has(feature));
  const sharedBigrams = shared.filter((feature) => feature.startsWith('b:')).length;
  const uncommonThreshold = Math.max(3, Math.ceil(count * 0.08));
  const uncommonUnigrams = shared.filter(
    (feature) => feature.startsWith('u:') && (frequencies.get(feature) ?? 1) <= uncommonThreshold
  ).length;
  if (sharedBigrams === 0 && uncommonUnigrams < 2) return 0;
  const similarity = weightedJaccard(leftFeatures, rightFeatures, frequencies, count);
  const threshold = sharedBigrams > 0 ? 0.1 : 0.23;
  return similarity >= threshold ? similarity : 0;
}

class DisjointSet {
  private readonly parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(value: number): number {
    const parent = this.parents[value] ?? value;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parents[value] = root;
    return root;
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    this.parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  }
}

function isDiscoveryDocument(document: EditorialSnapshotDocument, windowStart: number): boolean {
  if (document.source.origin === 'X') return true;
  if (
    document.source.origin === 'EXTERNAL' &&
    !['PRIMARY', 'REPORTING', 'ANALYSIS'].includes(document.source.role)
  ) {
    return false;
  }
  const parsed = [
    document.signals.ingestedAt,
    document.signals.bookmarkedAt,
    document.firstSeenAt,
  ].map((value) => {
    const timestamp = Date.parse(value ?? '');
    return Number.isNaN(timestamp) ? 0 : timestamp;
  });
  return Math.max(...parsed) >= windowStart;
}

function topicSet(
  documents: EditorialSnapshotDocument[],
  frequencies: Map<string, number>,
  documentCount: number
): Set<string> {
  const counts = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  for (const document of documents) {
    for (const token of tokensFor(documentText(document))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    const titleText = [document.source.title, ...document.links.map((link) => link.card?.title)]
      .filter(Boolean)
      .join(' ');
    for (const token of tokensFor(titleText)) {
      titleCounts.set(token, (titleCounts.get(token) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts]
      .sort(
        ([left, leftCount], [right, rightCount]) =>
          rightCount * 3 +
            (titleCounts.get(right) ?? 0) * 4 +
            featureWeight(`u:${right}`, frequencies, documentCount) * 0.5 -
            (leftCount * 3 +
              (titleCounts.get(left) ?? 0) * 4 +
              featureWeight(`u:${left}`, frequencies, documentCount) * 0.5) ||
          left.localeCompare(right)
      )
      .slice(0, 20)
      .map(([token]) => token)
  );
}

function buildClusters(documents: EditorialSnapshotDocument[]): WorkingCluster[] {
  const ordered = [...documents].sort((left, right) =>
    left.source.id.localeCompare(right.source.id)
  );
  const features = ordered.map(documentFeatures);
  const frequencies = featureFrequency(features);
  const groups = new DisjointSet(ordered.length);
  for (let left = 0; left < ordered.length; left++) {
    for (let right = left + 1; right < ordered.length; right++) {
      const leftDocument = ordered[left];
      const rightDocument = ordered[right];
      if (!leftDocument || !rightDocument) continue;
      if (
        documentSimilarity(
          leftDocument,
          rightDocument,
          features[left] ?? new Set(),
          features[right] ?? new Set(),
          frequencies,
          ordered.length
        ) > 0
      ) {
        groups.union(left, right);
      }
    }
  }

  const components = new Map<number, EditorialSnapshotDocument[]>();
  for (const [index, document] of ordered.entries()) {
    const root = groups.find(index);
    const component = components.get(root) ?? [];
    component.push(document);
    components.set(root, component);
  }

  return [...components.values()]
    .map((component) => {
      const sourceIds = component.map((document) => document.source.id).sort();
      const canonicalUrls = new Set(component.flatMap((document) => [...urlsFor(document)]));
      const combinedFeatures = new Set(
        component.flatMap((document) => [...documentFeatures(document)])
      );
      const topics = topicSet(component, frequencies, ordered.length);
      const firstUrl = [...canonicalUrls].sort()[0];
      const topicKey = [...topics].slice(0, 6).join(':');
      const key = firstUrl
        ? `url:${firstUrl}`
        : topicKey
          ? `topic:${topicKey}`
          : `source:${sourceIds[0]}`;
      return {
        id: `cluster_${stableHash(sourceIds.join(':'))}`,
        key,
        documents: component,
        features: combinedFeatures,
        topics,
        canonicalUrls,
        zineMatches: [],
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
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

function sourceStrength(document: EditorialSnapshotDocument): number {
  if (document.source.origin === 'X') return engagementStrength(document);
  const roleScore =
    document.source.role === 'PRIMARY'
      ? 100
      : document.source.role === 'REPORTING'
        ? 80
        : document.source.role === 'ANALYSIS'
          ? 65
          : 45;
  return roleScore + (document.source.title ? 10 : 0) + (document.summary ? 5 : 0);
}

const EDITORIAL_HEADLINE_MAX = 120;
const EDITORIAL_SUMMARY_MAX = 360;

function normalizedProse(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/^RT\s+@[^:]+:\s*/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function removeTrailingConnector(value: string): string {
  let result = value
    .trim()
    .replace(/[,:;\-–—]+$/u, '')
    .trim();
  while (/\b(?:about|after|and|at|by|for|from|in|of|on|to|via|with)$/iu.test(result)) {
    result = result.replace(/\s+\S+$/u, '').trim();
  }
  return result;
}

function sentenceCaseShouting(value: string): string {
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length < 12) return value;
  const uppercase = letters.filter((letter) => letter === letter.toLocaleUpperCase()).length;
  if (uppercase / letters.length < 0.85) return value;
  const lowered = value.toLocaleLowerCase();
  return `${lowered.charAt(0).toLocaleUpperCase()}${lowered.slice(1)}`;
}

function boundedProse(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const prefix = value.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(
    prefix.lastIndexOf('. '),
    prefix.lastIndexOf('? '),
    prefix.lastIndexOf('! ')
  );
  const clauseEnd = Math.max(
    prefix.lastIndexOf(' — '),
    prefix.lastIndexOf(' – '),
    prefix.lastIndexOf('; '),
    prefix.lastIndexOf(': '),
    prefix.lastIndexOf(', ')
  );
  const wordEnd = prefix.lastIndexOf(' ');
  const boundary = sentenceEnd >= 50 ? sentenceEnd + 1 : clauseEnd >= 50 ? clauseEnd : wordEnd;
  return removeTrailingConnector(prefix.slice(0, Math.max(1, boundary)).trim());
}

function editorialHeadline(value: string): string {
  const normalized = normalizedProse(value);
  const leadingQuote = normalized.match(/^["“]([^"”]{24,160})["”]/u)?.[1];
  const candidates = [leadingQuote];
  for (const pattern of [/\s+https?:\/\/\S+/iu, /\s+@[^\s]+/u]) {
    const match = pattern.exec(normalized);
    if (match && match.index >= 24) candidates.push(normalized.slice(0, match.index));
  }
  const sentence = normalized.match(/^(.{24,160}?[.!?])(?:\s|$)/u)?.[1];
  candidates.push(sentence, normalized);
  const selected = candidates
    .filter((candidate): candidate is string => Boolean(candidate?.trim()))
    .map((candidate) => removeTrailingConnector(candidate.replace(/https?:\/\/\S+/giu, ' ')))
    .filter((candidate) => candidate.length >= 12)
    .sort((left, right) => left.length - right.length || left.localeCompare(right))[0];
  const headline = sentenceCaseShouting(selected ?? normalized)
    .replace(/\s*[.…]+$/u, '')
    .replace(/\s*[→↗]+\s*$/u, '')
    .trim();
  return boundedProse(headline, EDITORIAL_HEADLINE_MAX) || 'Discovered conversation';
}

function editorialSummary(value: string): string {
  const truncationProbe = value
    .trim()
    .replace(/\s*(?:[→↗]\s*)?https?:\/\/\S+$/iu, '')
    .trim();
  const sourceWasTruncated = /(?:…|\.{3})\s*$/u.test(truncationProbe);
  let normalized = normalizedProse(value)
    .replace(/\s*[→↗]+\s*/gu, '. ')
    .replace(/\b(?:at|from|on|via)\s+https?:\/\/\S+/giu, '. ')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/\s+([,.;!?])/gu, '$1')
    .replace(/([.!?])(?:\s*[.!?])+/gu, '$1')
    .replace(/\b(?:at|from|on|to|via|with)\./giu, '.')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^\.+\s*/u, '')
    .replace(/\s*\.+$/u, '.');
  normalized = normalized.replace(/^([^@.!?]{20,160})(?=\s+@)/u, (prefix) =>
    sentenceCaseShouting(prefix)
  );
  let summary = boundedProse(normalized, EDITORIAL_SUMMARY_MAX);
  if ((summary.match(/`/gu) ?? []).length % 2 === 1) summary = summary.replace(/`/gu, '');
  const unmatchedSmartQuote = summary.lastIndexOf('“') > summary.lastIndexOf('”');
  if (unmatchedSmartQuote) {
    const quoteIndex = summary.lastIndexOf('“');
    summary =
      quoteIndex >= 80
        ? removeTrailingConnector(summary.slice(0, quoteIndex).replace(/[,:;\s]+$/u, ''))
        : summary.replace('“', '');
  }
  const openParentheses = (summary.match(/\(/gu) ?? []).length;
  const closeParentheses = (summary.match(/\)/gu) ?? []).length;
  if (openParentheses === closeParentheses + 1) summary = `${summary})`;
  if (!summary) return 'The captured source surfaced this item for editorial review.';
  if (sourceWasTruncated) return `${summary.replace(/[.…]+$/u, '')}…`;
  return /[.!?]$/u.test(summary) ? summary : `${summary}.`;
}

function orderedDocuments(cluster: WorkingCluster): EditorialSnapshotDocument[] {
  return [...cluster.documents].sort(
    (left, right) =>
      sourceStrength(right) - sourceStrength(left) || left.source.id.localeCompare(right.source.id)
  );
}

function framingFor(cluster: WorkingCluster): {
  title: string;
  summary: string;
  framing: EditorialCandidateFraming;
} {
  const documents = orderedDocuments(cluster);
  const titledSource = documents.find(
    (document) => document.source.origin !== 'X' && document.source.title?.trim()
  );
  let headlineMethod: EditorialCandidateFraming['headlineMethod'];
  let headlineSource: EditorialSnapshotDocument;
  let headlineInput: string;
  if (titledSource?.source.title) {
    headlineMethod = 'SOURCE_TITLE';
    headlineSource = titledSource;
    headlineInput = titledSource.source.title;
  } else {
    const linked = documents
      .flatMap((document) =>
        document.links.map((link) => ({ document, title: link.card?.title?.trim() }))
      )
      .find((value) => value.title);
    if (linked?.title) {
      headlineMethod = 'LINK_CARD_TITLE';
      headlineSource = linked.document;
      headlineInput = linked.title;
    } else {
      const textual = documents.find((document) => document.text?.trim());
      if (textual?.text) {
        headlineMethod = 'EXTRACTIVE_POST';
        headlineSource = textual;
        headlineInput = textual.text;
      } else {
        headlineMethod = 'DOMAIN_FALLBACK';
        headlineSource = documents[0]!;
        const url = [...cluster.canonicalUrls].sort()[0];
        headlineInput = url
          ? `New material from ${new URL(url).hostname.replace(/^www\./, '')}`
          : 'Discovered conversation';
      }
    }
  }
  const title = editorialHeadline(headlineInput);

  const sourceSummary = documents.find(
    (document) => document.source.origin !== 'X' && document.summary?.trim()
  );
  const cardDescription = documents
    .flatMap((document) =>
      document.links.map((link) => ({ document, description: link.card?.description?.trim() }))
    )
    .find((value) => value.description);
  const contextual = documents.find(
    (document) =>
      document.summary?.trim() || document.source.excerpt?.trim() || document.text?.trim()
  );
  let summaryMethod: EditorialCandidateFraming['summaryMethod'];
  let summarySource: EditorialSnapshotDocument;
  let summaryInput: string;
  if (sourceSummary?.summary) {
    summaryMethod = 'SOURCE_SUMMARY';
    summarySource = sourceSummary;
    summaryInput = sourceSummary.summary;
  } else if (cardDescription?.description) {
    summaryMethod = 'LINK_CARD_DESCRIPTION';
    summarySource = cardDescription.document;
    summaryInput = cardDescription.description;
  } else if (contextual) {
    summaryMethod = 'EXTRACTIVE_CONTEXT';
    summarySource = contextual;
    summaryInput = contextual.summary ?? contextual.source.excerpt ?? contextual.text ?? title;
  } else {
    summaryMethod = 'EVIDENCE_FALLBACK';
    summarySource = headlineSource;
    summaryInput = title;
  }

  return {
    title,
    summary: editorialSummary(summaryInput),
    framing: {
      model: 'EXTRACTIVE_EDITORIAL_V1',
      headlineMethod,
      summaryMethod,
      headlineSourceIds: [headlineSource.source.id],
      summarySourceIds: [summarySource.source.id],
    },
  };
}

function creatorKey(document: EditorialSnapshotDocument): string {
  return (
    normalizeEditorialFeedbackCreatorKey(document.source.creator ?? '') ??
    normalizeEditorialFeedbackCreatorKey(document.source.publisher ?? '') ??
    document.source.id
  );
}

function domainsFor(cluster: WorkingCluster): Set<string> {
  const domains = new Set<string>();
  for (const url of cluster.canonicalUrls) {
    try {
      domains.add(new URL(url).hostname.replace(/^www\./, ''));
    } catch {
      // Invalid URLs are removed during snapshot validation and normalization.
    }
  }
  return domains;
}

function zineRelationship(
  document: EditorialSnapshotDocument,
  exactSource: boolean,
  creatorMatch: boolean
): EditorialCandidateZineMatch['relationship'] {
  if (exactSource) return 'EXACT_SOURCE';
  if (document.source.userState === 'FINISHED' || document.signals.isFinished)
    return 'PREVIOUSLY_FINISHED';
  if (document.source.userState === 'BOOKMARKED' && !document.signals.isFinished)
    return 'UNFINISHED_CONTEXT';
  return creatorMatch ? 'CREATOR_MATCH' : 'TOPIC_MATCH';
}

function matchZineDocuments(
  cluster: WorkingCluster,
  zineDocuments: EditorialSnapshotDocument[]
): EditorialCandidateZineMatch[] {
  const matches: EditorialCandidateZineMatch[] = [];
  const clusterCreators = new Set(cluster.documents.map(creatorKey));
  for (const document of zineDocuments) {
    const sourceUrl = normalizeUrl(document.source.canonicalUrl);
    const exactSource = Boolean(sourceUrl && cluster.canonicalUrls.has(sourceUrl));
    const creatorMatch = clusterCreators.has(creatorKey(document));
    const documentTokenSet = tokensFor(documentText(document));
    const shared = intersectionSize(cluster.topics, documentTokenSet);
    const coverage = shared / Math.max(1, Math.min(cluster.topics.size, documentTokenSet.size, 12));
    const tagMatches = document.signals.tags.filter((tag) =>
      cluster.topics.has(tag.toLocaleLowerCase())
    ).length;
    if (!exactSource && !creatorMatch && shared < 2 && tagMatches === 0) continue;
    const matchScore = exactSource
      ? 100
      : clamp(coverage * 75 + Math.min(20, tagMatches * 10) + (creatorMatch ? 20 : 0));
    if (!exactSource && matchScore < 30) continue;
    const relationship = zineRelationship(document, exactSource, creatorMatch);
    matches.push({
      sourceId: document.source.id,
      relationship,
      matchScore,
      reason:
        relationship === 'EXACT_SOURCE'
          ? 'The discovered conversation contains the same canonical source already present in Zine.'
          : relationship === 'PREVIOUSLY_FINISHED'
            ? 'A previously finished Zine item provides personal context for this conversation.'
            : relationship === 'UNFINISHED_CONTEXT'
              ? 'An unfinished saved item aligns with this conversation.'
              : relationship === 'CREATOR_MATCH'
                ? 'A creator in this Zine item also appears in the conversation.'
                : 'High-information terms in this Zine item overlap with the conversation.',
    });
  }
  return matches
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore || left.sourceId.localeCompare(right.sourceId)
    )
    .slice(0, 8);
}

function setSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = intersectionSize(left, right);
  return intersection / (left.size + right.size - intersection);
}

function historicalSimilarity(cluster: WorkingCluster, snapshot: EditorialSnapshot): number {
  let strongest = 0;
  for (const story of snapshot.history?.stories ?? []) {
    const historicalUrls = new Set(
      story.canonicalUrls.map(normalizeUrl).filter((value): value is string => Boolean(value))
    );
    if (intersectionSize(cluster.canonicalUrls, historicalUrls) > 0) return 1;
    strongest = Math.max(
      strongest,
      setSimilarity(cluster.topics, tokensFor(story.topics.join(' ')))
    );
  }
  return round(strongest, 3);
}

function percentileScore(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0 || value <= 0) return 0;
  if (sortedValues.length === 1) return 100;
  let lower = 0;
  while (lower < sortedValues.length && (sortedValues[lower] ?? 0) < value) lower++;
  let upper = lower;
  while (upper < sortedValues.length && (sortedValues[upper] ?? 0) <= value) upper++;
  const midRank = (lower + upper - 1) / 2;
  return clamp((midRank / (sortedValues.length - 1)) * 100);
}

function rawCandidate(cluster: WorkingCluster, snapshot: EditorialSnapshot): RawCandidate {
  const framing = framingFor(cluster);
  const creators = new Set(cluster.documents.map(creatorKey));
  const domains = domainsFor(cluster);
  const origins = new Set(cluster.documents.map((document) => document.source.origin));
  const xDocuments = cluster.documents.filter((document) => document.source.origin === 'X');
  const runIds = new Set(
    xDocuments.flatMap((document) =>
      document.signals.tags.filter((tag) => tag.startsWith('x-run:')).map((tag) => tag.slice(6))
    )
  );
  const explicitRecommendationCount = xDocuments.filter((document) =>
    ENDORSEMENT_PATTERN.test(document.text ?? '')
  ).length;
  const linkedSourceCount = cluster.documents.filter(
    (document) => urlsFor(document).size > 0
  ).length;
  const repeatedUnigrams = new Map<string, number>();
  for (const document of cluster.documents) {
    for (const token of tokensFor(documentText(document))) {
      repeatedUnigrams.set(token, (repeatedUnigrams.get(token) ?? 0) + 1);
    }
  }
  const repeatedInformativeTerms = [...repeatedUnigrams.values()].filter(
    (count) => count >= 2
  ).length;
  const hasRecoverableArtifact = cluster.canonicalUrls.size > 0;
  const hasCoherentTextSubject =
    xDocuments.length >= 2 && creators.size >= 2 && repeatedInformativeTerms >= 3;
  const frontPageEligible = hasRecoverableArtifact || hasCoherentTextSubject;
  const eligibilityReasons = frontPageEligible
    ? [
        hasRecoverableArtifact
          ? 'A canonical non-social artifact makes the candidate editorially recoverable.'
          : `${repeatedInformativeTerms} substantive terms recur across independent voices, preserving a recoverable text-only subject.`,
      ]
    : [
        'The cluster has neither a canonical non-social artifact nor enough recurring substantive terms to recover a coherent editorial subject.',
      ];
  const observedTimes = cluster.documents.map((document) => Date.parse(document.observedAt));
  const newest = Math.max(...observedTimes);
  const ageHours = Math.max(0, (Date.parse(snapshot.window.through) - newest) / 3_600_000);
  const historical = historicalSimilarity(cluster, snapshot);
  const zineSourceCount = cluster.documents.filter(
    (document) => document.source.origin === 'ZINE'
  ).length;
  const nonXPublishers = new Set(
    cluster.documents
      .filter((document) => document.source.origin !== 'X')
      .map(
        (document) =>
          normalizeEditorialFeedbackCreatorKey(document.source.publisher ?? '') ??
          normalizeEditorialFeedbackCreatorKey(document.source.creator ?? '') ??
          document.source.id
      )
  );
  const roleQuality = cluster.documents.reduce((total, document) => {
    const score =
      document.source.role === 'PRIMARY'
        ? 3
        : document.source.role === 'REPORTING'
          ? 2.5
          : document.source.role === 'ANALYSIS'
            ? 2
            : 1;
    return total + score;
  }, 0);
  const representativeSourceIds = [...cluster.documents]
    .sort(
      (left, right) =>
        sourceStrength(right) - sourceStrength(left) ||
        left.source.id.localeCompare(right.source.id)
    )
    .filter(
      (document, index, documents) =>
        documents.findIndex((candidate) => creatorKey(candidate) === creatorKey(document)) === index
    )
    .slice(0, 5)
    .map((document) => document.source.id);
  let penalties = 0;
  if (creators.size <= 1) penalties += 4;
  if (linkedSourceCount === 0) penalties += 4;
  if (cluster.documents.every((document) => documentText(document).trim().length < 40))
    penalties += 12;
  if (
    cluster.documents.length === 1 &&
    linkedSourceCount === 0 &&
    documentText(cluster.documents[0]!).length < 80
  )
    penalties += 10;

  return {
    cluster,
    title: framing.title,
    summary: framing.summary,
    framing: framing.framing,
    creators,
    domains,
    runIds,
    representativeSourceIds,
    explicitRecommendationCount,
    linkedSourceCount,
    historicalSimilarity: historical,
    frontPageEligible,
    eligibilityReasons,
    xOnly: origins.size === 1 && origins.has('X'),
    raw: {
      conversationBreadth:
        creators.size * 2 + cluster.documents.length + Math.max(0, origins.size - 1) * 2,
      attention: Math.max(0, ...xDocuments.map(engagementStrength)),
      recommendationStrength: explicitRecommendationCount * 3,
      momentum:
        xDocuments.length > 0
          ? runIds.size >= 2
            ? runIds.size * 2 + cluster.documents.length
            : 0
          : cluster.documents.length > 1
            ? 1
            : 0,
      freshness: Math.max(0, 96 - ageHours),
      personalRelevance:
        zineSourceCount * 3 +
        cluster.zineMatches.reduce((total, match) => total + match.matchScore / 50, 0),
      evidenceQuality: roleQuality + linkedSourceCount * 1.5 + Math.max(0, creators.size - 1),
      crossSource: Math.max(0, origins.size - 1) * 4 + Math.max(0, nonXPublishers.size - 1) * 2,
      historicalNovelty: (1 - historical) * 100,
      serendipity: Math.max(0, roleQuality + linkedSourceCount - zineSourceCount * 2),
    },
    penalties: clamp(penalties),
  };
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
  const topicKeys = new Set(normalizeEditorialFeedbackTopicTokens([...cluster.topics]));
  const creatorKeys = new Set(
    [
      ...cluster.documents.map((document) => document.source.creator),
      ...cluster.zineMatches.map(
        (match) => zineDocumentsById.get(match.sourceId)?.source.creator ?? null
      ),
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeEditorialFeedbackCreatorKey)
      .filter((value): value is string => Boolean(value))
  );
  const canonicalUrlKeys = new Set(
    [...cluster.canonicalUrls, ...cluster.documents.map((document) => document.source.canonicalUrl)]
      .map(normalizeEditorialFeedbackCanonicalUrl)
      .filter((value): value is string => Boolean(value))
  );
  const sourceIdKeys = new Set([
    ...cluster.documents.map((document) => document.source.id),
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
  const topicPreferences = matchedTopics.flatMap((key) =>
    topicsByKey.get(key) ? [topicsByKey.get(key)!] : []
  );
  const creatorPreferences = matchedCreators.flatMap((key) =>
    creatorsByKey.get(key) ? [creatorsByKey.get(key)!] : []
  );
  const exactPreferences = [
    ...matchedCanonicalUrls.flatMap((key) => (urlsByKey.get(key) ? [urlsByKey.get(key)!] : [])),
    ...matchedSourceIds.flatMap((key) => (sourcesByKey.get(key) ? [sourcesByKey.get(key)!] : [])),
  ];
  const allPreferences = [...topicPreferences, ...creatorPreferences, ...exactPreferences];
  if (allPreferences.length === 0) return null;
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

function candidateSimilarity(left: RawCandidate, right: RawCandidate): number {
  if (intersectionSize(left.cluster.canonicalUrls, right.cluster.canonicalUrls) > 0) return 1;
  const leftUnigrams = new Set(
    [...left.cluster.features].filter((feature) => feature.startsWith('u:'))
  );
  const rightUnigrams = new Set(
    [...right.cluster.features].filter((feature) => feature.startsWith('u:'))
  );
  const containment =
    Math.min(leftUnigrams.size, rightUnigrams.size) > 0
      ? intersectionSize(leftUnigrams, rightUnigrams) /
        Math.min(leftUnigrams.size, rightUnigrams.size)
      : 0;
  const leftTitleTokens = tokensFor(left.title);
  const rightTitleTokens = tokensFor(right.title);
  const sharedDistinctiveTitleTerms = [...leftTitleTokens].filter(
    (token) => token.length >= 5 && rightTitleTokens.has(token)
  ).length;
  const titleEntitySimilarity =
    sharedDistinctiveTitleTerms > 0 ? Math.min(0.75, 0.4 + sharedDistinctiveTitleTerms * 0.15) : 0;
  return Math.max(
    setSimilarity(left.cluster.topics, right.cluster.topics),
    setSimilarity(left.cluster.features, right.cluster.features),
    containment * 0.65,
    titleEntitySimilarity
  );
}

function themeSaturationPenalty(candidate: RawCandidate, selected: RawCandidate[]): number {
  if (selected.length === 0) return 0;
  const selectedCounts = new Map<string, number>();
  for (const value of selected) {
    const terms = new Set(
      [...value.cluster.features]
        .filter((feature) => feature.startsWith('u:'))
        .map((feature) => feature.slice(2))
    );
    for (const term of terms) selectedCounts.set(term, (selectedCounts.get(term) ?? 0) + 1);
  }
  const candidateTerms = new Set(
    [...candidate.cluster.features]
      .filter((feature) => feature.startsWith('u:'))
      .map((feature) => feature.slice(2))
  );
  const pressures = [...candidateTerms]
    .map((term) => selectedCounts.get(term) ?? 0)
    .filter((count) => count > 0)
    .sort((left, right) => right - left)
    .slice(0, 5);
  return round(
    Math.min(
      24,
      pressures.reduce((sum, count) => sum + count * 2.25, 0)
    )
  );
}

function concentration(candidates: RawCandidate[]): number {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    for (const topic of candidate.cluster.topics) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;
  return round(
    [...counts.values()].reduce((sum, count) => sum + (count / total) ** 2, 0),
    3
  );
}

function selectPortfolio(candidates: EditorialCandidateV2[], rawById: Map<string, RawCandidate>) {
  const eligibleCandidates = candidates.filter(
    (candidate) => rawById.get(candidate.id)?.frontPageEligible
  );
  const targetSize = Math.max(1, Math.min(8, eligibleCandidates.length));
  const selected: EditorialCandidateV2[] = [];
  const selectionDetails = new Map<
    string,
    {
      selectionScore: number;
      redundancyPenalty: number;
      sourceConcentrationPenalty: number;
      historicalRepeatPenalty: number;
    }
  >();
  const remaining = new Map(eligibleCandidates.map((candidate) => [candidate.id, candidate]));

  while (selected.length < targetSize && remaining.size > 0) {
    const scored = [...remaining.values()].flatMap((candidate) => {
      const raw = rawById.get(candidate.id)!;
      const selectedRaw = selected.map((value) => rawById.get(value.id)!);
      const maxSimilarity = Math.max(
        0,
        ...selectedRaw.map((value) => candidateSimilarity(raw, value))
      );
      if (maxSimilarity >= HARD_SEMANTIC_DUPLICATE_THRESHOLD) return [];
      const themeSaturation = themeSaturationPenalty(raw, selectedRaw);
      const sharedCreators = new Set(
        selectedRaw
          .flatMap((value) => [...value.creators])
          .filter((creator) => raw.creators.has(creator))
      ).size;
      const sharedDomains = new Set(
        selectedRaw
          .flatMap((value) => [...value.domains])
          .filter((domain) => raw.domains.has(domain))
      ).size;
      const redundancyPenalty = round(Math.min(40, maxSimilarity * 28 + themeSaturation));
      const sourceConcentrationPenalty = round(
        Math.min(20, sharedCreators * 6 + sharedDomains * 5)
      );
      const historicalRepeatPenalty = round(candidate.historicalSimilarity * 12);
      const selectionScore = round(
        candidate.score.total -
          redundancyPenalty -
          sourceConcentrationPenalty -
          historicalRepeatPenalty
      );
      return [
        {
          candidate,
          selectionScore,
          redundancyPenalty,
          sourceConcentrationPenalty,
          historicalRepeatPenalty,
        },
      ];
    });
    scored.sort(
      (left, right) =>
        right.selectionScore - left.selectionScore ||
        right.candidate.score.total - left.candidate.score.total ||
        left.candidate.id.localeCompare(right.candidate.id)
    );
    const winner = scored[0];
    if (!winner) break;
    selected.push(winner.candidate);
    selectionDetails.set(winner.candidate.id, {
      selectionScore: winner.selectionScore,
      redundancyPenalty: winner.redundancyPenalty,
      sourceConcentrationPenalty: winner.sourceConcentrationPenalty,
      historicalRepeatPenalty: winner.historicalRepeatPenalty,
    });
    remaining.delete(winner.candidate.id);
  }

  const selectedRaw = selected.map((candidate) => rawById.get(candidate.id)!);
  const pairwise: number[] = [];
  for (let left = 0; left < selectedRaw.length; left++) {
    for (let right = left + 1; right < selectedRaw.length; right++) {
      pairwise.push(candidateSimilarity(selectedRaw[left]!, selectedRaw[right]!));
    }
  }
  const finalDetails = (candidate: EditorialCandidateV2) => {
    const existing = selectionDetails.get(candidate.id);
    if (existing) return existing;
    const raw = rawById.get(candidate.id)!;
    const maxSimilarity = Math.max(
      0,
      ...selectedRaw.map((value) => candidateSimilarity(raw, value))
    );
    const themeSaturation = themeSaturationPenalty(raw, selectedRaw);
    const sharedCreators = new Set(
      selectedRaw
        .flatMap((value) => [...value.creators])
        .filter((creator) => raw.creators.has(creator))
    ).size;
    const sharedDomains = new Set(
      selectedRaw.flatMap((value) => [...value.domains]).filter((domain) => raw.domains.has(domain))
    ).size;
    const redundancyPenalty = round(Math.min(40, maxSimilarity * 28 + themeSaturation));
    const sourceConcentrationPenalty = round(Math.min(20, sharedCreators * 6 + sharedDomains * 5));
    const historicalRepeatPenalty = round(candidate.historicalSimilarity * 12);
    return {
      selectionScore: round(
        candidate.score.total -
          redundancyPenalty -
          sourceConcentrationPenalty -
          historicalRepeatPenalty
      ),
      redundancyPenalty,
      sourceConcentrationPenalty,
      historicalRepeatPenalty,
    };
  };
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  const decisions = candidates.map((candidate) => {
    const detail = finalDetails(candidate);
    const raw = rawById.get(candidate.id)!;
    const portfolioIndex = selected.findIndex((value) => value.id === candidate.id);
    const pressures = [
      detail.redundancyPenalty > 0 ? 'semantic redundancy' : null,
      detail.sourceConcentrationPenalty > 0 ? 'creator or domain concentration' : null,
      detail.historicalRepeatPenalty > 0 ? 'recent-edition similarity' : null,
    ].filter(Boolean);
    return {
      candidateId: candidate.id,
      selected: selectedIds.has(candidate.id),
      portfolioRank: portfolioIndex >= 0 ? portfolioIndex + 1 : null,
      ...detail,
      reason: !raw.frontPageEligible
        ? `Omitted from the ${targetSize}-candidate portfolio because ${raw.eligibilityReasons.join(' ')}`
        : portfolioIndex >= 0
          ? pressures.length > 0
            ? `Selected after accounting for ${pressures.join(', ')}.`
            : 'Selected on evidence strength without concentration or repeat pressure.'
          : `Omitted from the ${targetSize}-candidate portfolio${pressures.length > 0 ? ` because of ${pressures.join(', ')}` : ' after stronger non-redundant candidates were selected'}.`,
    };
  });
  const origins = { x: 0, zine: 0, external: 0 };
  for (const raw of selectedRaw) {
    if (raw.cluster.documents.some((document) => document.source.origin === 'X')) origins.x++;
    if (raw.cluster.documents.some((document) => document.source.origin === 'ZINE')) origins.zine++;
    if (raw.cluster.documents.some((document) => document.source.origin === 'EXTERNAL'))
      origins.external++;
  }
  return {
    algorithm: PORTFOLIO_ALGORITHM,
    targetSize,
    selectedCandidateIds: selected.map((candidate) => candidate.id),
    decisions,
    editorialOverrides: [],
    diagnostics: {
      selectedCount: selected.length,
      meanPairwiseSimilarity:
        pairwise.length > 0
          ? round(pairwise.reduce((sum, value) => sum + value, 0) / pairwise.length, 3)
          : 0,
      maxPairwiseSimilarity: pairwise.length > 0 ? round(Math.max(...pairwise), 3) : 0,
      corpusTopicConcentration: concentration([...rawById.values()]),
      selectedTopicConcentration: concentration(selectedRaw),
      uniqueCreators: new Set(selectedRaw.flatMap((raw) => [...raw.creators])).size,
      uniqueDomains: new Set(selectedRaw.flatMap((raw) => [...raw.domains])).size,
      historicalRepeatRiskCount: selected.filter(
        (candidate) => candidate.historicalSimilarity >= 0.65
      ).length,
      originCounts: origins,
    },
  };
}

export function buildEditorialCandidateArtifact(
  rawSnapshot: unknown,
  generatedAt?: Date
): EditorialCandidateArtifact {
  const snapshot = EditorialSnapshotSchema.parse(rawSnapshot);
  const windowStart = Date.parse(snapshot.window.newContentAfter);
  const discoveryDocuments = snapshot.documents.filter((document) =>
    isDiscoveryDocument(document, windowStart)
  );
  const zineDocuments = snapshot.documents.filter((document) => document.source.origin === 'ZINE');
  const zineDocumentsById = new Map(
    zineDocuments.map((document) => [document.source.id, document])
  );
  const workingClusters = buildClusters(discoveryDocuments);
  for (const cluster of workingClusters)
    cluster.zineMatches = matchZineDocuments(cluster, zineDocuments);
  const rawCandidates = workingClusters.map((cluster) => rawCandidate(cluster, snapshot));
  const distributions = Object.fromEntries(
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => [
      key,
      rawCandidates.map((candidate) => candidate.raw[key]).sort((left, right) => left - right),
    ])
  ) as Record<keyof typeof WEIGHTS, number[]>;

  const scored = rawCandidates.map((raw) => {
    const component = Object.fromEntries(
      (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => [
        key,
        key === 'historicalNovelty'
          ? clamp(raw.raw[key])
          : percentileScore(raw.raw[key], distributions[key]),
      ])
    ) as Record<keyof typeof WEIGHTS, number>;
    if (raw.xOnly) {
      component.evidenceQuality = Math.min(
        component.evidenceQuality,
        raw.linkedSourceCount > 0 ? 35 : 20
      );
      component.crossSource = 0;
    }
    const baseTotal = Math.min(
      92,
      clamp(
        (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
          (total, key) => total + component[key] * WEIGHTS[key],
          0
        ) - raw.penalties
      )
    );
    const feedbackImpact = feedbackImpactForCluster(
      raw.cluster,
      snapshot.feedbackProfile,
      zineDocumentsById,
      baseTotal
    );
    const feedbackAdjustment = feedbackImpact?.adjustment ?? 0;
    const score: EditorialCandidateScoreV2 = {
      ...component,
      penalties: raw.penalties,
      feedbackAdjustment,
      total: clamp(baseTotal + feedbackAdjustment),
    };
    const origins = [
      ...new Set(raw.cluster.documents.map((document) => document.source.origin)),
    ].sort();
    const reasons = [
      'Canonical artifacts and corpus-relative high-information terms formed this topic-neutral cluster.',
      `${raw.cluster.documents.length} source${raw.cluster.documents.length === 1 ? '' : 's'} from ${raw.creators.size} independent voice${raw.creators.size === 1 ? '' : 's'} across ${origins.join(', ')}.`,
      raw.explicitRecommendationCount > 0
        ? `${raw.explicitRecommendationCount} X post${raw.explicitRecommendationCount === 1 ? '' : 's'} used explicit recommendation language.`
        : 'No explicit recommendation language was detected.',
      raw.linkedSourceCount > 0
        ? `${raw.linkedSourceCount} source${raw.linkedSourceCount === 1 ? '' : 's'} linked an underlying artifact.`
        : 'No captured underlying artifact was linked.',
      raw.historicalSimilarity > 0
        ? `The strongest similarity to a recent edition was ${Math.round(raw.historicalSimilarity * 100)}%.`
        : 'No meaningful recent-edition overlap was found.',
      raw.cluster.zineMatches.length > 0
        ? `${raw.cluster.zineMatches.length} Zine connection${raw.cluster.zineMatches.length === 1 ? '' : 's'} informed capped personal relevance.`
        : 'No strong Zine affinity match was found; the candidate remains eligible through evidence and serendipity.',
      ...raw.eligibilityReasons,
      ...(raw.xOnly
        ? [
            'X-only repetition is treated as conversation evidence, not independent factual corroboration; evidence quality and cross-source scores are capped.',
          ]
        : []),
    ];
    if (feedbackImpact) {
      reasons.push(
        `Explicit feedback adjusted the topic-neutral base score by ${feedbackImpact.adjustment >= 0 ? '+' : ''}${feedbackImpact.adjustment.toFixed(1)} points.`
      );
    }
    return { raw, score, reasons, feedbackImpact };
  });
  scored.sort(
    (left, right) =>
      right.score.total - left.score.total ||
      right.raw.cluster.documents.length - left.raw.cluster.documents.length ||
      left.raw.cluster.id.localeCompare(right.raw.cluster.id)
  );

  const candidates: EditorialCandidateV2[] = scored.map(
    ({ raw, score, reasons, feedbackImpact }, index) => {
      const sourceIds = raw.cluster.documents.map((document) => document.source.id).sort();
      return {
        id: `candidate_${stableHash(`${snapshot.id}:${raw.cluster.id}`)}`,
        clusterId: raw.cluster.id,
        rank: index + 1,
        title: raw.title,
        summary: raw.summary,
        canonicalUrl: [...raw.cluster.canonicalUrls].sort()[0] ?? null,
        sourceIds,
        representativeSourceIds: raw.representativeSourceIds,
        xSourceIds: sourceIds.filter(
          (id) =>
            snapshot.documents.find((document) => document.source.id === id)?.source.origin === 'X'
        ),
        zineSourceIds: sourceIds.filter(
          (id) =>
            snapshot.documents.find((document) => document.source.id === id)?.source.origin ===
            'ZINE'
        ),
        externalSourceIds: sourceIds.filter(
          (id) =>
            snapshot.documents.find((document) => document.source.id === id)?.source.origin ===
            'EXTERNAL'
        ),
        zineMatches: raw.cluster.zineMatches,
        independentVoiceCount: raw.creators.size,
        sourceCount: sourceIds.length,
        xPostCount: raw.cluster.documents.filter((document) => document.source.origin === 'X')
          .length,
        xRunCount: raw.runIds.size,
        explicitRecommendationCount: raw.explicitRecommendationCount,
        linkedSourceCount: raw.linkedSourceCount,
        historicalSimilarity: raw.historicalSimilarity,
        score,
        scoreReasons: reasons,
        framing: raw.framing,
        ...(feedbackImpact ? { feedbackImpact } : {}),
      };
    }
  );
  const rawById = new Map(candidates.map((candidate, index) => [candidate.id, scored[index]!.raw]));
  const portfolio = selectPortfolio(candidates, rawById);
  const clusters = scored.map(({ raw }) => {
    const sourceIds = raw.cluster.documents.map((document) => document.source.id).sort();
    const sourceIdsFor = (origin: 'X' | 'ZINE' | 'EXTERNAL') =>
      raw.cluster.documents
        .filter((document) => document.source.origin === origin)
        .map((document) => document.source.id)
        .sort();
    return {
      id: raw.cluster.id,
      key: raw.cluster.key,
      title: raw.title,
      firstSeenAt: new Date(
        Math.min(...raw.cluster.documents.map((document) => Date.parse(document.firstSeenAt)))
      ).toISOString(),
      lastSeenAt: new Date(
        Math.max(...raw.cluster.documents.map((document) => Date.parse(document.observedAt)))
      ).toISOString(),
      topics: [...raw.cluster.topics].slice(0, 30),
      canonicalUrls: [...raw.cluster.canonicalUrls].sort(),
      sourceIds,
      xSourceIds: sourceIdsFor('X'),
      zineSourceIds: sourceIdsFor('ZINE'),
      externalSourceIds: sourceIdsFor('EXTERNAL'),
      featureModel: FEATURE_MODEL,
    };
  });
  const coverageNotes = [...snapshot.provenance.warnings];
  if (snapshot.provenance.sourceStatus.xArchive !== 'COMPLETE') {
    coverageNotes.push(
      `X archive input was ${snapshot.provenance.sourceStatus.xArchive.toLocaleLowerCase()}; X attention signals reflect incomplete coverage.`
    );
  }
  if (discoveryDocuments.length === 0)
    coverageNotes.push('No current X, Zine, or external discovery documents were available.');
  if ((snapshot.provenance.inputCounts.externalDiscoverySources ?? 0) === 0) {
    coverageNotes.push(
      'No bounded external discovery artifact was supplied; the outside lens is limited to current Zine Inbox material.'
    );
  }
  if (!snapshot.history || snapshot.history.stories.length === 0) {
    coverageNotes.push(
      'No recent edition history was available; historical novelty defaults to fully novel.'
    );
  }
  if (snapshot.feedbackProfile?.eventCount) {
    const adjusted = candidates.filter(
      (candidate) => candidate.score.feedbackAdjustment !== 0
    ).length;
    coverageNotes.push(
      `${snapshot.feedbackProfile.eventCount} explicit tuning event${snapshot.feedbackProfile.eventCount === 1 ? '' : 's'} informed capped personal relevance; ${adjusted} candidate${adjusted === 1 ? '' : 's'} changed score.`
    );
  }

  const artifactContent = {
    schemaVersion: EDITORIAL_CANDIDATE_SCHEMA_VERSION,
    snapshotId: snapshot.id,
    editionDate: snapshot.editionDate,
    generatedAt: (generatedAt ?? new Date(snapshot.generatedAt)).toISOString(),
    strategy: 'EDITORIAL_V2',
    featureModel: FEATURE_MODEL,
    weights: WEIGHTS,
    provenance: snapshot.provenance,
    clusters,
    candidates,
    portfolio,
    coverageNotes,
  } as const;

  return EditorialCandidateArtifactV2Schema.parse({
    id: `candidate_artifact_v2_${stableHash(JSON.stringify(artifactContent))}`,
    ...artifactContent,
  });
}
