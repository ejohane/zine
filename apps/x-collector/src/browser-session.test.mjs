import { describe, expect, it } from 'bun:test';
import {
  createCollectionSession,
  finishContextExpansion,
  prepareContextBatch,
  prepareTimelineBatch,
  reserveContextExpansion,
} from './browser-session.mjs';

describe('X browser collection session', () => {
  it('resumes positions and filters accepted posts and ads from a receiver checkpoint', () => {
    const state = createCollectionSession({
      acceptedTweetIds: ['100'],
      acceptedAdKeys: ['ad-1'],
      nextPosition: 1,
    });
    const result = prepareTimelineBatch(
      {
        posts: [
          { tweetId: '100', relationships: [] },
          { tweetId: '200', relationships: [{ type: 'QUOTE_OF', tweetId: '201' }] },
          { tweetId: '201', relationships: [] },
        ],
        items: [
          { tweetId: '100', observedAt: '2026-07-11T12:00:00.000Z' },
          { tweetId: '200', observedAt: '2026-07-11T12:01:00.000Z' },
        ],
        adKeys: ['ad-1', 'ad-2'],
        excludedAds: 2,
      },
      state,
      2
    );

    expect(result).toMatchObject({
      addedItems: 1,
      totalAccepted: 2,
      complete: true,
      payload: {
        items: [{ tweetId: '200', position: 1 }],
        adKeys: ['ad-2'],
        excludedAds: 1,
      },
    });
    expect(result.payload.posts.map((post) => post.tweetId)).toEqual(['200', '201']);

    const repeated = prepareTimelineBatch(
      { posts: [], items: [{ tweetId: '200' }], adKeys: ['ad-2'], excludedAds: 1 },
      state,
      2
    );
    expect(repeated).toMatchObject({
      addedItems: 0,
      totalAccepted: 2,
      payload: { items: [], posts: [], adKeys: [], excludedAds: 0 },
    });
  });

  it('prepares canonical thread context without manufacturing timeline items', () => {
    const state = createCollectionSession({
      acceptedTweetIds: ['100'],
      acceptedPostIds: ['100'],
    });
    const prepared = prepareContextBatch(
      {
        posts: [
          { tweetId: '100', text: 'already captured' },
          { tweetId: '200', text: 'thread parent' },
        ],
      },
      state
    );

    expect(prepared).toMatchObject({
      addedPosts: 1,
      payload: { posts: [{ tweetId: '100' }, { tweetId: '200' }], items: [] },
    });
  });

  it('enforces and resumes a bounded context expansion budget', () => {
    const state = createCollectionSession({
      contextRecords: [{ rootTweetId: '100', status: 'COMPLETE', reason: null }],
    });

    expect(reserveContextExpansion(state, '100', 2)).toMatchObject({
      allowed: false,
      duplicate: true,
    });
    expect(reserveContextExpansion(state, '200', 2)).toMatchObject({ allowed: true });
    expect(finishContextExpansion(state, '200', 'FAILED', 'thread_unavailable')).toEqual({
      rootTweetId: '200',
      status: 'FAILED',
      reason: 'thread_unavailable',
    });
    expect(reserveContextExpansion(state, '300', 2)).toMatchObject({
      allowed: false,
      duplicate: false,
      status: { status: 'TRUNCATED', reason: 'context_budget_reached' },
    });
  });

  it('collects Favorites inside the rolling window and completes only after boundary evidence', () => {
    const state = createCollectionSession({
      collectionPolicy: {
        mode: 'ROLLING_WINDOW',
        windowHours: 24,
        cutoffAt: '2026-07-24T18:00:00.000Z',
        boundaryEvidenceRequired: 3,
      },
    });
    const result = prepareTimelineBatch(
      {
        posts: [
          { tweetId: 'new', publishedAt: '2026-07-25T17:00:00.000Z', relationships: [] },
          { tweetId: 'fresh-repost', publishedAt: '2025-01-01T00:00:00.000Z', relationships: [] },
          { tweetId: 'old-1', publishedAt: '2026-07-24T17:00:00.000Z', relationships: [] },
          { tweetId: 'old-2', publishedAt: '2026-07-24T16:00:00.000Z', relationships: [] },
          { tweetId: 'old-3', publishedAt: '2026-07-24T15:00:00.000Z', relationships: [] },
        ],
        items: [
          { tweetId: 'new' },
          { tweetId: 'fresh-repost', presentation: 'REPOST' },
          { tweetId: 'old-1' },
          { tweetId: 'old-2' },
          { tweetId: 'old-3' },
        ],
        adKeys: [],
      },
      state,
      5_000
    );

    expect(result).toMatchObject({
      addedItems: 2,
      totalAccepted: 2,
      complete: true,
      safetyLimitReached: false,
      windowCoverage: {
        outsideWindow: 3,
        missingPublishedAt: 0,
        boundaryEvidenceRequired: 3,
        boundaryReached: true,
      },
      payload: {
        items: [
          { tweetId: 'new', position: 0 },
          { tweetId: 'fresh-repost', presentation: 'REPOST', position: 1 },
        ],
        windowEvidence: {
          outsideWindowTweetIds: ['old-1', 'old-2', 'old-3'],
          missingTimestampTweetIds: [],
        },
      },
    });
    expect(result.payload.posts.map((post) => post.tweetId)).toEqual(['new', 'fresh-repost']);
  });

  it('does not call a rolling-window run complete when the safety guard is reached', () => {
    const state = createCollectionSession({
      collectionPolicy: {
        mode: 'ROLLING_WINDOW',
        windowHours: 24,
        cutoffAt: '2026-07-24T18:00:00.000Z',
        boundaryEvidenceRequired: 3,
      },
    });
    const result = prepareTimelineBatch(
      {
        posts: [
          { tweetId: '1', publishedAt: '2026-07-25T17:00:00.000Z', relationships: [] },
          { tweetId: '2', publishedAt: '2026-07-25T16:00:00.000Z', relationships: [] },
        ],
        items: [{ tweetId: '1' }, { tweetId: '2' }],
      },
      state,
      2
    );

    expect(result).toMatchObject({ complete: false, safetyLimitReached: true });
  });
});
