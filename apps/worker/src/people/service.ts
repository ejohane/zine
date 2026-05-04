import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { UserItemState } from '@zine/shared';

import type { Database } from '../db';
import { itemEnrichments, userItems, userPeople, userPersonMentions } from '../db/schema';
import { logger } from '../lib/logger';
import { ENRICHMENT_SCHEMA_VERSION } from '../enrichment/types';

const peopleLogger = logger.child('people-service');

export const PERSON_CONFIDENCE_THRESHOLD = 0.65;

type UserItemPersonSource = {
  id: string;
  userId: string;
  itemId: string;
  state: string;
  ingestedAt: string;
  bookmarkedAt: string | null;
};

type CompleteEnrichment = typeof itemEnrichments.$inferSelect;

export type PersonIndexStats = {
  indexed: number;
  deactivated: number;
  skipped: number;
};

type PersonEntityCandidate = {
  rawName: string;
  rawType: string;
  displayName: string;
  normalizedName: string;
  confidence: number;
};

function toFiniteConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeEntityType(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ');
}

export function normalizePersonName(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'`.,;:!?()[\]{}<>]+/, '')
    .replace(/[\s"'`.,;:!?()[\]{}<>]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeDisplayName(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'`.,;:!?()[\]{}<>]+/, '')
    .replace(/[\s"'`.,;:!?()[\]{}<>]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPersonEntities(entitiesJson: string | null): PersonEntityCandidate[] {
  if (!entitiesJson) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(entitiesJson);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const deduped = new Map<string, PersonEntityCandidate>();

  for (const entity of parsed) {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) continue;

    const candidate = entity as { name?: unknown; type?: unknown; confidence?: unknown };
    if (typeof candidate.name !== 'string' || typeof candidate.type !== 'string') continue;

    const confidence = toFiniteConfidence(candidate.confidence);
    if (confidence === null || confidence < PERSON_CONFIDENCE_THRESHOLD) continue;

    if (normalizeEntityType(candidate.type) !== 'person') continue;

    const displayName = normalizeDisplayName(candidate.name);
    const normalizedName = normalizePersonName(candidate.name);
    if (!displayName || !normalizedName) continue;

    const next: PersonEntityCandidate = {
      rawName: candidate.name,
      rawType: candidate.type,
      displayName,
      normalizedName,
      confidence,
    };
    const existing = deduped.get(normalizedName);
    if (!existing || next.confidence > existing.confidence) {
      deduped.set(normalizedName, next);
    }
  }

  return [...deduped.values()];
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSeenAt(userItem: Pick<UserItemPersonSource, 'bookmarkedAt' | 'ingestedAt'>): number {
  return parseIsoMs(userItem.bookmarkedAt) ?? parseIsoMs(userItem.ingestedAt) ?? Date.now();
}

async function loadLatestCompleteEnrichment(
  db: Database,
  itemId: string
): Promise<CompleteEnrichment | null> {
  const rows = await db
    .select()
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

  return rows[0] ?? null;
}

async function upsertUserPerson(
  db: Database,
  input: {
    userId: string;
    displayName: string;
    normalizedName: string;
    now: number;
  }
): Promise<string> {
  const existing = await db
    .select({ id: userPeople.id })
    .from(userPeople)
    .where(
      and(eq(userPeople.userId, input.userId), eq(userPeople.normalizedName, input.normalizedName))
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const id = ulid();
  await db.insert(userPeople).values({
    id,
    userId: input.userId,
    displayName: input.displayName,
    normalizedName: input.normalizedName,
    itemCount: 0,
    latestSeenAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  });

  return id;
}

async function recomputePeopleStats(db: Database, personIds: Iterable<string>): Promise<void> {
  const uniqueIds = [...new Set(personIds)].filter(Boolean);

  for (const personId of uniqueIds) {
    const rows = await db
      .select({
        itemCount: sql<number>`count(*)`,
        latestSeenAt: sql<number | null>`max(${userPersonMentions.seenAt})`,
      })
      .from(userPersonMentions)
      .where(
        and(eq(userPersonMentions.userPersonId, personId), eq(userPersonMentions.isActive, true))
      )
      .limit(1);

    const row = rows[0];
    const itemCount = Number(row?.itemCount ?? 0);
    const latestSeenAt =
      row?.latestSeenAt === null || row?.latestSeenAt === undefined
        ? null
        : Number(row.latestSeenAt);

    await db
      .update(userPeople)
      .set({
        itemCount,
        latestSeenAt: Number.isFinite(latestSeenAt) ? latestSeenAt : null,
        updatedAt: Date.now(),
      })
      .where(eq(userPeople.id, personId));
  }
}

async function syncPeopleForBookmarkedUserItem(
  db: Database,
  userItem: UserItemPersonSource,
  enrichment: CompleteEnrichment
): Promise<PersonIndexStats> {
  const now = Date.now();
  const seenAt = getSeenAt(userItem);
  const people = extractPersonEntities(enrichment.entitiesJson);
  const activeBefore = await db
    .select({ userPersonId: userPersonMentions.userPersonId })
    .from(userPersonMentions)
    .where(
      and(
        eq(userPersonMentions.userId, userItem.userId),
        eq(userPersonMentions.userItemId, userItem.id),
        eq(userPersonMentions.isActive, true)
      )
    );

  const activeBeforeIds = new Set(activeBefore.map((row) => row.userPersonId));
  const desiredPersonIds = new Set<string>();
  const affectedPersonIds = new Set(activeBeforeIds);

  for (const person of people) {
    const userPersonId = await upsertUserPerson(db, {
      userId: userItem.userId,
      displayName: person.displayName,
      normalizedName: person.normalizedName,
      now,
    });

    desiredPersonIds.add(userPersonId);
    affectedPersonIds.add(userPersonId);

    await db
      .insert(userPersonMentions)
      .values({
        id: ulid(),
        userId: userItem.userId,
        userPersonId,
        userItemId: userItem.id,
        itemId: userItem.itemId,
        itemEnrichmentId: enrichment.id,
        rawName: person.rawName,
        rawType: person.rawType,
        relationship: 'MENTIONED',
        confidence: person.confidence,
        evidenceText: null,
        seenAt,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userPersonMentions.userId,
          userPersonMentions.userItemId,
          userPersonMentions.userPersonId,
        ],
        set: {
          itemId: userItem.itemId,
          itemEnrichmentId: enrichment.id,
          rawName: person.rawName,
          rawType: person.rawType,
          relationship: 'MENTIONED',
          confidence: person.confidence,
          seenAt,
          isActive: true,
          updatedAt: now,
        },
      });
  }

  const stalePersonIds = [...activeBeforeIds].filter((personId) => !desiredPersonIds.has(personId));
  if (stalePersonIds.length > 0) {
    await db
      .update(userPersonMentions)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(userPersonMentions.userId, userItem.userId),
          eq(userPersonMentions.userItemId, userItem.id),
          inArray(userPersonMentions.userPersonId, stalePersonIds)
        )
      );
  }

  await recomputePeopleStats(db, affectedPersonIds);

  return {
    indexed: desiredPersonIds.size,
    deactivated: stalePersonIds.length,
    skipped: people.length === 0 ? 1 : 0,
  };
}

export async function deactivatePeopleForUserItem(
  db: Database,
  input: { userId: string; userItemId: string }
): Promise<PersonIndexStats> {
  const activeMentions = await db
    .select({ userPersonId: userPersonMentions.userPersonId })
    .from(userPersonMentions)
    .where(
      and(
        eq(userPersonMentions.userId, input.userId),
        eq(userPersonMentions.userItemId, input.userItemId),
        eq(userPersonMentions.isActive, true)
      )
    );

  if (activeMentions.length === 0) {
    return { indexed: 0, deactivated: 0, skipped: 1 };
  }

  await db
    .update(userPersonMentions)
    .set({ isActive: false, updatedAt: Date.now() })
    .where(
      and(
        eq(userPersonMentions.userId, input.userId),
        eq(userPersonMentions.userItemId, input.userItemId),
        eq(userPersonMentions.isActive, true)
      )
    );

  await recomputePeopleStats(
    db,
    activeMentions.map((row) => row.userPersonId)
  );

  return { indexed: 0, deactivated: activeMentions.length, skipped: 0 };
}

export async function syncPeopleForUserItem(
  db: Database,
  input: { userId: string; userItemId: string }
): Promise<PersonIndexStats> {
  const rows = await db
    .select({
      id: userItems.id,
      userId: userItems.userId,
      itemId: userItems.itemId,
      state: userItems.state,
      ingestedAt: userItems.ingestedAt,
      bookmarkedAt: userItems.bookmarkedAt,
    })
    .from(userItems)
    .where(and(eq(userItems.id, input.userItemId), eq(userItems.userId, input.userId)))
    .limit(1);

  const userItem = rows[0];
  if (!userItem) return { indexed: 0, deactivated: 0, skipped: 1 };

  if (userItem.state !== UserItemState.BOOKMARKED) {
    return deactivatePeopleForUserItem(db, input);
  }

  const enrichment = await loadLatestCompleteEnrichment(db, userItem.itemId);
  if (!enrichment) return { indexed: 0, deactivated: 0, skipped: 1 };

  return syncPeopleForBookmarkedUserItem(db, userItem, enrichment);
}

export async function syncPeopleForItem(
  db: Database,
  input: { itemId: string }
): Promise<PersonIndexStats> {
  const enrichment = await loadLatestCompleteEnrichment(db, input.itemId);
  if (!enrichment) return { indexed: 0, deactivated: 0, skipped: 1 };

  const rows = await db
    .select({
      id: userItems.id,
      userId: userItems.userId,
      itemId: userItems.itemId,
      state: userItems.state,
      ingestedAt: userItems.ingestedAt,
      bookmarkedAt: userItems.bookmarkedAt,
    })
    .from(userItems)
    .where(and(eq(userItems.itemId, input.itemId), eq(userItems.state, UserItemState.BOOKMARKED)));

  const totals: PersonIndexStats = { indexed: 0, deactivated: 0, skipped: 0 };
  for (const userItem of rows) {
    const result = await syncPeopleForBookmarkedUserItem(db, userItem, enrichment);
    totals.indexed += result.indexed;
    totals.deactivated += result.deactivated;
    totals.skipped += result.skipped;
  }

  return totals;
}

export async function syncPeopleForUserItemBestEffort(
  db: Database,
  input: { userId: string; userItemId: string; operation: string }
): Promise<void> {
  try {
    await syncPeopleForUserItem(db, input);
  } catch (error) {
    peopleLogger.warn('People indexing failed', {
      operation: input.operation,
      userId: input.userId,
      userItemId: input.userItemId,
      error,
    });
  }
}

export async function deactivatePeopleForUserItemBestEffort(
  db: Database,
  input: { userId: string; userItemId: string; operation: string }
): Promise<void> {
  try {
    await deactivatePeopleForUserItem(db, input);
  } catch (error) {
    peopleLogger.warn('People deactivation failed', {
      operation: input.operation,
      userId: input.userId,
      userItemId: input.userItemId,
      error,
    });
  }
}

export const peopleServiceInternals = {
  extractPersonEntities,
  normalizePersonName,
  recomputePeopleStats,
};
