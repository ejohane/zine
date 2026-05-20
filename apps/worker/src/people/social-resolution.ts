import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';

import type { Database } from '../db';
import {
  creators,
  itemEnrichments,
  items,
  personSocialProfiles,
  userPeople,
  userPersonMentions,
} from '../db/schema';
import { logger } from '../lib/logger';
import { lookupXUserByUsername, searchXUsers, type XUser } from '../providers/x';
import type { Bindings } from '../types';
import { DEFAULT_ENRICHMENT_MODEL, ENRICHMENT_SCHEMA_VERSION } from '../enrichment/types';

const socialLogger = logger.child('people-social-resolution');

const AUTO_LINK_THRESHOLD = 0.82;
const CANDIDATE_THRESHOLD = 0.45;
const INFERRED_HANDLE_MIN_CONFIDENCE = 0.68;
const MAX_SEARCH_QUERIES_PER_PERSON = 4;
const MAX_CANDIDATES_PER_QUERY = 5;
const MAX_INFERRED_HANDLES_PER_PERSON = 3;
const MAX_DIRECT_LOOKUP_HANDLES_PER_PERSON = 12;
const ITEM_SUMMARY_CONTEXT_LIMIT = 1200;

type XResolutionEnv = Pick<Bindings, 'X_BEARER_TOKEN' | 'AI' | 'ENRICHMENT_MODEL'>;

type WorkersAIRun = {
  run(model: string, input: unknown): Promise<unknown>;
};

const XHandleInferenceSchema = z.object({
  candidates: z
    .array(
      z.object({
        username: z.string().min(1).max(80),
        confidence: z.number().min(0).max(1),
        reason: z.string().min(1).max(240).nullable().optional(),
      })
    )
    .max(5),
});

type InferredXHandleCandidate = z.infer<typeof XHandleInferenceSchema>['candidates'][number];
type XHandleCandidateSource = 'AI_INFERRED' | 'CONTEXT_EXPLICIT' | 'NAME_DERIVED';
type XHandleLookupCandidate = InferredXHandleCandidate & {
  source: XHandleCandidateSource;
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

function getResponseText(response: unknown): string | null {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return null;

  const record = response as Record<string, unknown>;
  if (typeof record.response === 'string') return record.response;
  if (typeof record.result === 'string') return record.result;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.output_text === 'string') return record.output_text;
  if (Array.isArray(record.choices)) {
    for (const choice of record.choices) {
      if (!choice || typeof choice !== 'object') continue;
      const choiceRecord = choice as Record<string, unknown>;
      if (typeof choiceRecord.text === 'string') return choiceRecord.text;
      if (choiceRecord.message && typeof choiceRecord.message === 'object') {
        const message = choiceRecord.message as Record<string, unknown>;
        if (typeof message.content === 'string') return message.content;
      }
    }
  }

  return null;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function parseHandleInferenceResponse(response: unknown): InferredXHandleCandidate[] {
  const direct = XHandleInferenceSchema.safeParse(response);
  if (direct.success) return direct.data.candidates;

  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    const nestedResponse = XHandleInferenceSchema.safeParse(record.response);
    if (nestedResponse.success) return nestedResponse.data.candidates;

    const nestedResult = XHandleInferenceSchema.safeParse(record.result);
    if (nestedResult.success) return nestedResult.data.candidates;
  }

  const text = getResponseText(response);
  if (!text) return [];

  try {
    const parsed = JSON.parse(stripJsonFence(text)) as unknown;
    const validated = XHandleInferenceSchema.safeParse(parsed);
    return validated.success ? validated.data.candidates : [];
  } catch {
    return [];
  }
}

function parseMetadataText(rawMetadata: string | null): string {
  if (!rawMetadata) return '';
  try {
    return JSON.stringify(JSON.parse(rawMetadata));
  } catch {
    return rawMetadata;
  }
}

function contextText(context: ItemContext, person: Pick<PersonForResolution, 'evidenceText'>) {
  return [
    context.title,
    context.publisher,
    truncate(context.summary, ITEM_SUMMARY_CONTEXT_LIMIT),
    context.creatorName,
    context.creatorDescription,
    context.creatorHandle,
    person.evidenceText,
    parseMetadataText(context.rawMetadata),
  ]
    .filter(Boolean)
    .join(' ');
}

export function extractContextTerms(
  context: ItemContext,
  person: Pick<PersonForResolution, 'displayName' | 'evidenceText'>
) {
  const words = normalizedWords(contextText(context, person));
  const personWords = new Set(normalizedWords(person.displayName));
  const weighted = words.filter((word) => !personWords.has(word));

  return unique(weighted)
    .filter((word) => !/^\d+$/.test(word))
    .slice(0, 16);
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
  const text = contextText(item, person);
  const handles = new Set<string>();
  const handlePattern =
    /(?:https?:\/\/(?:www\.)?(?:x|twitter)\.com\/|(?<![A-Za-z0-9_])@)([A-Za-z0-9_]{1,15})(?=$|[^A-Za-z0-9_])/gi;
  let match: RegExpExecArray | null;

  while ((match = handlePattern.exec(text)) !== null) {
    const username = normalizeXUsername(match[1] ?? '');
    if (username) handles.add(username);
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

async function searchCandidatesForPerson(params: {
  env: XResolutionEnv;
  person: PersonForResolution;
  item: ItemContext;
}): Promise<ScoredXProfileCandidate[]> {
  const queries = buildXSearchQueries(params.person, params.item);
  const contextTerms = extractContextTerms(params.item, params.person);
  const candidatesById = new Map<string, ScoredXProfileCandidate>();

  for (const query of queries) {
    try {
      const users = await searchXUsers({
        bearerToken: params.env.X_BEARER_TOKEN!,
        query,
        maxResults: MAX_CANDIDATES_PER_QUERY,
      });

      for (const user of users) {
        const candidate = scoreXProfileCandidate({
          personName: params.person.displayName,
          contextTerms,
          candidate: toXProfileCandidate(user),
        });
        if (candidate.confidence >= CANDIDATE_THRESHOLD) {
          candidatesById.set(candidate.id, candidate);
        }
      }
    } catch (error) {
      socialLogger.warn('X user search failed during profile resolution', {
        itemId: params.item.itemId,
        userPersonId: params.person.id,
        query,
        error,
      });
    }
  }

  const hasSearchAutoLinkCandidate = [...candidatesById.values()].some(
    (candidate) => candidate.confidence >= AUTO_LINK_THRESHOLD
  );

  if (!hasSearchAutoLinkCandidate) {
    const explicitHandles = extractExplicitHandleCandidates(params.item, params.person);
    const inferredHandles = await inferXHandleCandidates(params.env, params.person, params.item);
    const nameDerivedHandles = buildNameDerivedHandleCandidates(params.person);
    const lookupHandlesByUsername = new Map<string, XHandleLookupCandidate>();
    for (const candidate of [...explicitHandles, ...inferredHandles, ...nameDerivedHandles]) {
      if (!lookupHandlesByUsername.has(candidate.username)) {
        lookupHandlesByUsername.set(candidate.username, candidate);
      }
    }

    for (const inferredHandle of [...lookupHandlesByUsername.values()].slice(
      0,
      MAX_DIRECT_LOOKUP_HANDLES_PER_PERSON
    )) {
      try {
        const user = await lookupXUserByUsername({
          bearerToken: params.env.X_BEARER_TOKEN!,
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

async function inferXHandleCandidates(
  env: XResolutionEnv,
  person: PersonForResolution,
  item: ItemContext
): Promise<XHandleLookupCandidate[]> {
  const ai = env.AI as unknown as WorkersAIRun | undefined;
  if (!ai) return [];

  const prompt = {
    task: 'Suggest likely official X usernames for the named person in this content item.',
    constraints: [
      'Return only JSON with one top-level key: candidates.',
      'Each candidate must include username, confidence, and reason.',
      'Usernames must be X handles without @.',
      'Use public/common-knowledge inference when a well-known handle is strongly associated with the exact person.',
      'Do not guess for common or ambiguous names.',
      'Do not include fan, parody, quote, or topic accounts.',
      'Use confidence below 0.68 unless the handle is very likely to belong to this exact person.',
    ],
    person: {
      name: person.displayName,
      relationship: person.relationship,
      evidenceText: person.evidenceText,
    },
    item: {
      title: item.title,
      provider: item.provider,
      contentType: item.contentType,
      publisher: item.publisher,
      summary: truncate(item.summary, ITEM_SUMMARY_CONTEXT_LIMIT),
      creatorName: item.creatorName,
      creatorHandle: item.creatorHandle,
      creatorDescription: item.creatorDescription,
    },
    outputContract: {
      candidates: [
        {
          username: 'string, X handle without @',
          confidence: 'number from 0 to 1',
          reason: 'short reason or null',
        },
      ],
    },
  };

  try {
    const response = await ai.run(env.ENRICHMENT_MODEL || DEFAULT_ENRICHMENT_MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'You identify official social media handles. Prefer returning no candidates over speculative matches.',
        },
        {
          role: 'user',
          content: JSON.stringify(prompt),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });

    const candidates = parseHandleInferenceResponse(response)
      .map((candidate) => ({
        ...candidate,
        username: normalizeXUsername(candidate.username) ?? '',
        source: 'AI_INFERRED' as const,
      }))
      .filter(
        (candidate) =>
          candidate.username.length > 0 && candidate.confidence >= INFERRED_HANDLE_MIN_CONFIDENCE
      );

    return unique(candidates.map((candidate) => candidate.username))
      .map((username) => candidates.find((candidate) => candidate.username === username)!)
      .slice(0, MAX_INFERRED_HANDLES_PER_PERSON);
  } catch (error) {
    socialLogger.warn('X handle inference failed during profile resolution', {
      itemId: item.itemId,
      userPersonId: person.id,
      error,
    });
    return [];
  }
}

export async function resolveXProfilesForItem(
  db: Database,
  env: XResolutionEnv,
  input: { itemId: string }
): Promise<{ linked: number; candidates: number; skipped: number }> {
  if (!env.X_BEARER_TOKEN) {
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
        env,
        person,
        item: context.item,
      });
      const now = Date.now();
      const best = candidates[0] ?? null;

      for (const candidate of candidates.slice(0, 3)) {
        const status =
          candidate.id === best?.id && candidate.confidence >= AUTO_LINK_THRESHOLD
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

      if (best && best.confidence >= AUTO_LINK_THRESHOLD) {
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
  extractContextTerms,
  extractExplicitHandleCandidates,
  normalizeXUsername,
  scoreInferredXProfileCandidate,
  scoreXProfileCandidate,
};
