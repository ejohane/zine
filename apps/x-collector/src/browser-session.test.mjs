import { describe, expect, it } from 'bun:test';
import { createCollectionSession, prepareTimelineBatch } from './browser-session.mjs';

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
});
