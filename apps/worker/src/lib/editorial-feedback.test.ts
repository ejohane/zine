import { describe, expect, it } from 'vitest';

import {
  deriveEditorialFeedbackTargetContext,
  EditorialFeedbackConflictError,
  EditorialFeedbackTargetError,
  getEditorialFeedbackProfile,
  recordEditorialFeedback,
} from './editorial-feedback';

function edition() {
  return {
    id: 'edition-1',
    stories: [
      {
        id: 'story-1',
        rank: 1,
        topics: ['AI Agents', 'Testing loops'],
        sourceIds: ['source-1'],
      },
    ],
    recommendations: [
      {
        id: 'recommendation-1',
        sourceId: 'source-1',
        relatedStoryIds: ['story-1'],
        title: 'A practical guide to agents',
      },
    ],
    sources: [
      {
        id: 'source-1',
        canonicalUrl: 'https://EXAMPLE.com/agents/?utm_source=x#section',
        title: 'Agent systems in practice',
        creator: '@Alice  Example',
      },
    ],
  } as never;
}

function fakeDb() {
  const rows = new Map<
    string,
    {
      id: string;
      payload_hash: string;
      topics: string;
      creators: string;
      canonicalUrls: string;
      sourceIds: string;
      occurredAt: number;
    }
  >();
  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async first() {
          if (!sql.includes('SELECT id, payload_hash')) throw new Error(`Unexpected query: ${sql}`);
          return rows.get(`${bindings[0]}:${bindings[1]}`) ?? null;
        },
        async run() {
          if (!sql.includes('INSERT INTO editorial_feedback_events')) {
            throw new Error(`Unexpected mutation: ${sql}`);
          }
          const [
            id,
            userId,
            clientEventId,
            ,
            ,
            ,
            ,
            topics,
            creators,
            canonicalUrls,
            sourceIds,
            occurredAt,
            payloadHash,
          ] = bindings as string[];
          const key = `${userId}:${clientEventId}`;
          if (rows.has(key)) throw new Error('UNIQUE constraint failed');
          rows.set(key, {
            id,
            payload_hash: payloadHash,
            topics,
            creators,
            canonicalUrls,
            sourceIds,
            occurredAt: Number(occurredAt),
          });
          return { success: true };
        },
      };
    },
  } as unknown as D1Database;
  return { db, rows };
}

const feedback = {
  clientEventId: 'client-event-1',
  editionId: 'edition-1',
  targetType: 'STORY',
  targetId: 'story-1',
  eventType: 'MORE_LIKE_THIS',
  occurredAt: '2026-07-18T12:00:00.000Z',
} as const;

describe('recordEditorialFeedback', () => {
  it('creates once and returns the same event for an idempotent retry', async () => {
    const { db, rows } = fakeDb();
    const serverNow = Date.parse('2026-07-19T12:00:00.000Z');
    const first = await recordEditorialFeedback(db, 'user-1', edition(), feedback, serverNow);
    const retry = await recordEditorialFeedback(
      db,
      'user-1',
      edition(),
      feedback,
      serverNow + 1_000
    );

    expect(first).toMatchObject({ accepted: true, duplicate: false });
    expect(retry).toEqual({ accepted: true, duplicate: true, eventId: first.eventId });
    expect(rows.size).toBe(1);
    expect([...rows.values()][0]).toMatchObject({
      topics: JSON.stringify(['agent', 'ai', 'loop', 'testing']),
      creators: JSON.stringify(['alice example']),
      canonicalUrls: JSON.stringify(['https://example.com/agents']),
      sourceIds: JSON.stringify(['source-1']),
      occurredAt: Date.parse(feedback.occurredAt),
    });
  });

  it('rejects reusing a client event ID for different feedback', async () => {
    const { db } = fakeDb();
    await recordEditorialFeedback(db, 'user-1', edition(), feedback, 1000);

    await expect(
      recordEditorialFeedback(
        db,
        'user-1',
        edition(),
        { ...feedback, eventType: 'LESS_LIKE_THIS' },
        2000
      )
    ).rejects.toBeInstanceOf(EditorialFeedbackConflictError);
  });

  it('rejects a target that does not belong to the edition', async () => {
    const { db, rows } = fakeDb();
    await expect(
      recordEditorialFeedback(db, 'user-1', edition(), { ...feedback, targetId: 'story-other' })
    ).rejects.toBeInstanceOf(EditorialFeedbackTargetError);
    expect(rows.size).toBe(0);
  });

  it('clamps a future offline timestamp to the server clock', async () => {
    const { db, rows } = fakeDb();
    await recordEditorialFeedback(
      db,
      'user-1',
      edition(),
      {
        ...feedback,
        clientEventId: 'future-event',
        occurredAt: '2099-01-01T00:00:00.000Z',
      },
      1_000
    );

    expect([...rows.values()][0]?.occurredAt).toBe(1_000);
  });

  it('derives recommendation context from its source and related story', () => {
    const context = deriveEditorialFeedbackTargetContext(edition(), {
      ...feedback,
      targetType: 'RECOMMENDATION',
      targetId: 'recommendation-1',
    });

    expect(context).toEqual({
      topics: ['agent', 'ai', 'loop', 'testing'],
      creators: ['alice example'],
      canonicalUrls: ['https://example.com/agents'],
      sourceIds: ['source-1'],
    });
  });
});

describe('getEditorialFeedbackProfile', () => {
  it('aggregates only bounded explicit signals with decay and separate novelty', async () => {
    const now = Date.parse('2026-07-19T12:00:00.000Z');
    const day = 24 * 60 * 60 * 1_000;
    const results = [
      {
        event_type: 'MORE_LIKE_THIS',
        target_topics_json: JSON.stringify(['AI Agents']),
        target_creators_json: JSON.stringify(['Alice Example']),
        target_canonical_urls_json: JSON.stringify(['https://example.com/agents?utm_source=x']),
        target_source_ids_json: JSON.stringify(['source-1']),
        occurred_at: now,
      },
      {
        event_type: 'LESS_LIKE_THIS',
        target_topics_json: JSON.stringify(['agent']),
        target_creators_json: '[]',
        target_canonical_urls_json: '[]',
        target_source_ids_json: '[]',
        occurred_at: now - 60 * day,
      },
      {
        event_type: 'ALREADY_KNEW',
        target_topics_json: JSON.stringify(['agent']),
        target_creators_json: '[]',
        target_canonical_urls_json: JSON.stringify(['https://example.com/agents']),
        target_source_ids_json: '[]',
        occurred_at: now,
      },
    ];
    const db = {
      prepare(sql: string) {
        expect(sql).toContain("event_type IN ('MORE_LIKE_THIS', 'LESS_LIKE_THIS'");
        return {
          bind(userId: string, cutoff: number, limit: number) {
            expect(userId).toBe('user-1');
            expect(cutoff).toBe(now - 180 * day);
            expect(limit).toBe(501);
            return this;
          },
          async all() {
            return { results };
          },
        };
      },
    } as unknown as D1Database;

    const profile = await getEditorialFeedbackProfile(db, 'user-1', now);

    expect(profile.eventCount).toBe(3);
    expect(profile.truncated).toBe(false);
    expect(profile.topics.find((value) => value.key === 'agent')).toMatchObject({
      affinity: 0.5,
      novelty: -1,
      signalCounts: {
        moreLikeThis: 1,
        lessLikeThis: 1,
        dismissed: 0,
        alreadyKnew: 1,
      },
    });
    expect(profile.creators).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'alice example', affinity: 1 })])
    );
    expect(profile.canonicalUrls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'https://example.com/agents', affinity: 1, novelty: -1 }),
      ])
    );
    expect(profile.sourceIds).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'source-1', affinity: 1 })])
    );
  });

  it('caps aggregate strength and explicit event count', async () => {
    const now = Date.parse('2026-07-19T12:00:00.000Z');
    const results = Array.from({ length: 501 }, (_, index) => ({
      event_type: 'MORE_LIKE_THIS',
      target_topics_json: JSON.stringify(['agents']),
      target_creators_json: '[]',
      target_canonical_urls_json: '[]',
      target_source_ids_json: '[]',
      occurred_at: now - index,
    }));
    const db = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async all() {
            return { results };
          },
        };
      },
    } as unknown as D1Database;

    const profile = await getEditorialFeedbackProfile(db, 'user-1', now);

    expect(profile.eventCount).toBe(500);
    expect(profile.truncated).toBe(true);
    expect(profile.topics[0]?.affinity).toBe(3);
    expect(profile.topics[0]?.signalCounts.moreLikeThis).toBe(500);
  });
});
