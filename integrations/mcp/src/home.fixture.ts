import { validateDailyEdition } from '@zine/editorial-schema';

export function homeBundle() {
  const generatedAt = '2026-07-19T12:00:00.000Z';
  const source = {
    id: 'source-1',
    origin: 'EXTERNAL',
    role: 'PRIMARY',
    canonicalUrl: 'https://example.com/source',
    title: 'Source',
    creator: null,
    publisher: 'Example',
    publishedAt: generatedAt,
    xTweetId: null,
    zineItemId: null,
    zineUserItemId: null,
    contentType: 'ARTICLE',
    userState: null,
  } as const;
  const cited = { text: 'Supported.', claimIds: ['claim-1'] };
  const provenance = {
    xRunIds: ['x-run-1'],
    inputCounts: {
      xTimelineEntries: 1,
      xCanonicalPosts: 1,
      inboxItems: 0,
      recentBookmarks: 0,
      contextualBookmarks: 0,
      externalVerificationSources: 1,
    },
    sourceStatus: {
      xArchive: 'COMPLETE',
      zineInbox: 'COMPLETE',
      zineBookmarks: 'COMPLETE',
      externalVerification: 'COMPLETE',
    },
    snapshotKey: 'snapshot-1',
    warnings: [],
  } as const;
  const window = {
    newContentAfter: '2026-07-18T12:00:00.000Z',
    through: generatedAt,
    comparisonAfter: '2026-07-12T12:00:00.000Z',
    previousEditionId: null,
    fallbackWindowUsed: true,
  };
  const edition = {
    schemaVersion: 1,
    id: 'edition-1',
    userId: 'user-1',
    editionDate: '2026-07-19',
    timezone: 'America/Chicago',
    revision: 1,
    status: 'VALIDATED',
    generatedAt,
    window,
    provenance,
    headline: 'Daily edition',
    dek: 'What matters today.',
    briefing: [cited],
    stories: [
      {
        id: 'story-1',
        rank: 1,
        type: 'NEWS',
        lifecycle: 'DEVELOPING',
        title: 'A story',
        lede: cited,
        whatHappened: cited,
        whyItMatters: cited,
        conversation: cited,
        editorialAnalysis: cited,
        importance: 4,
        momentum: 'HIGH',
        topics: ['technology'],
        entities: [],
        sourceIds: ['source-1'],
        claimIds: ['claim-1'],
      },
    ],
    recommendations: [],
    emergingSignals: [],
    bigPicture: cited,
    coverageNotes: [],
    sources: [source],
    claims: [
      {
        id: 'claim-1',
        text: 'Supported.',
        classification: 'FACT',
        confidence: 'HIGH',
        sourceIds: ['source-1'],
        verification: 'PRIMARY_SOURCE',
      },
    ],
    generation: {
      workflowVersion: 'x-led-v1',
      promptVersion: 'daily-v1',
      model: 'gpt-5.6',
      generatorRunId: 'run-edition-1',
    },
    quality: {
      scores: {
        groundingAndTrust: 4,
        editorialJudgment: 4,
        synthesis: 4,
        personalUtility: 4,
        noveltyAndMomentum: 4,
        clarityAndEconomy: 4,
      },
      overallScore: 80,
      passed: true,
      notes: [],
    },
  } as const;
  const snapshot = {
    schemaVersion: 1,
    id: 'snapshot-1',
    generatedAt,
    editionDate: edition.editionDate,
    timezone: edition.timezone,
    window,
    provenance,
    documents: [
      {
        source,
        observedAt: generatedAt,
        firstSeenAt: generatedAt,
        text: null,
        summary: null,
        timelinePosition: null,
        engagement: null,
        links: [],
        signals: {
          ingestedAt: null,
          bookmarkedAt: null,
          lastOpenedAt: null,
          isFinished: false,
          tags: [],
        },
      },
    ],
  } as const;
  const validation = validateDailyEdition(edition, new Date(generatedAt));
  return {
    edition,
    snapshot,
    validation,
    markdown: '# Daily edition\n',
  };
}
