import { describe, expect, it } from 'bun:test';
import {
  classifyXGraphQLResponse,
  extractTimelineGraphQLResponse,
  extractTweetDetailGraphQLResponse,
} from './network-extractor.mjs';

const observedAt = '2026-07-25T20:00:00.000Z';

function tweet(id, username, options = {}) {
  return {
    __typename: 'Tweet',
    rest_id: id,
    core: {
      user_results: {
        result: {
          rest_id: `user-${username}`,
          is_blue_verified: false,
          legacy: {
            screen_name: username,
            name: username,
            profile_image_url_https: `https://img.example/${username}.jpg`,
          },
        },
      },
    },
    legacy: {
      full_text: options.text || `${username}-${id}`,
      created_at: 'Sat Jul 25 18:00:00 +0000 2026',
      conversation_id_str: options.conversationId || id,
      in_reply_to_status_id_str: options.parentId || null,
      quoted_status_id_str: options.quoted?.rest_id || null,
      entities: {
        urls: options.url
          ? [{ url: 'https://t.co/x', expanded_url: options.url, display_url: 'example.com' }]
          : [],
      },
      reply_count: 1,
      retweet_count: 2,
      favorite_count: 3,
      bookmark_count: 4,
      lang: 'en',
    },
    quoted_status_result: options.quoted ? { result: options.quoted } : undefined,
    views: { count: '5' },
  };
}

function modernUserTweet(id, username) {
  const value = tweet(id, username);
  value.core.user_results.result = {
    rest_id: `user-${username}`,
    is_blue_verified: true,
    core: { screen_name: username, name: `Modern ${username}` },
    avatar: { image_url: `https://img.example/modern-${username}.jpg` },
    verification: { verified: true },
  };
  return value;
}

function item(value) {
  return { item: { itemContent: { tweet_results: { result: value } } } };
}

function timelinePayload(entries) {
  return {
    data: { timeline: { timeline: { instructions: [{ type: 'TimelineAddEntries', entries }] } } },
  };
}

describe('network response extraction', () => {
  it('reads the current split X user shape without degrading authors to unknown', () => {
    const primary = modernUserTweet('modern-1', 'currentshape');
    const payload = timelinePayload([
      {
        entryId: 'tweet-modern-1',
        content: { itemContent: { tweet_results: { result: primary } } },
      },
    ]);

    const batch = extractTimelineGraphQLResponse(payload, { observedAt, sourceType: 'FAVORITES' });

    expect(batch.posts[0].author).toEqual({
      id: 'user-currentshape',
      username: 'currentshape',
      name: 'Modern currentshape',
      profileUrl: 'https://x.com/currentshape',
      profileImageUrl: 'https://img.example/modern-currentshape.jpg',
      verified: true,
    });
  });

  it('recognizes stable operation names and rejects a mismatched list source', () => {
    const variables = encodeURIComponent(JSON.stringify({ listId: '123' }));
    expect(
      classifyXGraphQLResponse(
        `https://x.com/i/api/graphql/changing-hash/ListLatestTweetsTimeline?variables=${variables}`,
        { expectedListId: '123' }
      )
    ).toMatchObject({ kind: 'TIMELINE', sourceType: 'FAVORITES' });
    expect(
      classifyXGraphQLResponse(
        `https://x.com/i/api/graphql/other-hash/ListLatestTweetsTimeline?variables=${variables}`,
        { expectedListId: '999' }
      )
    ).toMatchObject({ kind: 'INVALID', reason: 'source_list_id_mismatch' });
    expect(
      classifyXGraphQLResponse('https://x.com/i/api/graphql/hash/TweetDetail?variables=%7B%7D')
    ).toMatchObject({ kind: 'DETAIL' });
  });

  it('preserves an exact vertical conversation as one ordered module', () => {
    const root = tweet('2081092447354912941', 'dandigangi');
    const reply = tweet('2081093440104800434', 'kenwheeler', {
      conversationId: root.rest_id,
      parentId: root.rest_id,
    });
    const nested = tweet('2081159242606850138', 'joelhooks', {
      conversationId: root.rest_id,
      parentId: reply.rest_id,
    });
    const payload = timelinePayload([
      {
        entryId: `conversationthread-${root.rest_id}`,
        content: {
          __typename: 'TimelineTimelineModule',
          metadata: {
            conversationMetadata: { allTweetIds: [root.rest_id, reply.rest_id, nested.rest_id] },
          },
          items: [item(root), item(reply), item(nested)],
        },
      },
    ]);

    const batch = extractTimelineGraphQLResponse(payload, { observedAt, sourceType: 'FAVORITES' });
    expect(batch.items.map((entry) => entry.tweetId)).toEqual([
      root.rest_id,
      reply.rest_id,
      nested.rest_id,
    ]);
    expect(new Set(batch.items.map((entry) => entry.groupId)).size).toBe(1);
    expect(batch.items.map((entry) => entry.groupItemPosition)).toEqual([0, 1, 2]);
    expect(batch.posts.find((post) => post.tweetId === nested.rest_id)).toMatchObject({
      conversationId: root.rest_id,
      structure: { status: 'EXACT', source: 'X_WEB_GRAPHQL_LIST' },
      relationships: [{ type: 'REPLY_TO', tweetId: reply.rest_id }],
    });
  });

  it('keeps referenced tweets as context and expands outbound URLs', () => {
    const quoted = tweet('2080000000000000000', 'satyanadella', {
      url: 'https://microsoft.com/open-weight',
    });
    const primary = tweet('2080000000000000001', 'eastdakota', {
      quoted,
      conversationId: quoted.rest_id,
      url: 'https://microsoft.com/open-weight?utm_source=x',
    });
    const payload = timelinePayload([
      {
        entryId: `tweet-${primary.rest_id}`,
        content: { itemContent: { tweet_results: { result: primary } } },
      },
      { entryId: 'promoted-1', content: { promotedMetadata: {}, itemContent: {} } },
    ]);

    const batch = extractTimelineGraphQLResponse(payload, { observedAt, sourceType: 'FAVORITES' });
    expect(batch.items.map((entry) => entry.tweetId)).toEqual([primary.rest_id]);
    expect(batch.posts.map((post) => post.tweetId).sort()).toEqual(
      [primary.rest_id, quoted.rest_id].sort()
    );
    expect(batch.posts.find((post) => post.tweetId === primary.rest_id)?.links[0]).toMatchObject({
      url: 'https://microsoft.com/open-weight?utm_source=x',
      normalizedUrl: 'https://microsoft.com/open-weight',
      redirectUrl: 'https://t.co/x',
    });
    expect(batch.excludedAds).toBe(1);
  });

  it('extracts TweetDetail parents without creating timeline items', () => {
    const root = tweet('2081108843090571479', 'ctatedev');
    const reply = tweet('2081151476814991388', 'thdxr', {
      conversationId: root.rest_id,
      parentId: root.rest_id,
    });
    const payload = timelinePayload([
      {
        entryId: 'conversation',
        content: { items: [item(root), item(reply)] },
      },
    ]);
    const batch = extractTweetDetailGraphQLResponse(payload, { observedAt });
    expect(batch.items).toEqual([]);
    expect(batch.posts).toHaveLength(2);
    expect(batch.posts[1]).toMatchObject({
      conversationId: root.rest_id,
      relationships: [{ type: 'REPLY_TO', tweetId: root.rest_id }],
      structure: { source: 'X_WEB_GRAPHQL_TWEET_DETAIL' },
    });
  });

  it('keeps the known Matt Silverlock and Gergely Orosz chains distinct and complete', () => {
    const mattRoot = tweet('2081146351031574768', 'elithrar');
    const mattReply = tweet('2081146356060586246', 'elithrar', {
      conversationId: mattRoot.rest_id,
      parentId: mattRoot.rest_id,
    });
    const gergelyRoot = tweet('2081117183002705988', 'GergelyOrosz');
    const gergelyReply = tweet('2081124457163243837', 'GergelyOrosz', {
      conversationId: gergelyRoot.rest_id,
      parentId: gergelyRoot.rest_id,
    });
    const gergelyNested = tweet('2081127488797671523', 'GergelyOrosz', {
      conversationId: gergelyRoot.rest_id,
      parentId: gergelyReply.rest_id,
    });
    const module = (id, tweets) => ({
      entryId: `conversationthread-${id}`,
      content: {
        metadata: { conversationMetadata: { allTweetIds: tweets.map((value) => value.rest_id) } },
        items: tweets.map(item),
      },
    });
    const batch = extractTimelineGraphQLResponse(
      timelinePayload([
        module(mattRoot.rest_id, [mattRoot, mattReply]),
        module(gergelyRoot.rest_id, [gergelyRoot, gergelyReply, gergelyNested]),
      ]),
      { observedAt, sourceType: 'FAVORITES' }
    );

    expect(new Set(batch.items.map((entry) => entry.groupId)).size).toBe(2);
    expect(batch.posts.find((post) => post.tweetId === mattReply.rest_id)).toMatchObject({
      conversationId: mattRoot.rest_id,
      relationships: [{ type: 'REPLY_TO', tweetId: mattRoot.rest_id }],
    });
    expect(batch.posts.find((post) => post.tweetId === gergelyNested.rest_id)).toMatchObject({
      conversationId: gergelyRoot.rest_id,
      relationships: [{ type: 'REPLY_TO', tweetId: gergelyReply.rest_id }],
    });
  });
});
