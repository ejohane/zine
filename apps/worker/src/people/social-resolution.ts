import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

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
import { searchXUsers, type XUser } from '../providers/x';
import type { Bindings } from '../types';
import { ENRICHMENT_SCHEMA_VERSION } from '../enrichment/types';

const socialLogger = logger.child('people-social-resolution');

const AUTO_LINK_THRESHOLD = 0.82;
const CANDIDATE_THRESHOLD = 0.45;
const MAX_SEARCH_QUERIES_PER_PERSON = 4;
const MAX_CANDIDATES_PER_QUERY = 5;

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

  if (input.status === 'LINKED' && input.candidate.profileImageUrl) {
    await db
      .update(userPeople)
      .set({
        profileImageUrl: input.candidate.profileImageUrl,
        profileImageSource: 'X',
        profileImageSourceUrl: profileUrl,
        xHandle: input.candidate.username,
        updatedAt: input.now,
      })
      .where(eq(userPeople.id, input.person.id));
  }
}

async function searchCandidatesForPerson(params: {
  bearerToken: string;
  person: PersonForResolution;
  item: ItemContext;
}): Promise<ScoredXProfileCandidate[]> {
  const queries = buildXSearchQueries(params.person, params.item);
  const contextTerms = extractContextTerms(params.item, params.person);
  const usersById = new Map<string, XProfileCandidate>();

  for (const query of queries) {
    const users = await searchXUsers({
      bearerToken: params.bearerToken,
      query,
      maxResults: MAX_CANDIDATES_PER_QUERY,
    });

    for (const user of users) {
      usersById.set(user.id, toXProfileCandidate(user));
    }
  }

  return [...usersById.values()]
    .map((candidate) =>
      scoreXProfileCandidate({
        personName: params.person.displayName,
        contextTerms,
        candidate,
      })
    )
    .filter((candidate) => candidate.confidence >= CANDIDATE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence);
}

export async function resolveXProfilesForItem(
  db: Database,
  env: Pick<Bindings, 'X_BEARER_TOKEN'>,
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
        bearerToken: env.X_BEARER_TOKEN,
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

  return totals;
}

export const socialResolutionInternals = {
  buildXSearchQueries,
  extractContextTerms,
  scoreXProfileCandidate,
};
