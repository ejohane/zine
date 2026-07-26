import { describe, expect, it } from 'vitest';

import {
  buildDailyThreadUnits,
  buildDailyTopicClustering,
  createWorkersAIDailyTopicEmbeddingProvider,
  type DailyTopicPost,
} from './daily-topic-clustering';

function post(input: {
  id: string;
  username: string;
  text: string;
  position: number;
  conversationId?: string;
  parentId?: string;
  quoteId?: string;
  source?: 'favorites' | 'following' | 'context';
  link?: string;
}): DailyTopicPost {
  return {
    id: input.id,
    text: input.text,
    publishedAt: new Date(Date.UTC(2026, 6, 25, 12, input.position)).toISOString(),
    observedAt: '2026-07-25T13:00:00.000Z',
    kind: input.parentId ? 'REPLY' : 'POST',
    conversationId: input.conversationId ?? input.id,
    structure: { status: 'EXACT', source: 'X_WEB_GRAPHQL_LIST' },
    author: { key: `id:${input.username}`, username: input.username, name: input.username },
    repostedBy: null,
    relationships: [
      ...(input.parentId
        ? [{ type: 'REPLY_TO', tweetId: input.parentId, evidenceSource: 'X_WEB_GRAPHQL_LIST' }]
        : []),
      ...(input.quoteId
        ? [{ type: 'QUOTE_OF', tweetId: input.quoteId, evidenceSource: 'X_WEB_GRAPHQL_LIST' }]
        : []),
    ],
    links: input.link ? [{ url: input.link, normalizedUrl: input.link }] : [],
    sourcePosition: input.source === 'context' ? null : input.position,
  };
}

describe('daily topic clustering', () => {
  it('batches pinned Workers AI embeddings and accepts the production response shape', async () => {
    const calls: unknown[] = [];
    const provider = createWorkersAIDailyTopicEmbeddingProvider(
      {
        async run(_model, input) {
          calls.push(input);
          const texts = (input as { text: string[] }).text;
          return { data: texts.map((_, index) => [index, 1]) };
        },
      },
      'pinned-model'
    );

    const vectors = await provider?.embed(
      Array.from({ length: 33 }, (_, index) => `post ${index}`)
    );

    expect(calls).toHaveLength(2);
    expect(vectors).toHaveLength(33);
    expect(provider?.model).toBe('pinned-model');
  });

  it('collapses exact reply chains into stable thread units without folding quotes into threads', () => {
    const posts = [
      post({ id: 'root', username: 'alice', text: 'Root', position: 0, conversationId: 'root' }),
      post({
        id: 'reply',
        username: 'bob',
        text: 'Reply',
        position: 1,
        conversationId: 'root',
        parentId: 'root',
      }),
      post({ id: 'other', username: 'carol', text: 'Other', position: 2 }),
    ];
    posts[2].relationships = [{ type: 'QUOTE_OF', tweetId: 'root' }];

    const units = buildDailyThreadUnits(posts, new Set(posts.map((value) => value.id)), new Set());

    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
      id: 'conversation:root',
      rootPostId: 'root',
      postIds: ['root', 'reply'],
      relationshipTypes: ['REPLY_TO', 'CONVERSATION_ID'],
      structureStatus: 'EXACT',
    });
    expect(units[1]).toMatchObject({ id: 'conversation:other', postIds: ['other'] });
  });

  it('groups generalized model and open-weight topics without hardcoded product names', async () => {
    const posts = [
      post({
        id: 'open-1',
        username: 'alice',
        text: 'Open-weight models matter for a healthy ecosystem',
        position: 0,
      }),
      post({
        id: 'open-2',
        username: 'bob',
        text: 'We signed the open weight model letter',
        position: 1,
      }),
      post({
        id: 'model-1',
        username: 'carol',
        text: 'Aurora 7 is fast and token efficient',
        position: 2,
      }),
      post({
        id: 'model-2',
        username: 'dave',
        text: 'My first Aurora-7 coding benchmark',
        position: 3,
      }),
      post({
        id: 'unrelated',
        username: 'erin',
        text: 'A garden update from this morning',
        position: 4,
      }),
    ];

    const result = await buildDailyTopicClustering(
      posts,
      new Set(posts.map((value) => value.id)),
      new Set()
    );

    expect(result.topicClusters).toHaveLength(2);
    expect(
      result.topicClusters.map((topic) => topic.label.toLocaleLowerCase()).join(' ')
    ).toContain('open weight');
    expect(
      result.topicClusters.map((topic) => topic.label.toLocaleLowerCase()).join(' ')
    ).toContain('aurora 7');
    expect(result.favoriteThreadUnitIds).toEqual(['conversation:unrelated']);
    expect(result.algorithm).toMatchObject({
      method: 'THREAD_FIRST_EVIDENCE_CLUSTERING',
      semanticStatus: 'FALLBACK',
      maxTopics: 5,
      minimumFavoriteAuthors: 2,
    });
  });

  it('uses an exact quote target as topic evidence without collapsing it into the quoting thread', async () => {
    const posts = [
      post({
        id: 'target',
        username: 'alice',
        text: 'Open weight models need durable distribution',
        position: 0,
      }),
      post({
        id: 'quote',
        username: 'bob',
        text: 'This is the right direction',
        position: 1,
        quoteId: 'target',
      }),
    ];

    const result = await buildDailyTopicClustering(
      posts,
      new Set(posts.map((value) => value.id)),
      new Set()
    );

    expect(result.threadUnits).toHaveLength(2);
    expect(result.topicClusters).toHaveLength(1);
    expect(result.topicClusters[0]).toMatchObject({
      favoriteThreadUnitIds: ['conversation:target', 'conversation:quote'],
    });
    expect(result.topicClusters[0].evidenceSignals).toContainEqual(
      expect.objectContaining({ type: 'DIRECT_REFERENCE' })
    );
  });

  it('groups independent Favorites that quote the same context post', async () => {
    const posts = [
      post({
        id: 'context-target',
        username: 'source',
        text: 'A new compiler architecture for local agents',
        position: 0,
        source: 'context',
      }),
      post({
        id: 'quote-one',
        username: 'alice',
        text: 'Worth studying',
        position: 1,
        quoteId: 'context-target',
      }),
      post({
        id: 'quote-two',
        username: 'bob',
        text: 'This design is promising',
        position: 2,
        quoteId: 'context-target',
      }),
    ];

    const result = await buildDailyTopicClustering(
      posts,
      new Set(['quote-one', 'quote-two']),
      new Set()
    );

    expect(result.topicClusters).toHaveLength(1);
    expect(result.topicClusters[0]).toMatchObject({
      favoriteThreadUnitIds: ['conversation:quote-one', 'conversation:quote-two'],
      supportingThreadUnitIds: ['conversation:context-target'],
    });
  });

  it('keeps a complete Favorite thread intact inside a topic and uses Following only as support', async () => {
    const posts = [
      post({
        id: 'gergely-root',
        username: 'gergely',
        text: 'Code reviews changed after Fable 5',
        position: 0,
        conversationId: 'gergely-root',
      }),
      post({
        id: 'gergely-reply',
        username: 'gergely',
        text: 'Opus 5 is not as good as Fable 5 for this case',
        position: 1,
        conversationId: 'gergely-root',
        parentId: 'gergely-root',
      }),
      post({ id: 'favorite-2', username: 'alice', text: 'Opus 5 is expensive', position: 2 }),
      post({
        id: 'following-1',
        username: 'bob',
        text: 'Initial thoughts on Opus 5',
        position: 3,
        source: 'following',
      }),
    ];
    const favorites = new Set(['gergely-root', 'gergely-reply', 'favorite-2']);
    const following = new Set(['following-1']);

    const result = await buildDailyTopicClustering(posts, favorites, following);
    const topic = result.topicClusters[0];

    expect(topic.label.toLocaleLowerCase()).toContain('opus 5');
    expect(topic.favoriteThreadUnitIds).toContain('conversation:gergely-root');
    expect(topic.supportingThreadUnitIds).toEqual(['conversation:following-1']);
    expect(topic.postIds).toEqual(
      expect.arrayContaining(['gergely-root', 'gergely-reply', 'favorite-2', 'following-1'])
    );
    expect(
      result.threadUnits.find((unit) => unit.id === 'conversation:gergely-root')?.postIds
    ).toEqual(['gergely-root', 'gergely-reply']);
  });

  it('ranks by Favorite author convergence and returns fewer than five when evidence is thin', async () => {
    const posts = [
      post({ id: 'wide-1', username: 'one', text: 'Nimbus 9 launch', position: 0 }),
      post({ id: 'wide-2', username: 'two', text: 'Nimbus 9 benchmark', position: 1 }),
      post({ id: 'wide-3', username: 'three', text: 'Nimbus 9 pricing', position: 2 }),
      post({ id: 'small-1', username: 'four', text: 'Copper 4 launch', position: 3 }),
      post({ id: 'small-2', username: 'five', text: 'Copper 4 benchmark', position: 4 }),
    ];

    const result = await buildDailyTopicClustering(
      posts,
      new Set(posts.map((value) => value.id)),
      new Set()
    );

    expect(result.topicClusters).toHaveLength(2);
    expect(result.topicClusters[0].label.toLocaleLowerCase()).toContain('nimbus 9');
    expect(result.topicClusters[0].score).toBeGreaterThan(result.topicClusters[1].score);
  });

  it('uses pinned embeddings only for expansion and records their provenance', async () => {
    const posts = [
      post({ id: 'seed-1', username: 'one', text: 'Robotics safety research', position: 0 }),
      post({ id: 'seed-2', username: 'two', text: 'Robotics safety testing', position: 1 }),
      post({ id: 'semantic', username: 'three', text: 'Machines operating safely', position: 2 }),
    ];
    const vectors: Record<string, number[]> = {
      'Robotics safety research': [1, 0],
      'Robotics safety testing': [0.99, 0.01],
      'Machines operating safely': [0.98, 0.02],
    };

    const result = await buildDailyTopicClustering(
      posts,
      new Set(posts.map((value) => value.id)),
      new Set(),
      {
        embeddingProvider: {
          model: 'pinned-test-model',
          embed: async (texts) => texts.map((text) => vectors[text]),
        },
      }
    );

    expect(result.algorithm).toMatchObject({
      semanticStatus: 'COMPLETE',
      embeddingModel: 'pinned-test-model',
    });
    expect(result.topicClusters[0].favoriteThreadUnitIds).toContain('conversation:semantic');
    expect(result.topicClusters[0].evidenceSignals).toContainEqual(
      expect.objectContaining({ type: 'SEMANTIC_SIMILARITY', value: 'pinned-test-model' })
    );
  });

  it('bounds semantic work on large days and discloses partial semantic coverage', async () => {
    const posts = Array.from({ length: 300 }, (_, index) =>
      post({
        id: `large-${index}`,
        username: `author-${index}`,
        text: `Common scalable signal ${index}`,
        position: index,
      })
    );
    const embeddedBatchSizes: number[] = [];

    const result = await buildDailyTopicClustering(
      posts,
      new Set(posts.map((value) => value.id)),
      new Set(),
      {
        embeddingProvider: {
          model: 'pinned-test-model',
          embed: async (texts) => {
            embeddedBatchSizes.push(texts.length);
            return texts.map(() => [1, 0]);
          },
        },
      }
    );

    expect(embeddedBatchSizes).toEqual([256]);
    expect(result.algorithm).toMatchObject({
      semanticStatus: 'PARTIAL',
      semanticUnitLimit: 256,
      candidateLimit: 40,
    });
    expect(result.warnings.join(' ')).toContain('256/300 Favorite thread units');
    expect(result.topicClusters).toHaveLength(1);
  });
});
