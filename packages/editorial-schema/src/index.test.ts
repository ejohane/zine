import { describe, expect, it } from 'vitest';
import { calculateQualityScore, finalizeDailyEdition, validateDailyEdition } from './index';

function editionFixture() {
  const now = '2026-07-11T12:00:00.000Z';
  const cited = { text: 'A supported statement.', claimIds: ['claim-1'] };
  return {
    schemaVersion: 1,
    id: 'edition-1',
    userId: 'current-user',
    editionDate: '2026-07-11',
    timezone: 'America/Chicago',
    revision: 1,
    status: 'DRAFT',
    generatedAt: now,
    window: {
      newContentAfter: '2026-07-10T12:00:00.000Z',
      through: now,
      comparisonAfter: '2026-07-04T12:00:00.000Z',
      previousEditionId: null,
      fallbackWindowUsed: true,
    },
    provenance: {
      xRunIds: ['x-run-1'],
      inputCounts: {
        xTimelineEntries: 1,
        xCanonicalPosts: 1,
        inboxItems: 0,
        recentBookmarks: 0,
        contextualBookmarks: 0,
        externalVerificationSources: 0,
      },
      sourceStatus: {
        xArchive: 'COMPLETE',
        zineInbox: 'COMPLETE',
        zineBookmarks: 'COMPLETE',
        externalVerification: 'NOT_RUN',
      },
      snapshotKey: 'snapshot-1',
      warnings: [],
    },
    headline: 'The daily edition',
    dek: 'What happened and why it matters.',
    briefing: [cited],
    stories: [
      {
        id: 'story-1',
        rank: 1,
        type: 'NEWS',
        lifecycle: 'DEVELOPING',
        title: 'A grounded story',
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
    recommendations: [
      {
        id: 'recommendation-1',
        sourceId: 'source-1',
        relatedStoryIds: ['story-1'],
        format: 'READ',
        priority: 'MUST',
        title: 'Read the source',
        reason: 'It is the primary artifact.',
        estimatedMinutes: 5,
        isOriginalSource: true,
        alreadyConsumed: false,
      },
    ],
    emergingSignals: [],
    bigPicture: cited,
    coverageNotes: [],
    sources: [
      {
        id: 'source-1',
        origin: 'EXTERNAL',
        role: 'PRIMARY',
        canonicalUrl: 'https://example.com/source',
        title: 'Source',
        creator: null,
        publisher: 'Example',
        publishedAt: now,
        xTweetId: null,
        zineItemId: null,
        zineUserItemId: null,
        contentType: 'ARTICLE',
        userState: null,
      },
    ],
    claims: [
      {
        id: 'claim-1',
        text: 'The event happened.',
        classification: 'FACT',
        confidence: 'HIGH',
        sourceIds: ['source-1'],
        verification: 'PRIMARY_SOURCE',
      },
    ],
    generation: {
      workflowVersion: '1.0.0',
      promptVersion: '1.0.0',
      model: 'gpt-5.5',
      generatorRunId: 'generator-1',
    },
    quality: {
      scores: {
        groundingAndTrust: 4.5,
        editorialJudgment: 4,
        synthesis: 4,
        personalUtility: 4,
        noveltyAndMomentum: 4,
        clarityAndEconomy: 4,
      },
      overallScore: 0,
      passed: false,
      notes: [],
    },
  };
}

describe('editorial validation', () => {
  it('calculates the weighted 100-point quality score', () => {
    expect(calculateQualityScore(editionFixture().quality.scores)).toBe(82.5);
  });

  it('finalizes a grounded, publishable edition', () => {
    const result = finalizeDailyEdition(editionFixture(), new Date('2026-07-11T12:30:00.000Z'));
    expect(result.report.valid).toBe(true);
    expect(result.edition?.status).toBe('VALIDATED');
    expect(result.edition?.quality).toMatchObject({ passed: true, overallScore: 82.5 });
  });

  it('rejects high-confidence facts based only on social signals', () => {
    const edition = editionFixture();
    edition.claims[0]!.verification = 'SOCIAL_SIGNAL_ONLY';
    const report = validateDailyEdition(edition);
    expect(report.valid).toBe(false);
    expect(report.errors.map((error) => error.code)).toContain('SOCIAL_SIGNAL_AS_FACT');
  });

  it('rejects duplicate recommendation sources', () => {
    const edition = editionFixture();
    edition.recommendations.push({ ...edition.recommendations[0]!, id: 'recommendation-2' });
    const report = validateDailyEdition(edition);
    expect(report.errors.map((error) => error.code)).toContain('DUPLICATE_RECOMMENDATION_SOURCE');
  });

  it('rejects unknown claim and source references', () => {
    const edition = editionFixture();
    edition.stories[0]!.claimIds = ['missing-claim'];
    edition.stories[0]!.sourceIds = ['missing-source'];
    const report = validateDailyEdition(edition);
    expect(report.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['UNKNOWN_CLAIM', 'UNKNOWN_SOURCE'])
    );
  });
});
