import {
  CreateEditorialFeedbackSchema,
  EditorialFeedbackProfileSchema,
  normalizeEditorialFeedbackCanonicalUrl,
  normalizeEditorialFeedbackCreatorKey,
  normalizeEditorialFeedbackTopicTokens,
  type CreateEditorialFeedback,
  type DailyEdition,
  type EditorialFeedbackProfile,
} from '@zine/editorial-schema';
import { ulid } from 'ulid';

type FeedbackRow = {
  id: string;
  payload_hash: string;
};

type FeedbackProfileRow = {
  event_type: 'MORE_LIKE_THIS' | 'LESS_LIKE_THIS' | 'DISMISSED' | 'ALREADY_KNEW';
  target_topics_json: string;
  target_creators_json: string;
  target_canonical_urls_json: string;
  target_source_ids_json: string;
  occurred_at: number;
};

type FeedbackTargetContext = {
  topics: string[];
  creators: string[];
  canonicalUrls: string[];
  sourceIds: string[];
};

type MutablePreference = {
  key: string;
  affinity: number;
  novelty: number;
  signalCounts: {
    moreLikeThis: number;
    lessLikeThis: number;
    dismissed: number;
    alreadyKnew: number;
  };
  lastSignaledAt: number;
};

export const EDITORIAL_FEEDBACK_LOOKBACK_DAYS = 180;
export const EDITORIAL_FEEDBACK_HALF_LIFE_DAYS = 60;
export const EDITORIAL_FEEDBACK_MAX_EVENTS = 500;

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_CONTEXT_TOPICS = 30;
const MAX_CONTEXT_CREATORS = 20;
const MAX_CONTEXT_URLS = 30;
const MAX_CONTEXT_SOURCE_IDS = 100;

export class EditorialFeedbackConflictError extends Error {}
export class EditorialFeedbackTargetError extends Error {}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateTarget(edition: DailyEdition, feedback: CreateEditorialFeedback): void {
  const exists =
    feedback.targetType === 'EDITION'
      ? feedback.targetId === edition.id
      : feedback.targetType === 'STORY'
        ? edition.stories.some((story) => story.id === feedback.targetId)
        : feedback.targetType === 'RECOMMENDATION'
          ? edition.recommendations.some(
              (recommendation) => recommendation.id === feedback.targetId
            )
          : edition.sources.some((source) => source.id === feedback.targetId);
  if (!exists) {
    throw new EditorialFeedbackTargetError(
      `${feedback.targetType.toLocaleLowerCase()} target does not belong to this edition`
    );
  }
}

function cappedSorted(values: Iterable<string>, max: number): string[] {
  return [...new Set(values)].sort().slice(0, max);
}

export function deriveEditorialFeedbackTargetContext(
  edition: DailyEdition,
  feedback: CreateEditorialFeedback
): FeedbackTargetContext {
  const selectedStoryIds = new Set<string>();
  const selectedSourceIds = new Set<string>();
  const fallbackTopicInputs: string[] = [];

  if (feedback.targetType === 'EDITION') {
    for (const story of edition.stories) selectedStoryIds.add(story.id);
    for (const source of edition.sources) selectedSourceIds.add(source.id);
  } else if (feedback.targetType === 'STORY') {
    selectedStoryIds.add(feedback.targetId);
  } else if (feedback.targetType === 'RECOMMENDATION') {
    const recommendation = edition.recommendations.find((item) => item.id === feedback.targetId);
    if (recommendation) {
      selectedSourceIds.add(recommendation.sourceId);
      recommendation.relatedStoryIds.forEach((id) => selectedStoryIds.add(id));
      fallbackTopicInputs.push(recommendation.title);
    }
  } else {
    selectedSourceIds.add(feedback.targetId);
    for (const story of edition.stories) {
      if (story.sourceIds.includes(feedback.targetId)) selectedStoryIds.add(story.id);
    }
    for (const recommendation of edition.recommendations) {
      if (recommendation.sourceId !== feedback.targetId) continue;
      recommendation.relatedStoryIds.forEach((id) => selectedStoryIds.add(id));
      fallbackTopicInputs.push(recommendation.title);
    }
  }

  const selectedStories = edition.stories.filter((story) => selectedStoryIds.has(story.id));
  const topicInputs = selectedStories.flatMap((story) => story.topics);
  for (const story of selectedStories) {
    story.sourceIds.forEach((id) => selectedSourceIds.add(id));
  }

  const sources = edition.sources.filter((source) => selectedSourceIds.has(source.id));
  if (topicInputs.length === 0) {
    fallbackTopicInputs.push(...sources.map((source) => source.title ?? '').filter(Boolean));
  }

  const topics = normalizeEditorialFeedbackTopicTokens(
    topicInputs.length > 0 ? topicInputs : fallbackTopicInputs
  ).slice(0, MAX_CONTEXT_TOPICS);
  const creators = cappedSorted(
    sources
      .map((source) =>
        source.creator ? normalizeEditorialFeedbackCreatorKey(source.creator) : null
      )
      .filter((value): value is string => Boolean(value)),
    MAX_CONTEXT_CREATORS
  );
  const canonicalUrls = cappedSorted(
    sources
      .map((source) => normalizeEditorialFeedbackCanonicalUrl(source.canonicalUrl))
      .filter((value): value is string => Boolean(value)),
    MAX_CONTEXT_URLS
  );

  return {
    topics,
    creators,
    canonicalUrls,
    sourceIds: cappedSorted(selectedSourceIds, MAX_CONTEXT_SOURCE_IDS),
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

function addPreference(
  preferences: Map<string, MutablePreference>,
  key: string,
  row: FeedbackProfileRow,
  decay: number
): void {
  const preference = preferences.get(key) ?? {
    key,
    affinity: 0,
    novelty: 0,
    signalCounts: { moreLikeThis: 0, lessLikeThis: 0, dismissed: 0, alreadyKnew: 0 },
    lastSignaledAt: 0,
  };
  if (row.event_type === 'MORE_LIKE_THIS') {
    preference.affinity += decay;
    preference.signalCounts.moreLikeThis++;
  } else if (row.event_type === 'LESS_LIKE_THIS') {
    preference.affinity -= decay;
    preference.signalCounts.lessLikeThis++;
  } else if (row.event_type === 'DISMISSED') {
    preference.affinity -= 0.75 * decay;
    preference.signalCounts.dismissed++;
  } else {
    preference.novelty -= decay;
    preference.signalCounts.alreadyKnew++;
  }
  preference.lastSignaledAt = Math.max(preference.lastSignaledAt, row.occurred_at);
  preferences.set(key, preference);
}

function preferenceList(
  values: Map<string, MutablePreference>,
  max: number
): EditorialFeedbackProfile['topics'] {
  const clamp = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, Math.round(value * 1_000) / 1_000));
  return [...values.values()]
    .map((value) => ({
      key: value.key,
      affinity: clamp(value.affinity, -3, 3),
      novelty: clamp(value.novelty, -3, 0),
      signalCounts: value.signalCounts,
      lastSignaledAt: new Date(value.lastSignaledAt).toISOString(),
    }))
    .sort(
      (left, right) =>
        Math.max(Math.abs(right.affinity), Math.abs(right.novelty)) -
          Math.max(Math.abs(left.affinity), Math.abs(left.novelty)) ||
        Date.parse(right.lastSignaledAt) - Date.parse(left.lastSignaledAt) ||
        left.key.localeCompare(right.key)
    )
    .slice(0, max);
}

export async function getEditorialFeedbackProfile(
  db: D1Database,
  userId: string,
  now = Date.now()
): Promise<EditorialFeedbackProfile> {
  const cutoff = now - EDITORIAL_FEEDBACK_LOOKBACK_DAYS * DAY_MS;
  const result = await db
    .prepare(
      `SELECT event_type, target_topics_json, target_creators_json,
              target_canonical_urls_json, target_source_ids_json, occurred_at
       FROM editorial_feedback_events
       WHERE user_id = ? AND occurred_at >= ?
         AND event_type IN ('MORE_LIKE_THIS', 'LESS_LIKE_THIS', 'DISMISSED', 'ALREADY_KNEW')
       ORDER BY occurred_at DESC, id DESC
       LIMIT ?`
    )
    .bind(userId, cutoff, EDITORIAL_FEEDBACK_MAX_EVENTS + 1)
    .all<FeedbackProfileRow>();
  const rows = (result.results ?? []).slice(0, EDITORIAL_FEEDBACK_MAX_EVENTS);
  const topics = new Map<string, MutablePreference>();
  const creators = new Map<string, MutablePreference>();
  const canonicalUrls = new Map<string, MutablePreference>();
  const sourceIds = new Map<string, MutablePreference>();

  for (const row of rows) {
    const age = Math.max(0, now - row.occurred_at);
    const decay = 0.5 ** (age / (EDITORIAL_FEEDBACK_HALF_LIFE_DAYS * DAY_MS));
    const dimensions: Array<[Map<string, MutablePreference>, string[]]> = [
      [topics, normalizeEditorialFeedbackTopicTokens(parseStringArray(row.target_topics_json))],
      [
        creators,
        parseStringArray(row.target_creators_json)
          .map(normalizeEditorialFeedbackCreatorKey)
          .filter((value): value is string => Boolean(value)),
      ],
      [
        canonicalUrls,
        parseStringArray(row.target_canonical_urls_json)
          .map(normalizeEditorialFeedbackCanonicalUrl)
          .filter((value): value is string => Boolean(value)),
      ],
      [sourceIds, parseStringArray(row.target_source_ids_json)],
    ];
    for (const [map, keys] of dimensions) {
      for (const key of new Set(keys)) addPreference(map, key, row, decay);
    }
  }

  return EditorialFeedbackProfileSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    lookbackDays: EDITORIAL_FEEDBACK_LOOKBACK_DAYS,
    halfLifeDays: EDITORIAL_FEEDBACK_HALF_LIFE_DAYS,
    maxEvents: EDITORIAL_FEEDBACK_MAX_EVENTS,
    eventCount: rows.length,
    truncated: (result.results?.length ?? 0) > EDITORIAL_FEEDBACK_MAX_EVENTS,
    topics: preferenceList(topics, 200),
    creators: preferenceList(creators, 100),
    canonicalUrls: preferenceList(canonicalUrls, 200),
    sourceIds: preferenceList(sourceIds, 200),
  });
}

export async function recordEditorialFeedback(
  db: D1Database,
  userId: string,
  edition: DailyEdition,
  rawInput: unknown,
  now = Date.now()
) {
  const feedback = CreateEditorialFeedbackSchema.parse(rawInput);
  if (feedback.editionId !== edition.id) {
    throw new EditorialFeedbackTargetError('Feedback edition does not match the loaded edition');
  }
  validateTarget(edition, feedback);
  const targetContext = deriveEditorialFeedbackTargetContext(edition, feedback);

  const payloadHash = await sha256(
    JSON.stringify({
      clientEventId: feedback.clientEventId,
      editionId: feedback.editionId,
      targetType: feedback.targetType,
      targetId: feedback.targetId,
      eventType: feedback.eventType,
      occurredAt: feedback.occurredAt ?? null,
    })
  );
  const existing = await db
    .prepare(
      `SELECT id, payload_hash FROM editorial_feedback_events
       WHERE user_id = ? AND client_event_id = ?`
    )
    .bind(userId, feedback.clientEventId)
    .first<FeedbackRow>();
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new EditorialFeedbackConflictError('clientEventId already contains different feedback');
    }
    return { accepted: true as const, duplicate: true, eventId: existing.id };
  }

  const eventId = ulid(now);
  const occurredAt = feedback.occurredAt ? Math.min(Date.parse(feedback.occurredAt), now) : now;
  try {
    await db
      .prepare(
        `INSERT INTO editorial_feedback_events
         (id, user_id, client_event_id, edition_id, target_type, target_id, event_type,
          target_topics_json, target_creators_json, target_canonical_urls_json,
          target_source_ids_json, occurred_at, payload_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        eventId,
        userId,
        feedback.clientEventId,
        feedback.editionId,
        feedback.targetType,
        feedback.targetId,
        feedback.eventType,
        JSON.stringify(targetContext.topics),
        JSON.stringify(targetContext.creators),
        JSON.stringify(targetContext.canonicalUrls),
        JSON.stringify(targetContext.sourceIds),
        occurredAt,
        payloadHash,
        now
      )
      .run();
  } catch (error) {
    const raced = await db
      .prepare(
        `SELECT id, payload_hash FROM editorial_feedback_events
         WHERE user_id = ? AND client_event_id = ?`
      )
      .bind(userId, feedback.clientEventId)
      .first<FeedbackRow>();
    if (!raced) throw error;
    if (raced.payload_hash !== payloadHash) {
      throw new EditorialFeedbackConflictError('clientEventId already contains different feedback');
    }
    return { accepted: true as const, duplicate: true, eventId: raced.id };
  }

  return { accepted: true as const, duplicate: false, eventId };
}
