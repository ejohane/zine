import { describe, expect, it } from 'bun:test';
import {
  normalizeEditorialFeedbackCanonicalUrl,
  type EditorialSnapshot,
  type EditorialSnapshotDocument,
  type SourceReference,
} from '@zine/editorial-schema';

import { buildEditorialCandidateArtifact } from './candidates';

const now = '2026-07-18T12:00:00.000Z';

function source(
  id: string,
  origin: 'X' | 'ZINE' | 'EXTERNAL',
  canonicalUrl: string,
  creator: string,
  userState: 'INBOX' | 'BOOKMARKED' | 'FINISHED' | null = null,
  title: string | null = null
): SourceReference {
  return {
    id,
    origin,
    role: origin === 'X' ? 'COMMENTARY' : 'REPORTING',
    canonicalUrl,
    title,
    creator,
    publisher: origin === 'X' ? 'X' : new URL(canonicalUrl).hostname,
    publishedAt: now,
    xTweetId: origin === 'X' ? id.replace('x:', '') : null,
    zineItemId: origin === 'ZINE' ? id.replace('zine:', '') : null,
    zineUserItemId: origin === 'ZINE' ? `user-${id}` : null,
    contentType: origin === 'X' ? 'POST' : 'ARTICLE',
    userState,
  };
}

function xDocument(input: {
  id: string;
  creator: string;
  text: string;
  position: number;
  link?: string;
  cardTitle?: string | null;
  cardDescription?: string | null;
  runId?: string;
  observedAt?: string;
}): EditorialSnapshotDocument {
  return {
    source: source(
      input.id,
      'X',
      `https://x.com/example/status/${input.id.replace('x:', '')}`,
      input.creator
    ),
    observedAt: input.observedAt ?? now,
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
              title: input.cardTitle === undefined ? input.text : input.cardTitle,
              description: input.cardDescription === undefined ? input.text : input.cardDescription,
              domain: new URL(input.link).hostname,
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

function nonXDocument(input: {
  id: string;
  origin: 'ZINE' | 'EXTERNAL';
  url: string;
  creator: string;
  title: string;
  summary: string;
  observedAt?: string;
  userState?: 'INBOX' | 'BOOKMARKED' | 'FINISHED' | null;
}): EditorialSnapshotDocument {
  const observedAt = input.observedAt ?? '2026-07-18T11:00:00.000Z';
  return {
    source: source(
      input.id,
      input.origin,
      input.url,
      input.creator,
      input.userState ?? (input.origin === 'ZINE' ? 'INBOX' : null),
      input.title
    ),
    observedAt,
    firstSeenAt: observedAt,
    text: null,
    summary: input.summary,
    timelinePosition: null,
    engagement: null,
    links: [],
    signals: {
      ingestedAt: input.origin === 'ZINE' ? observedAt : null,
      bookmarkedAt: input.userState === 'BOOKMARKED' ? observedAt : null,
      lastOpenedAt: null,
      isFinished: input.userState === 'FINISHED',
      tags: [],
    },
  };
}

function snapshot(): EditorialSnapshot {
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
        externalDiscoverySources: 0,
      },
      sourceStatus: {
        xArchive: 'COMPLETE',
        zineInbox: 'COMPLETE',
        zineBookmarks: 'COMPLETE',
        externalVerification: 'NOT_RUN',
        externalDiscovery: 'NOT_RUN',
      },
      snapshotKey: 'snapshot.json',
      warnings: [],
    },
    documents: [
      xDocument({
        id: 'x:1',
        creator: 'Alice',
        text: 'Must read this thoughtful piece about browser agents.',
        position: 0,
        link: 'https://example.com/browser-agents',
        cardTitle: 'Browser agents arrive',
        runId: 'run-1',
      }),
      xDocument({
        id: 'x:2',
        creator: 'Bob',
        text: 'Browser agents are here. This article is worth a read.',
        position: 1,
        link: 'https://example.com/browser-agents',
        cardTitle: 'Browser agents arrive',
        runId: 'run-2',
      }),
      xDocument({
        id: 'x:3',
        creator: 'Carol',
        text: 'An unrelated short observation about gardening tools.',
        position: 2,
      }),
      nonXDocument({
        id: 'zine:item-1',
        origin: 'ZINE',
        url: 'https://example.com/browser-agents',
        creator: 'Example Author',
        title: 'A saved browser agents article',
        summary: 'A saved browser agents article with useful background.',
        userState: 'BOOKMARKED',
        observedAt: '2026-07-17T15:00:00.000Z',
      }),
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
    topics: [preference('browser')],
    creators: [preference('alice')],
    canonicalUrls: [preference('https://example.com/browser-agents')],
    sourceIds: [preference('x:1')],
  };
}

function topology(artifact: ReturnType<typeof buildEditorialCandidateArtifact>): string[][] {
  return artifact.clusters
    .map((cluster) => [...cluster.xSourceIds].sort())
    .filter((ids) => ids.length > 0)
    .sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? ''));
}

describe('buildEditorialCandidateArtifact v2', () => {
  it('clusters canonical artifacts across X and Zine and emits an inspectable portfolio', () => {
    const artifact = buildEditorialCandidateArtifact(snapshot(), new Date(now));
    expect(artifact.strategy).toBe('EDITORIAL_V2');
    if (artifact.strategy !== 'EDITORIAL_V2') throw new Error('Expected v2 artifact');
    expect(artifact.schemaVersion).toBe(2);
    expect(artifact.featureModel).toBe('CORPUS_TFIDF_V1');
    expect(artifact.candidates[0]).toMatchObject({
      title: 'A saved browser agents article',
      summary: 'A saved browser agents article with useful background.',
      canonicalUrl: 'https://example.com/browser-agents',
      independentVoiceCount: 3,
      xPostCount: 2,
      xRunCount: 2,
      framing: {
        model: 'EXTRACTIVE_EDITORIAL_V1',
        headlineMethod: 'SOURCE_TITLE',
        summaryMethod: 'SOURCE_SUMMARY',
        headlineSourceIds: ['zine:item-1'],
        summarySourceIds: ['zine:item-1'],
      },
    });
    expect(artifact.candidates[0]!.zineMatches[0]).toMatchObject({
      sourceId: 'zine:item-1',
      relationship: 'EXACT_SOURCE',
      matchScore: 100,
    });
    expect(artifact.portfolio.selectedCandidateIds).toContain(artifact.candidates[0]!.id);
    expect(artifact.portfolio.decisions).toHaveLength(artifact.candidates.length);
  });

  it('turns raw linked posts into concise, auditable editorial framing', () => {
    const input = snapshot();
    input.documents = [
      xDocument({
        id: 'x:soccer',
        creator: 'Analyst',
        text: 'HOW SOCCER ANALYTICS IS LIKE VOLATILITY ARBITRAGE TRADING @host and I talk to a former trader now working in football analytics',
        position: 0,
        link: 'https://podcasts.example/episodes/soccer-analytics',
        cardTitle: null,
        cardDescription: null,
      }),
      xDocument({
        id: 'x:modem',
        creator: 'Builder',
        text: 'New 200kbps+ speed record on the dial up modem on https://builder.example/modem Hacked the emulator to increase speeds and test the practical limit.',
        position: 1,
        link: 'https://builder.example/modem',
        cardTitle: null,
        cardDescription: null,
      }),
    ];
    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    if (artifact.strategy !== 'EDITORIAL_V2') throw new Error('Expected v2 artifact');
    const soccer = artifact.candidates.find((candidate) =>
      candidate.sourceIds.includes('x:soccer')
    )!;
    const modem = artifact.candidates.find((candidate) => candidate.sourceIds.includes('x:modem'))!;

    expect(soccer.title).toBe('How soccer analytics is like volatility arbitrage trading');
    expect(modem.title).toBe('New 200kbps+ speed record on the dial up modem');
    expect(modem.summary).toContain('Hacked the emulator to increase speeds');
    expect(modem.summary).not.toContain('https://');
    expect(modem.summary).not.toContain('modem on.');
    expect(soccer.summary).toStartWith('How soccer analytics is like volatility arbitrage trading');
    for (const candidate of [soccer, modem]) {
      expect(candidate.title.length).toBeLessThanOrEqual(120);
      expect(candidate.title).not.toMatch(/\.{3}|…/u);
      expect(candidate.framing).toMatchObject({
        model: 'EXTRACTIVE_EDITORIAL_V1',
        headlineMethod: 'EXTRACTIVE_POST',
        summaryMethod: 'EXTRACTIVE_CONTEXT',
        headlineSourceIds: candidate.sourceIds,
        summarySourceIds: candidate.sourceIds,
      });
    }
  });

  it('preserves an explicit truncation marker without leaking broken markup', () => {
    const input = snapshot();
    input.documents = [
      nonXDocument({
        id: 'zine:truncated',
        origin: 'ZINE',
        url: 'https://journal.example/query-tool',
        creator: 'Journal',
        title: 'Query tool explained',
        summary: 'The source explains both `QUERY PLAN and runtime details …',
      }),
    ];
    const candidate = buildEditorialCandidateArtifact(input, new Date(now)).candidates[0]!;
    expect(candidate.summary).toBe('The source explains both QUERY PLAN and runtime details…');
  });

  it('does not mistake an ellipsized display URL for truncated prose', () => {
    const input = snapshot();
    input.documents = [
      xDocument({
        id: 'x:schedule',
        creator: 'Operator',
        text: 'Now scheduling the thirteenth field test for Thursday → https://operator.example/field-test…',
        position: 0,
        link: 'https://operator.example/field-test',
        cardTitle: null,
        cardDescription: null,
      }),
    ];
    const candidate = buildEditorialCandidateArtifact(input, new Date(now)).candidates[0]!;
    expect(candidate.summary).toBe('Now scheduling the thirteenth field test for Thursday.');
  });

  it('uses the same clustering topology after subject vocabulary is substituted', () => {
    const input = snapshot();
    input.documents = [
      xDocument({
        id: 'x:a1',
        creator: 'A',
        text: 'Cerulean Festival opens the harbor tonight',
        position: 0,
      }),
      xDocument({
        id: 'x:a2',
        creator: 'B',
        text: 'Cerulean Festival fills the harbor with crowds',
        position: 1,
      }),
      xDocument({
        id: 'x:b1',
        creator: 'C',
        text: 'Copper Orchard publishes its winter harvest report',
        position: 2,
      }),
      xDocument({
        id: 'x:b2',
        creator: 'D',
        text: 'Copper Orchard revises the winter harvest forecast',
        position: 3,
      }),
    ];
    const renamed = structuredClone(input);
    const replacements: Record<string, string> = {
      Cerulean: 'Marigold',
      Festival: 'Symposium',
      harbor: 'valley',
      Copper: 'Silver',
      Orchard: 'Observatory',
      winter: 'summer',
      harvest: 'weather',
    };
    for (const document of renamed.documents) {
      for (const [from, to] of Object.entries(replacements)) {
        document.text = (document.text ?? '').replaceAll(from, to);
      }
    }
    expect(topology(buildEditorialCandidateArtifact(input, new Date(now)))).toEqual(
      topology(buildEditorialCandidateArtifact(renamed, new Date(now)))
    );
  });

  it('joins rare hyphenated phrases without merging generic phrasing', () => {
    const input = snapshot();
    input.documents = [
      xDocument({
        id: 'x:k1',
        creator: 'A',
        text: 'The Kestrel-K3 field trial starts locally',
        position: 0,
      }),
      xDocument({
        id: 'x:k2',
        creator: 'B',
        text: 'Kestrel K3 field trial results arrive tomorrow',
        position: 1,
      }),
      xDocument({
        id: 'x:p1',
        creator: 'C',
        text: 'Many people are asking about restaurant prices',
        position: 2,
      }),
      xDocument({
        id: 'x:p2',
        creator: 'D',
        text: 'People are asking whether distant stars dream',
        position: 3,
      }),
    ];
    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    const kestrel = artifact.candidates.find((candidate) => candidate.xSourceIds.includes('x:k1'));
    expect(kestrel?.xSourceIds).toEqual(expect.arrayContaining(['x:k1', 'x:k2']));
    expect(
      artifact.candidates.some(
        (candidate) =>
          candidate.xSourceIds.includes('x:p1') && candidate.xSourceIds.includes('x:p2')
      )
    ).toBe(false);
  });

  it('is order-invariant, byte-stable, and does not invent momentum from one crawl', () => {
    const input = snapshot();
    input.provenance.xRunIds = ['run-1'];
    for (const value of input.documents) {
      if (value.source.origin === 'X') value.signals.tags = ['x-run:run-1'];
    }
    const reversed = structuredClone(input);
    reversed.documents.reverse();
    const first = buildEditorialCandidateArtifact(input, new Date(now));
    const second = buildEditorialCandidateArtifact(reversed, new Date(now));
    expect(first).toEqual(second);
    expect(first.candidates.every((candidate) => candidate.score.momentum === 0)).toBe(true);
    expect(buildEditorialCandidateArtifact(input)).toEqual(buildEditorialCandidateArtifact(input));
    const changed = structuredClone(input);
    changed.documents[0]!.text = `${changed.documents[0]!.text} Material update.`;
    expect(buildEditorialCandidateArtifact(changed, new Date(now)).id).not.toBe(first.id);
  });

  it('preserves a bounded base score and applies positive, negative, and novelty feedback', () => {
    const neutral = buildEditorialCandidateArtifact(snapshot(), new Date(now));
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
    const candidateFor = (artifact: typeof neutral) =>
      artifact.candidates.find(
        (candidate) => candidate.canonicalUrl === 'https://example.com/browser-agents'
      )!;
    expect(candidateFor(positive).feedbackImpact?.baseTotal).toBe(
      candidateFor(neutral).score.total
    );
    expect(candidateFor(positive).score.feedbackAdjustment).toBe(8);
    expect(candidateFor(negative).score.feedbackAdjustment).toBe(-8);
    expect(candidateFor(negative).feedbackImpact!.noveltyAdjustment).toBeLessThan(0);
  });

  it('normalizes twitter feedback URLs to the equivalent x.com source', () => {
    const input = snapshot();
    input.feedbackProfile = {
      ...feedbackProfile({ affinity: 1, novelty: 0 }),
      topics: [],
      creators: [],
      canonicalUrls: [
        {
          ...feedbackProfile({ affinity: 1, novelty: 0 }).canonicalUrls[0],
          key: normalizeEditorialFeedbackCanonicalUrl(
            'https://mobile.twitter.com/example/status/1'
          )!,
        },
      ],
      sourceIds: [],
    };
    const candidate = buildEditorialCandidateArtifact(input, new Date(now)).candidates.find(
      (value) => value.xSourceIds.includes('x:1')
    );
    expect(candidate?.feedbackImpact?.matchedCanonicalUrls).toContain(
      'https://x.com/example/status/1'
    );
  });

  it('selects a portfolio that resists creator and domain concentration without category quotas', () => {
    const input = snapshot();
    const repeated = [
      'Amber lighthouse restoration report',
      'Copper orchard harvest bulletin',
      'Indigo railway timetable revision',
      'Velvet theater season announcement',
      'Granite bridge inspection summary',
      'Willow kitchen cookbook release',
      'Crimson telescope survey notes',
      'Saffron bicycle route proposal',
    ];
    input.documents = [
      ...repeated.map((text, index) =>
        xDocument({
          id: `x:r${index}`,
          creator: 'Repeated Source',
          text,
          position: index,
          link: `https://same.example/story-${index}`,
          cardTitle: text,
        })
      ),
      xDocument({
        id: 'x:distinct-1',
        creator: 'Distinct One',
        text: 'Aurora museum acquires coastal archive',
        position: 9,
        link: 'https://first.example/archive',
      }),
      xDocument({
        id: 'x:distinct-2',
        creator: 'Distinct Two',
        text: 'Prairie observatory maps a comet trail',
        position: 10,
        link: 'https://second.example/comet',
      }),
    ];
    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    if (artifact.strategy !== 'EDITORIAL_V2') throw new Error('Expected v2 artifact');
    const selectedSources = artifact.portfolio.selectedCandidateIds.flatMap(
      (id) => artifact.candidates.find((candidate) => candidate.id === id)?.sourceIds ?? []
    );
    expect(selectedSources).toContain('x:distinct-1');
    expect(selectedSources).toContain('x:distinct-2');
    expect(artifact.portfolio.diagnostics.uniqueCreators).toBeGreaterThan(1);
    expect(artifact.portfolio.diagnostics.uniqueDomains).toBeGreaterThan(1);
  });

  it('penalizes exact repeats from retained edition history', () => {
    const input = snapshot();
    input.documents = [
      xDocument({
        id: 'x:repeat',
        creator: 'A',
        text: 'Old coastal archive update',
        position: 0,
        link: 'https://history.example/story',
      }),
      xDocument({
        id: 'x:fresh',
        creator: 'B',
        text: 'New mountain survey arrives',
        position: 1,
        link: 'https://fresh.example/story',
      }),
    ];
    input.history = {
      lookbackDays: 14,
      editionIds: ['edition-old'],
      stories: [
        {
          editionId: 'edition-old',
          editionDate: '2026-07-17',
          storyId: 'story-old',
          title: 'Old coastal archive',
          topics: ['coastal', 'archive'],
          canonicalUrls: ['https://history.example/story'],
        },
      ],
    };
    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    if (artifact.strategy !== 'EDITORIAL_V2') throw new Error('Expected v2 artifact');
    const first = artifact.candidates.find(
      (candidate) => candidate.id === artifact.portfolio.selectedCandidateIds[0]
    );
    expect(first?.sourceIds).toContain('x:fresh');
    expect(
      artifact.candidates.find((candidate) => candidate.sourceIds.includes('x:repeat'))
        ?.historicalSimilarity
    ).toBe(1);
  });

  it('allows Zine and bounded external discovery to originate candidates when X is unavailable', () => {
    const input = snapshot();
    input.documents = [
      nonXDocument({
        id: 'zine:inbox',
        origin: 'ZINE',
        url: 'https://journal.example/culture',
        creator: 'Journal',
        title: 'A new cultural history',
        summary: 'A substantial new release from the Inbox.',
      }),
      nonXDocument({
        id: 'external:science',
        origin: 'EXTERNAL',
        url: 'https://science.example/discovery',
        creator: 'Science Desk',
        title: 'A field discovery changes the record',
        summary: 'Trusted outside-lens reporting on a new discovery.',
      }),
    ];
    input.provenance.sourceStatus.xArchive = 'UNAVAILABLE';
    input.provenance.inputCounts.externalDiscoverySources = 1;
    input.provenance.sourceStatus.externalDiscovery = 'COMPLETE';
    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    if (artifact.strategy !== 'EDITORIAL_V2') throw new Error('Expected v2 artifact');
    expect(artifact.candidates).toHaveLength(2);
    expect(
      artifact.candidates.some((candidate) =>
        candidate.externalSourceIds.includes('external:science')
      )
    ).toBe(true);
    expect(
      artifact.candidates.some((candidate) => candidate.zineSourceIds.includes('zine:inbox'))
    ).toBe(true);
  });

  it('keeps generic text-only repetition out of the portfolio while preserving coherent subjects', () => {
    const input = snapshot();
    input.documents = [
      xDocument({
        id: 'x:generic-1',
        creator: 'A',
        text: 'this is who runs this account',
        position: 0,
      }),
      xDocument({
        id: 'x:generic-2',
        creator: 'B',
        text: 'this is who runs this account',
        position: 1,
      }),
      xDocument({
        id: 'x:subject-1',
        creator: 'C',
        text: 'Cerulean Festival fills the harbor with lanterns',
        position: 2,
      }),
      xDocument({
        id: 'x:subject-2',
        creator: 'D',
        text: 'Cerulean Festival brings harbor crowds tonight',
        position: 3,
      }),
    ];
    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    if (artifact.strategy !== 'EDITORIAL_V2') throw new Error('Expected v2 artifact');
    const generic = artifact.candidates.find((candidate) =>
      candidate.sourceIds.includes('x:generic-1')
    )!;
    const subject = artifact.candidates.find((candidate) =>
      candidate.sourceIds.includes('x:subject-1')
    )!;
    expect(artifact.portfolio.selectedCandidateIds).not.toContain(generic.id);
    expect(artifact.portfolio.selectedCandidateIds).toContain(subject.id);
    expect(
      artifact.portfolio.decisions.find((decision) => decision.candidateId === generic.id)?.reason
    ).toContain('recover a coherent editorial subject');
    expect(subject.score.evidenceQuality).toBeLessThanOrEqual(20);
    expect(subject.score.crossSource).toBe(0);
  });

  it('does not treat independent X voices as independent factual corroboration', () => {
    const xOnlyInput = snapshot();
    xOnlyInput.documents = [
      xDocument({
        id: 'x:claim-1',
        creator: 'A',
        text: 'Cerulean harbor report is worth reading',
        position: 0,
        link: 'https://report.example/cerulean',
      }),
      xDocument({
        id: 'x:claim-2',
        creator: 'B',
        text: 'Read the new Cerulean harbor report',
        position: 1,
        link: 'https://report.example/cerulean',
      }),
    ];
    const corroboratedInput = structuredClone(xOnlyInput);
    corroboratedInput.documents.push(
      nonXDocument({
        id: 'external:cerulean',
        origin: 'EXTERNAL',
        url: 'https://report.example/cerulean',
        creator: 'Harbor Desk',
        title: 'Cerulean harbor report',
        summary: 'The captured primary report underlying the X discussion.',
      })
    );
    const xOnly = buildEditorialCandidateArtifact(xOnlyInput, new Date(now));
    const corroborated = buildEditorialCandidateArtifact(corroboratedInput, new Date(now));
    if (xOnly.strategy !== 'EDITORIAL_V2' || corroborated.strategy !== 'EDITORIAL_V2') {
      throw new Error('Expected v2 artifact');
    }
    expect(xOnly.candidates[0]!.score.evidenceQuality).toBeLessThanOrEqual(35);
    expect(xOnly.candidates[0]!.score.crossSource).toBe(0);
    expect(corroborated.candidates[0]!.score.evidenceQuality).toBeGreaterThan(
      xOnly.candidates[0]!.score.evidenceQuality
    );
    expect(corroborated.candidates[0]!.score.crossSource).toBeGreaterThan(0);
  });

  it('selects one front-page candidate for semantically duplicate artifacts', () => {
    const input = snapshot();
    input.documents = [
      nonXDocument({
        id: 'external:cerulean-release',
        origin: 'EXTERNAL',
        url: 'https://news.example/cerulean-release',
        creator: 'News Desk',
        title: 'Cerulean Festival opens globally',
        summary: 'Reporting on the new Cerulean Festival release.',
      }),
      nonXDocument({
        id: 'zine:cerulean-guide',
        origin: 'ZINE',
        url: 'https://video.example/cerulean-guide',
        creator: 'Guide Maker',
        title: 'The true story of Cerulean Festival',
        summary: 'A saved guide to the same Cerulean Festival.',
      }),
      ...[
        ['amber', 'Amber lighthouse restoration'],
        ['copper', 'Copper orchard harvest'],
        ['indigo', 'Indigo railway timetable'],
        ['velvet', 'Velvet theater season'],
        ['granite', 'Granite bridge inspection'],
        ['willow', 'Willow kitchen cookbook'],
        ['crimson', 'Crimson telescope survey'],
      ].map(([slug, title]) =>
        nonXDocument({
          id: `external:${slug}`,
          origin: 'EXTERNAL',
          url: `https://${slug}.example/story`,
          creator: `${title} Desk`,
          title: title!,
          summary: `Independent current material about ${title!.toLocaleLowerCase()}.`,
        })
      ),
    ];
    const artifact = buildEditorialCandidateArtifact(input, new Date(now));
    if (artifact.strategy !== 'EDITORIAL_V2') throw new Error('Expected v2 artifact');
    expect(artifact.portfolio.algorithm).toBe('MMR_PORTFOLIO_V2');
    const duplicateIds = artifact.candidates
      .filter((candidate) => candidate.title.includes('Cerulean'))
      .map((candidate) => candidate.id);
    expect(
      artifact.portfolio.selectedCandidateIds.filter((id) => duplicateIds.includes(id))
    ).toHaveLength(1);
  });

  it('contains no named editorial bundle or subject-specific ranker patterns', async () => {
    const sourceText = await Bun.file(new URL('./candidates.ts', import.meta.url)).text();
    expect(sourceText).not.toMatch(
      /CONVERSATION_BUNDLES|MODEL_CONTEXT_PATTERN|AGENT_CONTROL_PATTERN/
    );
    expect(sourceText).not.toContain('named topic');
  });
});
