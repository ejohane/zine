import { describe, expect, it } from 'bun:test';
import { normalizeEditorialFeedbackCanonicalUrl } from '@zine/editorial-schema';

import { buildEditorialCandidateArtifact } from './candidates';

const now = '2026-07-18T12:00:00.000Z';

function source(
  id: string,
  origin: 'X' | 'ZINE',
  canonicalUrl: string,
  creator: string,
  userState: 'BOOKMARKED' | null = null
) {
  return {
    id,
    origin,
    role: origin === 'X' ? 'COMMENTARY' : 'REPORTING',
    canonicalUrl,
    title: origin === 'ZINE' ? 'A saved browser agents article' : null,
    creator,
    publisher: origin === 'ZINE' ? 'Example' : 'X',
    publishedAt: now,
    xTweetId: origin === 'X' ? id.replace('x:', '') : null,
    zineItemId: origin === 'ZINE' ? 'item-1' : null,
    zineUserItemId: origin === 'ZINE' ? 'user-item-1' : null,
    contentType: origin === 'X' ? 'POST' : 'ARTICLE',
    userState,
  };
}

function document(input: {
  id: string;
  creator: string;
  text: string;
  position: number;
  link?: string;
  runId?: string;
}) {
  return {
    source: source(
      input.id,
      'X',
      `https://x.com/example/status/${input.id.replace('x:', '')}`,
      input.creator
    ),
    observedAt: now,
    firstSeenAt: '2026-07-18T10:00:00.000Z',
    text: input.text,
    summary: null,
    timelinePosition: input.position,
    engagement: { replies: 2, reposts: 3, likes: 20, views: 500 },
    links: input.link
      ? [
          {
            url: input.link,
            normalizedUrl: input.link,
            source: 'CARD',
            card: {
              title: 'Browser agents arrive',
              description: 'A primary source about browser agents.',
              domain: 'example.com',
              imageUrl: null,
            },
          },
        ]
      : [],
    signals: {
      ingestedAt: null,
      bookmarkedAt: null,
      lastOpenedAt: null,
      isFinished: false,
      tags: [`x-run:${input.runId ?? 'run-1'}`],
    },
  };
}

function snapshot() {
  return {
    schemaVersion: 1,
    id: 'snapshot-1',
    generatedAt: now,
    editionDate: '2026-07-18',
    timezone: 'America/Chicago',
    window: {
      newContentAfter: '2026-07-17T12:00:00.000Z',
      through: now,
      comparisonAfter: '2026-07-11T12:00:00.000Z',
      previousEditionId: null,
      fallbackWindowUsed: true,
    },
    provenance: {
      xRunIds: ['run-1', 'run-2'],
      inputCounts: {
        xTimelineEntries: 3,
        xCanonicalPosts: 3,
        inboxItems: 0,
        recentBookmarks: 1,
        contextualBookmarks: 0,
        externalVerificationSources: 0,
      },
      sourceStatus: {
        xArchive: 'COMPLETE',
        zineInbox: 'COMPLETE',
        zineBookmarks: 'COMPLETE',
        externalVerification: 'NOT_RUN',
      },
      snapshotKey: 'snapshot.json',
      warnings: [],
    },
    documents: [
      document({
        id: 'x:1',
        creator: 'Alice',
        text: 'Must read this thoughtful piece about browser agents.',
        position: 0,
        link: 'https://example.com/browser-agents',
        runId: 'run-1',
      }),
      document({
        id: 'x:2',
        creator: 'Bob',
        text: 'Browser agents are here. This article is worth a read.',
        position: 1,
        link: 'https://example.com/browser-agents',
        runId: 'run-2',
      }),
      document({
        id: 'x:3',
        creator: 'Carol',
        text: 'An unrelated short observation about gardening tools.',
        position: 2,
      }),
      {
        source: source(
          'zine:item-1',
          'ZINE',
          'https://example.com/browser-agents',
          'Example Author',
          'BOOKMARKED'
        ),
        observedAt: '2026-07-17T15:00:00.000Z',
        firstSeenAt: '2026-07-17T15:00:00.000Z',
        text: null,
        summary: 'A saved browser agents article with useful background.',
        timelinePosition: null,
        engagement: null,
        links: [],
        signals: {
          ingestedAt: '2026-07-17T15:00:00.000Z',
          bookmarkedAt: '2026-07-17T15:00:00.000Z',
          lastOpenedAt: null,
          isFinished: false,
          tags: ['agents'],
        },
      },
    ],
  };
}

function feedbackProfile(input: { affinity: number; novelty: number; eventCount?: number }) {
  const counts = {
    moreLikeThis: input.affinity > 0 ? (input.eventCount ?? 1) : 0,
    lessLikeThis: input.affinity < 0 ? (input.eventCount ?? 1) : 0,
    dismissed: 0,
    alreadyKnew: input.novelty < 0 ? (input.eventCount ?? 1) : 0,
  };
  const preference = (key: string) => ({
    key,
    affinity: input.affinity,
    novelty: input.novelty,
    signalCounts: counts,
    lastSignaledAt: '2026-07-18T11:00:00.000Z',
  });
  return {
    schemaVersion: 1 as const,
    generatedAt: '2026-07-18T11:30:00.000Z',
    lookbackDays: 180 as const,
    halfLifeDays: 60 as const,
    maxEvents: 500 as const,
    eventCount: input.eventCount ?? 1,
    truncated: false,
    topics: [preference('agent')],
    creators: [preference('alice')],
    canonicalUrls: [preference('https://example.com/browser-agents')],
    sourceIds: [preference('x:1')],
  };
}

describe('buildEditorialCandidateArtifact', () => {
  it('clusters repeated X links, ranks X signals first, and records Zine resonance', () => {
    const artifact = buildEditorialCandidateArtifact(snapshot(), new Date(now));

    expect(artifact.strategy).toBe('X_LED_V1');
    expect(artifact.candidates).toHaveLength(2);
    expect(artifact.candidates[0]).toMatchObject({
      title: 'Browser agents arrive',
      rank: 1,
      canonicalUrl: 'https://example.com/browser-agents',
      independentVoiceCount: 2,
      xPostCount: 2,
      xRunCount: 2,
      explicitRecommendationCount: 2,
      linkedPostCount: 2,
    });
    expect(artifact.candidates[0]!.score.xConversation).toBeGreaterThan(0);
    expect(artifact.candidates[0]!.score.attention).toBeGreaterThan(0);
    expect(artifact.candidates[0]!.score.zineResonance).toBeGreaterThan(0);
    expect(artifact.candidates[0]!.zineMatches[0]).toMatchObject({
      sourceId: 'zine:item-1',
      relationship: 'EXACT_SOURCE',
      matchScore: 100,
    });
    expect(artifact.candidates[0]!.score.total).toBeGreaterThan(
      artifact.candidates[1]!.score.total
    );
  });

  it('joins hyphenated named topics without merging generic phrasing', () => {
    const input = snapshot();
    input.documents = [
      document({
        id: 'x:kimi-1',
        creator: 'Alice',
        text: 'Let me show you how to run Kimi-K3 locally.',
        position: 0,
      }),
      document({
        id: 'x:kimi-2',
        creator: 'Bob',
        text: 'Kimi K3 costs less per token but uses more tokens.',
        position: 1,
      }),
      document({
        id: 'x:people-1',
        creator: 'Carol',
        text: 'Many people are asking about restaurant prices.',
        position: 2,
      }),
      document({
        id: 'x:people-2',
        creator: 'Dana',
        text: 'People are asking whether machine gods dream.',
        position: 3,
      }),
    ];
    input.provenance.inputCounts.xTimelineEntries = 4;
    input.provenance.inputCounts.xCanonicalPosts = 4;

    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    const kimi = artifact.candidates.find((candidate) => candidate.xSourceIds.includes('x:kimi-1'));

    expect(kimi?.xSourceIds).toEqual(expect.arrayContaining(['x:kimi-1', 'x:kimi-2']));
    expect(kimi?.xPostCount).toBe(2);
    expect(
      artifact.candidates.some(
        (candidate) =>
          candidate.xSourceIds.includes('x:people-1') && candidate.xSourceIds.includes('x:people-2')
      )
    ).toBe(false);
  });

  it('is order-invariant and does not treat one crawl as momentum', () => {
    const input = snapshot();
    input.provenance.xRunIds = ['run-1'];
    for (const value of input.documents) {
      if (value.source.origin === 'X') value.signals.tags = ['x-run:run-1'];
    }
    const reversed = structuredClone(input);
    reversed.documents.reverse();

    const first = buildEditorialCandidateArtifact(input, new Date(now));
    const second = buildEditorialCandidateArtifact(reversed, new Date(now));

    expect(first.clusters).toEqual(second.clusters);
    expect(first.candidates).toEqual(second.candidates);
    expect(first.candidates.every((candidate) => candidate.score.momentum === 0)).toBe(true);
    expect(
      first.clusters.every((cluster) => !cluster.topics.some((topic) => topic === 'x-run'))
    ).toBe(true);
  });

  it('is byte-stable across default reruns of the same snapshot', () => {
    const first = buildEditorialCandidateArtifact(snapshot());
    const second = buildEditorialCandidateArtifact(snapshot());

    expect(first).toEqual(second);
    expect(first.generatedAt).toBe(now);
  });

  it('applies explicit feedback after preserving the deterministic X-led base score', () => {
    const neutral = buildEditorialCandidateArtifact(snapshot(), new Date(now));
    const positiveInput = {
      ...snapshot(),
      feedbackProfile: feedbackProfile({ affinity: 1, novelty: 0 }),
    };
    const negativeInput = {
      ...snapshot(),
      feedbackProfile: feedbackProfile({ affinity: -1, novelty: 0 }),
    };
    const knownInput = {
      ...snapshot(),
      feedbackProfile: feedbackProfile({ affinity: 0, novelty: -1 }),
    };
    const positive = buildEditorialCandidateArtifact(positiveInput, new Date(now));
    const negative = buildEditorialCandidateArtifact(negativeInput, new Date(now));
    const known = buildEditorialCandidateArtifact(knownInput, new Date(now));
    const candidateFor = (artifact: typeof neutral) =>
      artifact.candidates.find(
        (candidate) => candidate.canonicalUrl === 'https://example.com/browser-agents'
      )!;
    const neutralCandidate = candidateFor(neutral);
    const positiveCandidate = candidateFor(positive);
    const negativeCandidate = candidateFor(negative);
    const knownCandidate = candidateFor(known);

    expect(positiveCandidate.feedbackImpact?.baseTotal).toBe(neutralCandidate.score.total);
    expect(positiveCandidate.score.feedbackAdjustment).toBeGreaterThan(0);
    expect(positiveCandidate.score.total).toBeGreaterThan(neutralCandidate.score.total);
    expect(negativeCandidate.score.feedbackAdjustment).toBeLessThan(0);
    expect(negativeCandidate.score.total).toBeLessThan(neutralCandidate.score.total);
    expect(knownCandidate.feedbackImpact).toBeDefined();
    expect(knownCandidate.feedbackImpact!.affinityAdjustment).toBe(0);
    expect(knownCandidate.feedbackImpact!.noveltyAdjustment).toBe(-3.2);
    expect(knownCandidate.scoreReasons).toEqual(
      expect.arrayContaining([expect.stringContaining('X-led base score')])
    );
  });

  it('caps repeated positive and negative feedback adjustments at eight points', () => {
    const positive = buildEditorialCandidateArtifact(
      {
        ...snapshot(),
        feedbackProfile: feedbackProfile({ affinity: 3, novelty: 0, eventCount: 10 }),
      },
      new Date(now)
    );
    const negative = buildEditorialCandidateArtifact(
      {
        ...snapshot(),
        feedbackProfile: feedbackProfile({ affinity: -3, novelty: -3, eventCount: 10 }),
      },
      new Date(now)
    );
    const adjusted = (artifact: typeof positive) =>
      artifact.candidates.find(
        (candidate) => candidate.canonicalUrl === 'https://example.com/browser-agents'
      )!;

    expect(adjusted(positive).score.feedbackAdjustment).toBe(8);
    expect(adjusted(negative).score.feedbackAdjustment).toBe(-8);
  });

  it('matches twitter feedback URLs to the equivalent x.com source', () => {
    const input = {
      ...snapshot(),
      feedbackProfile: {
        schemaVersion: 1,
        generatedAt: '2026-07-18T11:30:00.000Z',
        lookbackDays: 180,
        halfLifeDays: 60,
        maxEvents: 500,
        eventCount: 1,
        truncated: false,
        topics: [],
        creators: [],
        canonicalUrls: [
          {
            key: normalizeEditorialFeedbackCanonicalUrl(
              'https://mobile.twitter.com/example/status/1'
            )!,
            affinity: 1,
            novelty: 0,
            signalCounts: {
              moreLikeThis: 1,
              lessLikeThis: 0,
              dismissed: 0,
              alreadyKnew: 0,
            },
            lastSignaledAt: '2026-07-18T11:00:00.000Z',
          },
        ],
        sourceIds: [],
      },
    };

    const candidate = buildEditorialCandidateArtifact(input, new Date(now)).candidates.find(
      (value) => value.xSourceIds.includes('x:1')
    );

    expect(candidate?.feedbackImpact?.matchedCanonicalUrls).toContain(
      'https://x.com/example/status/1'
    );
    expect(candidate?.score.feedbackAdjustment).toBeGreaterThan(0);
  });

  it('builds coherent model-market, governance, and agent-control bundles', () => {
    const input = snapshot();
    const fixtures = [
      [
        'x:fable',
        'Claude',
        'Claude Fable 5 is included in Max plans with usage credits and limits.',
      ],
      ['x:kimi', 'Theo', 'Kimi K3 costs less per token but has a higher per-task price.'],
      ['x:open', 'Alice', 'Open-source AI models are now part of the regulation debate.'],
      ['x:china', 'Bob', 'Gatekeeping Chinese models will not work as geopolitical AI policy.'],
      ['x:loops', 'Carol', 'Are agent loops becoming graphs now?'],
      ['x:telemetry', 'Dana', 'Agents need a feedback loop with telemetry, tests, and review.'],
      ['x:social', 'Eve', 'My posts entered a positive feedback loop after an algorithm change.'],
      ['x:busy', 'Frank', 'Claude Code left ten orphaned busy-loops running on the CPU.'],
    ] as const;
    input.documents = fixtures.map(([id, creator, text], position) =>
      document({ id, creator, text, position })
    );
    input.provenance.inputCounts.xTimelineEntries = fixtures.length;
    input.provenance.inputCounts.xCanonicalPosts = fixtures.length;

    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    const market = artifact.candidates.find((candidate) =>
      candidate.title.startsWith('The model market')
    );
    const governance = artifact.candidates.find((candidate) =>
      candidate.title.startsWith('Open-model competition')
    );
    const controls = artifact.candidates.find((candidate) =>
      candidate.title.startsWith('Agent loops')
    );

    expect(market?.xSourceIds).toEqual(expect.arrayContaining(['x:fable', 'x:kimi']));
    expect(governance?.xSourceIds).toEqual(expect.arrayContaining(['x:open', 'x:china']));
    expect(controls?.xSourceIds).toEqual(expect.arrayContaining(['x:loops', 'x:telemetry']));
    expect(controls?.xSourceIds).not.toContain('x:social');
    expect(controls?.xSourceIds).not.toContain('x:busy');
  });

  it('returns an inspectable empty artifact when X is unavailable', () => {
    const input = snapshot();
    input.documents = input.documents.filter((value) => value.source.origin !== 'X');
    input.provenance.sourceStatus.xArchive = 'UNAVAILABLE';
    const artifact = buildEditorialCandidateArtifact(input, new Date(now));

    expect(artifact.candidates).toEqual([]);
    expect(artifact.coverageNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unavailable'),
        expect.stringContaining('No X documents'),
      ])
    );
  });
});
