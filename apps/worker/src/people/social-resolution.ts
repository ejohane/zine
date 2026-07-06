import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { Database } from '../db';
import {
  creators,
  itemEnrichments,
  items,
  personSocialProfiles,
  providerConnections,
  userPeople,
  userPersonMentions,
} from '../db/schema';
import { logger } from '../lib/logger';
import {
  getValidAccessToken,
  type ProviderConnection,
  type TokenRefreshEnv,
} from '../lib/token-refresh';
import { lookupXUserByUsername, type XUser } from '../providers/x';
import type { Bindings } from '../types';
import { ENRICHMENT_SCHEMA_VERSION } from '../enrichment/types';

const socialLogger = logger.child('people-social-resolution');

const AUTO_LINK_THRESHOLD = 0.82;
const CANDIDATE_THRESHOLD = 0.45;
const INFERRED_HANDLE_MIN_CONFIDENCE = 0.68;
const MAX_SEARCH_QUERIES_PER_PERSON = 4;
const MAX_EXPLICIT_HANDLE_LOOKUPS_PER_PERSON = 1;
const ITEM_SUMMARY_CONTEXT_LIMIT = 1200;
const STORED_CANDIDATE_REUSE_MIN_CONFIDENCE = 0.7;
const STORED_CANDIDATE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const EXPLICIT_HANDLE_NEAR_PERSON_MAX_DISTANCE = 180;

export type XResolutionEnv = Pick<
  Bindings,
  | 'DB'
  | 'ENCRYPTION_KEY'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'OAUTH_STATE_KV'
  | 'SPOTIFY_CLIENT_ID'
  | 'SPOTIFY_CLIENT_SECRET'
  | 'TOKEN_REFRESH_LOCK_WAIT_MS'
  | 'X_BEARER_TOKEN'
  | 'X_CLIENT_ID'
  | 'X_CLIENT_SECRET'
  | 'X_PROFILE_SEARCH_USER_ID'
>;

type XHandleCandidateSource = 'AI_INFERRED' | 'CONTEXT_EXPLICIT' | 'NAME_DERIVED';
type XHandleLookupCandidate = {
  username: string;
  confidence: number;
  reason?: string | null;
  source: XHandleCandidateSource;
};

type StoredXProfileCandidate = Pick<
  typeof personSocialProfiles.$inferSelect,
  | 'providerProfileId'
  | 'handle'
  | 'displayName'
  | 'avatarUrl'
  | 'profileUrl'
  | 'description'
  | 'verified'
  | 'evidenceJson'
>;

type XAccessTokens = {
  userSearchAccessToken: string | null;
  directLookupAccessToken: string | null;
};

const STOPWORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'but',
  'for',
  'from',
  'how',
  'into',
  'its',
  'new',
  'not',
  'now',
  'of',
  'on',
  'or',
  'podcast',
  'show',
  'the',
  'this',
  'video',
  'with',
  'you',
  'your',
]);

export type PersonForResolution = {
  id: string;
  userId: string;
  displayName: string;
  normalizedName: string;
  profileImageSource: string | null;
  xHandle: string | null;
  relationship: string;
  evidenceText: string | null;
};

export type ItemContext = {
  itemId: string;
  title: string;
  provider: string;
  contentType: string;
  publisher: string | null;
  summary: string | null;
  rawMetadata: string | null;
  creatorName: string | null;
  creatorDescription: string | null;
  creatorHandle: string | null;
};

export type XProfileCandidate = {
  id: string;
  name: string;
  username: string;
  description?: string;
  profileImageUrl?: string;
  url?: string;
  verified?: boolean;
  followersCount?: number;
};

export type ScoredXProfileCandidate = XProfileCandidate & {
  confidence: number;
  matchedTerms: string[];
  negativeSignals: string[];
  inferredHandleConfidence?: number;
  inferredHandleReason?: string | null;
  inferredHandleSource?: XHandleCandidateSource;
};

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizedWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function truncate(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function normalizeXUsername(value: string): string | null {
  const withoutUrl = value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '')
    .split(/[/?#]/)[0]
    ?.replace(/^@/, '')
    .trim();

  if (!withoutUrl || !/^[A-Za-z0-9_]{1,15}$/.test(withoutUrl)) {
    return null;
  }

  return withoutUrl;
}

function parseMetadataText(rawMetadata: string | null): string {
  if (!rawMetadata) return '';
  try {
    return JSON.stringify(JSON.parse(rawMetadata));
  } catch {
    return rawMetadata;
  }
}

function extractHandles(text: string | null | undefined): string[] {
  if (!text) return [];

  const handles = new Set<string>();
  const handlePattern =
    /(?:https?:\/\/(?:www\.)?(?:x|twitter)\.com\/|(?<![A-Za-z0-9_])@)([A-Za-z0-9_]{1,15})(?=$|[^A-Za-z0-9_])/gi;
  let match: RegExpExecArray | null;

  while ((match = handlePattern.exec(text)) !== null) {
    const username = normalizeXUsername(match[1] ?? '');
    if (username) handles.add(username);
  }

  return [...handles];
}

function prioritizedContextTextParts(
  context: ItemContext,
  person: Pick<PersonForResolution, 'evidenceText'>
) {
  return [
    person.evidenceText,
    context.creatorName,
    context.publisher,
    context.title,
    context.creatorHandle,
    context.creatorDescription,
    truncate(context.summary, ITEM_SUMMARY_CONTEXT_LIMIT),
    parseMetadataText(context.rawMetadata),
  ].filter((text): text is string => Boolean(text));
}

export function extractContextTerms(
  context: ItemContext,
  person: Pick<PersonForResolution, 'displayName' | 'evidenceText'>
) {
  const personWords = new Set(normalizedWords(person.displayName));
  const terms: string[] = [];

  for (const text of prioritizedContextTextParts(context, person)) {
    for (const word of normalizedWords(text)) {
      if (personWords.has(word) || /^\d+$/.test(word) || terms.includes(word)) {
        continue;
      }

      terms.push(word);
      if (terms.length >= 16) {
        return terms;
      }
    }
  }

  return terms;
}

export function buildXSearchQueries(person: PersonForResolution, context: ItemContext): string[] {
  const contextTerms = extractContextTerms(context, person).slice(0, 6);
  const strongContext = [context.creatorName, context.publisher, ...contextTerms.slice(0, 3)]
    .filter(Boolean)
    .join(' ');

  return unique(
    [
      `"${person.displayName}"`,
      strongContext ? `"${person.displayName}" ${strongContext}` : null,
      contextTerms[0] ? `${person.displayName} ${contextTerms[0]}` : null,
      contextTerms[1] ? `${person.displayName} ${contextTerms[1]}` : null,
    ].filter((query): query is string => Boolean(query))
  ).slice(0, MAX_SEARCH_QUERIES_PER_PERSON);
}

function candidateText(candidate: XProfileCandidate): string {
  return [candidate.name, candidate.username, candidate.description, candidate.url]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasNegativeSignal(candidate: XProfileCandidate): string[] {
  const text = candidateText(candidate);
  return ['parody', 'fan account', 'fanpage', 'not affiliated', 'unofficial'].filter((signal) =>
    text.includes(signal)
  );
}

export function scoreXProfileCandidate(input: {
  personName: string;
  contextTerms: string[];
  candidate: XProfileCandidate;
}): ScoredXProfileCandidate {
  const personCompact = compact(input.personName);
  const candidateNameCompact = compact(input.candidate.name);
  const usernameCompact = compact(input.candidate.username);
  const personParts = normalizedWords(input.personName).map(compact);
  const searchableText = candidateText(input.candidate);
  const matchedTerms = input.contextTerms.filter((term) => searchableText.includes(term));
  const negativeSignals = hasNegativeSignal(input.candidate);

  let confidence = 0;
  if (candidateNameCompact === personCompact) {
    confidence += 0.72;
  } else if (
    candidateNameCompact.includes(personCompact) ||
    personCompact.includes(candidateNameCompact)
  ) {
    confidence += 0.58;
  } else if (
    personParts.length > 1 &&
    personParts.every((part) => candidateNameCompact.includes(part))
  ) {
    confidence += 0.48;
  }

  if (usernameCompact === personCompact) {
    confidence += 0.06;
  } else if (personParts.some((part) => part.length >= 4 && usernameCompact.includes(part))) {
    confidence += 0.06;
  }

  confidence += Math.min(0.22, matchedTerms.length * 0.055);
  if (input.candidate.verified) confidence += 0.03;
  if ((input.candidate.followersCount ?? 0) >= 10_000) confidence += 0.02;
  confidence -= negativeSignals.length * 0.25;

  return {
    ...input.candidate,
    confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(3)))),
    matchedTerms,
    negativeSignals,
  };
}

function hasStrongNameMatch(personName: string, candidateName: string): boolean {
  const personCompact = compact(personName);
  const candidateNameCompact = compact(candidateName);
  const personParts = normalizedWords(personName).map(compact);

  return (
    candidateNameCompact === personCompact ||
    candidateNameCompact.includes(personCompact) ||
    (personParts.length > 1 && personParts.every((part) => candidateNameCompact.includes(part)))
  );
}

export function isAmbiguousPersonNameForSocialResolution(personName: string): boolean {
  return normalizedNameParts(personName).length < 2;
}

export function canAutoLinkXProfileCandidate(input: {
  personName: string;
  candidate: Pick<ScoredXProfileCandidate, 'inferredHandleSource'>;
}): boolean {
  if (!isAmbiguousPersonNameForSocialResolution(input.personName)) {
    return true;
  }

  return input.candidate.inferredHandleSource === 'CONTEXT_EXPLICIT';
}

export function scoreInferredXProfileCandidate(input: {
  personName: string;
  contextTerms: string[];
  candidate: XProfileCandidate;
  inferredHandle: XHandleLookupCandidate;
}): ScoredXProfileCandidate {
  const base = scoreXProfileCandidate(input);
  if (
    input.inferredHandle.confidence < INFERRED_HANDLE_MIN_CONFIDENCE ||
    !hasStrongNameMatch(input.personName, input.candidate.name) ||
    base.negativeSignals.length > 0
  ) {
    return {
      ...base,
      inferredHandleConfidence: input.inferredHandle.confidence,
      inferredHandleReason: input.inferredHandle.reason ?? null,
      inferredHandleSource: input.inferredHandle.source,
    };
  }

  if (input.inferredHandle.source === 'NAME_DERIVED' && base.matchedTerms.length === 0) {
    return {
      ...base,
      inferredHandleConfidence: input.inferredHandle.confidence,
      inferredHandleReason: input.inferredHandle.reason ?? null,
      inferredHandleSource: input.inferredHandle.source,
    };
  }

  const inferredConfidence = Math.min(
    0.96,
    0.82 + input.inferredHandle.confidence * 0.12 + Math.min(0.02, base.matchedTerms.length * 0.01)
  );

  return {
    ...base,
    confidence: Math.max(base.confidence, Number(inferredConfidence.toFixed(3))),
    inferredHandleConfidence: input.inferredHandle.confidence,
    inferredHandleReason: input.inferredHandle.reason ?? null,
    inferredHandleSource: input.inferredHandle.source,
  };
}

function normalizedNameParts(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildNameDerivedHandleCandidates(person: PersonForResolution): XHandleLookupCandidate[] {
  const parts = normalizedNameParts(person.displayName);
  if (parts.length < 2) return [];

  const first = parts[0];
  const last = parts[parts.length - 1];
  const firstInitial = first[0];
  const lastInitial = last[0];

  return unique(
    [
      `${first}${last}`,
      `${first}_${last}`,
      `${firstInitial}${last}`,
      `${firstInitial}_${last}`,
      `${first}${lastInitial}`,
      `${first}_${lastInitial}`,
      `${last}${first}`,
      `${last}_${first}`,
      `${last}${firstInitial}`,
      `${last}_${firstInitial}`,
    ]
      .map((candidate) => normalizeXUsername(candidate))
      .filter((candidate): candidate is string => Boolean(candidate))
  ).map((username) => ({
    username,
    confidence: 0.72,
    source: 'NAME_DERIVED',
    reason: 'Generated from the person name and validated by direct X profile lookup.',
  }));
}

function extractExplicitHandleCandidates(
  item: ItemContext,
  person: PersonForResolution
): XHandleLookupCandidate[] {
  const handles = new Set<string>();

  for (const username of extractHandles(person.evidenceText)) {
    handles.add(username);
  }

  if (
    item.creatorHandle &&
    item.creatorName &&
    hasStrongNameMatch(person.displayName, item.creatorName)
  ) {
    const username = normalizeXUsername(item.creatorHandle);
    if (username) handles.add(username);
  }

  const personName = person.displayName.toLowerCase();
  for (const text of [item.title, item.summary, parseMetadataText(item.rawMetadata)]) {
    if (!text) continue;

    const lowerText = text.toLowerCase();
    const personIndex = lowerText.indexOf(personName);
    if (personIndex === -1) continue;

    const handlePattern =
      /(?:https?:\/\/(?:www\.)?(?:x|twitter)\.com\/|(?<![A-Za-z0-9_])@)([A-Za-z0-9_]{1,15})(?=$|[^A-Za-z0-9_])/gi;
    let match: RegExpExecArray | null;
    while ((match = handlePattern.exec(text)) !== null) {
      if (Math.abs(match.index - personIndex) > EXPLICIT_HANDLE_NEAR_PERSON_MAX_DISTANCE) {
        continue;
      }
      const username = normalizeXUsername(match[1] ?? '');
      if (username) handles.add(username);
    }
  }

  return [...handles].map((username) => ({
    username,
    confidence: 0.92,
    source: 'CONTEXT_EXPLICIT',
    reason: 'Handle appears in the content context.',
  }));
}

function toXProfileCandidate(user: XUser): XProfileCandidate {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    description: user.description,
    profileImageUrl: user.profile_image_url,
    url: user.url,
    verified: user.verified,
    followersCount: user.public_metrics?.followers_count,
  };
}

async function getXUserSearchAccessToken(
  db: Database,
  env: XResolutionEnv
): Promise<string | null> {
  const serviceUserId = env.X_PROFILE_SEARCH_USER_ID?.trim();
  if (!serviceUserId) return null;

  if (!env.DB || !env.OAUTH_STATE_KV || !env.ENCRYPTION_KEY || !env.X_CLIENT_ID) {
    socialLogger.warn('X profile search user configured without token refresh bindings', {
      hasDb: !!env.DB,
      hasOauthStateKv: !!env.OAUTH_STATE_KV,
      hasEncryptionKey: !!env.ENCRYPTION_KEY,
      hasXClientId: !!env.X_CLIENT_ID,
    });
    return null;
  }

  const connection = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.userId, serviceUserId),
      eq(providerConnections.provider, 'X'),
      eq(providerConnections.status, 'ACTIVE')
    ),
  });

  if (!connection) {
    socialLogger.warn('X profile search user has no active X provider connection', {
      serviceUserId,
    });
    return null;
  }

  try {
    return await getValidAccessToken(
      connection as ProviderConnection,
      env as unknown as TokenRefreshEnv
    );
  } catch (error) {
    socialLogger.warn('Failed to get X profile search user access token', {
      serviceUserId,
      connectionId: connection.id,
      error,
    });
    return null;
  }
}

async function resolveXAccessTokens(db: Database, env: XResolutionEnv): Promise<XAccessTokens> {
  const userSearchAccessToken = await getXUserSearchAccessToken(db, env);
  const appOnlyAccessToken = env.X_BEARER_TOKEN?.trim() || null;
  return {
    userSearchAccessToken,
    directLookupAccessToken: appOnlyAccessToken ?? userSearchAccessToken,
  };
}

async function loadResolutionContext(
  db: Database,
  itemId: string
): Promise<{ item: ItemContext; people: PersonForResolution[] } | null> {
  const itemRows = await db
    .select({
      itemId: items.id,
      title: items.title,
      provider: items.provider,
      contentType: items.contentType,
      publisher: items.publisher,
      summary: items.summary,
      rawMetadata: items.rawMetadata,
      creatorName: creators.name,
      creatorDescription: creators.description,
      creatorHandle: creators.handle,
    })
    .from(items)
    .leftJoin(creators, eq(items.creatorId, creators.id))
    .where(eq(items.id, itemId))
    .limit(1);

  const item = itemRows[0];
  if (!item) return null;

  const enrichmentRows = await db
    .select({ id: itemEnrichments.id })
    .from(itemEnrichments)
    .where(
      and(
        eq(itemEnrichments.itemId, itemId),
        eq(itemEnrichments.schemaVersion, ENRICHMENT_SCHEMA_VERSION),
        eq(itemEnrichments.status, 'COMPLETE')
      )
    )
    .orderBy(desc(itemEnrichments.updatedAt))
    .limit(1);

  const enrichment = enrichmentRows[0];
  if (!enrichment) return null;

  const peopleRows = await db
    .select({
      id: userPeople.id,
      userId: userPeople.userId,
      displayName: userPeople.displayName,
      normalizedName: userPeople.normalizedName,
      profileImageSource: userPeople.profileImageSource,
      xHandle: userPeople.xHandle,
      relationship: userPersonMentions.relationship,
      evidenceText: userPersonMentions.evidenceText,
    })
    .from(userPersonMentions)
    .innerJoin(userPeople, eq(userPersonMentions.userPersonId, userPeople.id))
    .where(
      and(
        eq(userPersonMentions.itemId, itemId),
        eq(userPersonMentions.itemEnrichmentId, enrichment.id),
        eq(userPersonMentions.isActive, true)
      )
    );

  const dedupedPeople = new Map<string, PersonForResolution>();
  for (const person of peopleRows) {
    if (person.profileImageSource === 'X' && person.xHandle) continue;
    dedupedPeople.set(person.id, person);
  }

  return {
    item,
    people: [...dedupedPeople.values()],
  };
}

async function hasLinkedXProfile(db: Database, userPersonId: string): Promise<boolean> {
  const rows = await db
    .select({ id: personSocialProfiles.id })
    .from(personSocialProfiles)
    .where(
      and(
        eq(personSocialProfiles.userPersonId, userPersonId),
        eq(personSocialProfiles.provider, 'X'),
        eq(personSocialProfiles.status, 'LINKED')
      )
    )
    .limit(1);

  return rows.length > 0;
}

async function upsertCandidate(
  db: Database,
  input: {
    person: PersonForResolution;
    candidate: ScoredXProfileCandidate;
    status: 'CANDIDATE' | 'LINKED';
    evidence: unknown;
    now: number;
  }
) {
  const profileUrl = `https://x.com/${input.candidate.username}`;
  await db
    .insert(personSocialProfiles)
    .values({
      id: ulid(),
      userId: input.person.userId,
      userPersonId: input.person.id,
      provider: 'X',
      providerProfileId: input.candidate.id,
      handle: input.candidate.username,
      displayName: input.candidate.name,
      avatarUrl: input.candidate.profileImageUrl ?? null,
      profileUrl,
      description: input.candidate.description ?? null,
      verified: input.candidate.verified ?? false,
      confidence: input.candidate.confidence,
      status: input.status,
      evidenceJson: JSON.stringify(input.evidence),
      lastCheckedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [
        personSocialProfiles.userPersonId,
        personSocialProfiles.provider,
        personSocialProfiles.providerProfileId,
      ],
      set: {
        handle: input.candidate.username,
        displayName: input.candidate.name,
        avatarUrl: input.candidate.profileImageUrl ?? null,
        profileUrl,
        description: input.candidate.description ?? null,
        verified: input.candidate.verified ?? false,
        confidence: input.candidate.confidence,
        status: input.status,
        evidenceJson: JSON.stringify(input.evidence),
        lastCheckedAt: input.now,
        updatedAt: input.now,
      },
    });

  if (input.status === 'LINKED') {
    const profileImageFields = input.candidate.profileImageUrl
      ? {
          profileImageUrl: input.candidate.profileImageUrl,
          profileImageSource: 'X',
          profileImageSourceUrl: profileUrl,
        }
      : {};

    await db
      .update(userPeople)
      .set({
        ...profileImageFields,
        xHandle: input.candidate.username,
        updatedAt: input.now,
      })
      .where(eq(userPeople.id, input.person.id));
  }
}

export function scoreStoredXProfileCandidate(input: {
  personName: string;
  contextTerms: string[];
  profile: StoredXProfileCandidate;
}): ScoredXProfileCandidate {
  const storedEvidence = parseStoredCandidateEvidence(input.profile.evidenceJson);
  const scored = scoreXProfileCandidate({
    personName: input.personName,
    contextTerms: input.contextTerms,
    candidate: {
      id: input.profile.providerProfileId,
      name: input.profile.displayName,
      username: input.profile.handle,
      description: input.profile.description ?? undefined,
      profileImageUrl: input.profile.avatarUrl ?? undefined,
      url: input.profile.profileUrl,
      verified: input.profile.verified,
    },
  });

  return {
    ...scored,
    ...storedEvidence,
  };
}

function parseStoredCandidateEvidence(
  evidenceJson: string | null
): Pick<
  ScoredXProfileCandidate,
  'inferredHandleConfidence' | 'inferredHandleReason' | 'inferredHandleSource'
> {
  if (!evidenceJson) return {};

  try {
    const parsed = JSON.parse(evidenceJson) as Record<string, unknown>;
    const source = parsed.inferredHandleSource;
    if (source !== 'AI_INFERRED' && source !== 'CONTEXT_EXPLICIT' && source !== 'NAME_DERIVED') {
      return {};
    }

    return {
      inferredHandleSource: source,
      inferredHandleConfidence:
        typeof parsed.inferredHandleConfidence === 'number'
          ? parsed.inferredHandleConfidence
          : undefined,
      inferredHandleReason:
        typeof parsed.inferredHandleReason === 'string' ? parsed.inferredHandleReason : undefined,
    };
  } catch {
    return {};
  }
}

async function loadStoredXProfileCandidates(
  db: Database,
  input: {
    person: PersonForResolution;
    contextTerms: string[];
  }
): Promise<ScoredXProfileCandidate[]> {
  const rows = await db
    .select({
      providerProfileId: personSocialProfiles.providerProfileId,
      handle: personSocialProfiles.handle,
      displayName: personSocialProfiles.displayName,
      avatarUrl: personSocialProfiles.avatarUrl,
      profileUrl: personSocialProfiles.profileUrl,
      description: personSocialProfiles.description,
      verified: personSocialProfiles.verified,
      evidenceJson: personSocialProfiles.evidenceJson,
      lastCheckedAt: personSocialProfiles.lastCheckedAt,
    })
    .from(personSocialProfiles)
    .where(
      and(
        eq(personSocialProfiles.userPersonId, input.person.id),
        eq(personSocialProfiles.provider, 'X'),
        eq(personSocialProfiles.status, 'CANDIDATE')
      )
    );

  return rows
    .filter((profile) => profile.lastCheckedAt > Date.now() - STORED_CANDIDATE_MAX_AGE_MS)
    .map((profile) =>
      scoreStoredXProfileCandidate({
        personName: input.person.displayName,
        contextTerms: input.contextTerms,
        profile,
      })
    )
    .filter((candidate) => candidate.confidence >= STORED_CANDIDATE_REUSE_MIN_CONFIDENCE);
}

async function searchCandidatesForPerson(params: {
  db: Database;
  env: XResolutionEnv;
  tokens: XAccessTokens;
  person: PersonForResolution;
  item: ItemContext;
}): Promise<ScoredXProfileCandidate[]> {
  const contextTerms = extractContextTerms(params.item, params.person);
  const candidatesById = new Map<string, ScoredXProfileCandidate>();

  for (const candidate of await loadStoredXProfileCandidates(params.db, {
    person: params.person,
    contextTerms,
  })) {
    candidatesById.set(candidate.id, candidate);
  }

  if (candidatesById.size > 0) {
    return [...candidatesById.values()].sort((a, b) => b.confidence - a.confidence);
  }

  if (params.tokens.directLookupAccessToken) {
    const explicitHandles = extractExplicitHandleCandidates(params.item, params.person);
    const lookupHandlesByUsername = new Map<string, XHandleLookupCandidate>();
    for (const candidate of explicitHandles) {
      if (!lookupHandlesByUsername.has(candidate.username)) {
        lookupHandlesByUsername.set(candidate.username, candidate);
      }
    }

    for (const inferredHandle of [...lookupHandlesByUsername.values()].slice(
      0,
      MAX_EXPLICIT_HANDLE_LOOKUPS_PER_PERSON
    )) {
      try {
        const user = await lookupXUserByUsername({
          bearerToken: params.tokens.directLookupAccessToken,
          username: inferredHandle.username,
        });
        if (!user) continue;

        const candidate = scoreInferredXProfileCandidate({
          personName: params.person.displayName,
          contextTerms,
          candidate: toXProfileCandidate(user),
          inferredHandle,
        });
        const existing = candidatesById.get(candidate.id);
        if (!existing || candidate.confidence > existing.confidence) {
          candidatesById.set(candidate.id, candidate);
        }
      } catch (error) {
        socialLogger.warn('X inferred user lookup failed during profile resolution', {
          itemId: params.item.itemId,
          userPersonId: params.person.id,
          username: inferredHandle.username,
          error,
        });
      }
    }
  }

  return [...candidatesById.values()]
    .filter((candidate) => candidate.confidence >= CANDIDATE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence);
}

export async function resolveXProfilesForItem(
  db: Database,
  env: XResolutionEnv,
  input: { itemId: string }
): Promise<{ linked: number; candidates: number; skipped: number }> {
  const tokens = await resolveXAccessTokens(db, env);
  if (!tokens.userSearchAccessToken && !tokens.directLookupAccessToken) {
    return { linked: 0, candidates: 0, skipped: 1 };
  }

  const context = await loadResolutionContext(db, input.itemId);
  if (!context || context.people.length === 0) {
    return { linked: 0, candidates: 0, skipped: 1 };
  }

  const totals = { linked: 0, candidates: 0, skipped: 0 };
  for (const person of context.people) {
    try {
      if (await hasLinkedXProfile(db, person.id)) {
        totals.skipped += 1;
        continue;
      }

      const candidates = await searchCandidatesForPerson({
        db,
        env,
        tokens,
        person,
        item: context.item,
      });
      const now = Date.now();
      const bestAutoLinkCandidate =
        candidates.find(
          (candidate) =>
            candidate.confidence >= AUTO_LINK_THRESHOLD &&
            canAutoLinkXProfileCandidate({
              personName: person.displayName,
              candidate,
            })
        ) ?? null;

      for (const candidate of candidates.slice(0, 3)) {
        const status =
          candidate.id === bestAutoLinkCandidate?.id && candidate.confidence >= AUTO_LINK_THRESHOLD
            ? 'LINKED'
            : 'CANDIDATE';
        await upsertCandidate(db, {
          person,
          candidate,
          status,
          evidence: {
            itemId: input.itemId,
            relationship: person.relationship,
            evidenceText: person.evidenceText,
            matchedTerms: candidate.matchedTerms,
            negativeSignals: candidate.negativeSignals,
            inferredHandleConfidence: candidate.inferredHandleConfidence ?? null,
            inferredHandleReason: candidate.inferredHandleReason ?? null,
            inferredHandleSource: candidate.inferredHandleSource ?? null,
          },
          now,
        });
      }

      if (bestAutoLinkCandidate) {
        totals.linked += 1;
      }
      totals.candidates += candidates.length;
    } catch (error) {
      totals.skipped += 1;
      socialLogger.warn('X profile resolution failed for person', {
        itemId: input.itemId,
        userPersonId: person.id,
        error,
      });
    }
  }

  socialLogger.info('X profile resolution completed', {
    itemId: input.itemId,
    people: context.people.length,
    linked: totals.linked,
    candidates: totals.candidates,
    skipped: totals.skipped,
  });

  return totals;
}

export const socialResolutionInternals = {
  buildXSearchQueries,
  buildNameDerivedHandleCandidates,
  canAutoLinkXProfileCandidate,
  extractContextTerms,
  extractExplicitHandleCandidates,
  isAmbiguousPersonNameForSocialResolution,
  normalizeXUsername,
  resolveXAccessTokens,
  scoreStoredXProfileCandidate,
  scoreInferredXProfileCandidate,
  scoreXProfileCandidate,
};
