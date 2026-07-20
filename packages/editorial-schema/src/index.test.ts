import { describe, expect, it } from 'vitest';
import {
  CreateEditorialExperimentSchema,
  EditorialCandidateFramingSchema,
  EditorialExperimentSchema,
  FailEditorialRunSchema,
  EditorialFeedbackProfileSchema,
  ReviewEditorialExperimentSchema,
  PublishEditorialEditionSchema,
  StartEditorialRunSchema,
  calculateQualityScore,
  finalizeDailyEdition,
  normalizeEditorialFeedbackCanonicalUrl,
  normalizeEditorialFeedbackCreatorKey,
  normalizeEditorialFeedbackTopicTokens,
  validateDailyEdition,
} from './index';

describe('editorial experiment contracts', () => {
  it('requires a concrete brief before an experiment can be created', () => {
    const brief = {
      id: 'experiment-1',
      title: 'Breadth versus engagement',
      editionDate: '2026-07-19',
      hypothesis: 'A broader portfolio will make the front page more useful.',
      changeSummary: 'Reduce the influence of raw X engagement.',
      desiredOutcomes: ['A non-technology story can lead when evidence supports it.'],
      guardrails: ['Do not weaken source verification.'],
    };
    expect(CreateEditorialExperimentSchema.safeParse(brief).success).toBe(true);
    expect(
      CreateEditorialExperimentSchema.safeParse({ ...brief, desiredOutcomes: [] }).success
    ).toBe(false);
  });

  it('accepts an immutable phone review and a resumable experiment read model', () => {
    expect(
      ReviewEditorialExperimentSchema.safeParse({
        clientEventId: 'review-1',
        preference: 'B',
        notes: 'The lead and recommendation mix are stronger.',
      }).success
    ).toBe(true);
    expect(
      EditorialExperimentSchema.safeParse({
        id: 'experiment-1',
        title: 'Breadth versus engagement',
        editionDate: '2026-07-19',
        status: 'READY_FOR_REVIEW',
        hypothesis: 'A broader portfolio will make the front page more useful.',
        changeSummary: 'Reduce the influence of raw X engagement.',
        desiredOutcomes: ['A non-technology story can lead when evidence supports it.'],
        guardrails: ['Do not weaken source verification.'],
        variants: [
          {
            id: 'variant-a',
            label: 'A',
            name: 'Control',
            description: 'Current production behavior.',
            editionId: 'edition-a',
            headline: 'Control edition',
            qualityScore: 84,
            contentHash: 'a'.repeat(64),
            createdAt: '2026-07-19T12:00:00.000Z',
          },
        ],
        latestReview: null,
        winningVariantId: null,
        promotedEditionId: null,
        failureMessage: null,
        abandonmentReason: null,
        lockedAt: '2026-07-19T11:00:00.000Z',
        decidedAt: null,
        promotedAt: null,
        createdAt: '2026-07-19T10:00:00.000Z',
        updatedAt: '2026-07-19T12:00:00.000Z',
        nextAction: 'Review both variants on the phone.',
      }).success
    ).toBe(true);
  });
});

describe('editorial candidate framing', () => {
  it('retains the extractive methods and exact source pointers', () => {
    expect(
      EditorialCandidateFramingSchema.safeParse({
        model: 'EXTRACTIVE_EDITORIAL_V1',
        headlineMethod: 'EXTRACTIVE_POST',
        summaryMethod: 'EXTRACTIVE_CONTEXT',
        headlineSourceIds: ['x:1'],
        summarySourceIds: ['x:1'],
      }).success
    ).toBe(true);
    expect(
      EditorialCandidateFramingSchema.safeParse({
        model: 'EXTRACTIVE_EDITORIAL_V1',
        headlineMethod: 'GENERATED',
        summaryMethod: 'EXTRACTIVE_CONTEXT',
        headlineSourceIds: [],
        summarySourceIds: ['x:1'],
      }).success
    ).toBe(false);
  });
});

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
  it('normalizes feedback context consistently and validates its bounded profile', () => {
    expect(normalizeEditorialFeedbackTopicTokens(['AI Agents', 'Testing-loops'])).toEqual([
      'agent',
      'ai',
      'loop',
      'testing',
    ]);
    expect(normalizeEditorialFeedbackCreatorKey(' @Alice   Example ')).toBe('alice example');
    expect(
      normalizeEditorialFeedbackCanonicalUrl(
        'https://EXAMPLE.com/agents/?utm_source=x&b=2&a=1#section'
      )
    ).toBe('https://example.com/agents?a=1&b=2');
    expect(
      normalizeEditorialFeedbackCanonicalUrl(
        'https://mobile.twitter.com/alice/status/123?ref_src=twsrc%5Etfw'
      )
    ).toBe('https://x.com/alice/status/123');
    expect(
      EditorialFeedbackProfileSchema.safeParse({
        schemaVersion: 1,
        generatedAt: '2026-07-19T12:00:00.000Z',
        lookbackDays: 180,
        halfLifeDays: 60,
        maxEvents: 500,
        eventCount: 1,
        truncated: false,
        topics: [
          {
            key: 'agent',
            affinity: 1,
            novelty: 0,
            signalCounts: {
              moreLikeThis: 1,
              lessLikeThis: 0,
              dismissed: 0,
              alreadyKnew: 0,
            },
            lastSignaledAt: '2026-07-18T12:00:00.000Z',
          },
        ],
        creators: [],
        canonicalUrls: [],
        sourceIds: [],
      }).success
    ).toBe(true);
  });

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

  it('rejects impossible calendar dates and reversed editorial windows', () => {
    const impossibleDate = editionFixture();
    impossibleDate.editionDate = '2026-02-30';
    expect(validateDailyEdition(impossibleDate).errors.map((error) => error.code)).toContain(
      'SCHEMA_INVALID'
    );

    const reversedWindow = editionFixture();
    reversedWindow.window.newContentAfter = '2026-07-12T12:00:00.000Z';
    expect(validateDailyEdition(reversedWindow).errors.map((error) => error.code)).toContain(
      'SCHEMA_INVALID'
    );
  });

  it('validates strict editorial run start and failure contracts', () => {
    expect(
      StartEditorialRunSchema.parse({
        id: 'run-1',
        editionDate: '2026-07-11',
        workflowVersion: 'x-led-v1',
        promptVersion: 'daily-v1',
        model: 'gpt-5.6',
      })
    ).toMatchObject({ id: 'run-1', editionDate: '2026-07-11' });
    expect(
      StartEditorialRunSchema.safeParse({
        id: 'run-1',
        editionDate: '2026-02-30',
        workflowVersion: 'x-led-v1',
        promptVersion: 'daily-v1',
        model: 'gpt-5.6',
      }).success
    ).toBe(false);
    expect(
      FailEditorialRunSchema.safeParse({ stage: 'VALIDATE', message: 'Grounding failed' }).success
    ).toBe(true);
    expect(FailEditorialRunSchema.safeParse({ stage: 'UNKNOWN', message: 'Failed' }).success).toBe(
      false
    );
  });

  it('rejects invalid timezones and mismatched snapshot identity at publication', () => {
    const edition = editionFixture();
    edition.status = 'VALIDATED';
    edition.quality.overallScore = 82.5;
    edition.quality.passed = true;
    const snapshot = {
      schemaVersion: 1,
      id: 'snapshot-1',
      generatedAt: edition.generatedAt,
      editionDate: edition.editionDate,
      timezone: edition.timezone,
      window: edition.window,
      provenance: edition.provenance,
      documents: [
        {
          source: edition.sources[0],
          observedAt: edition.generatedAt,
          firstSeenAt: edition.generatedAt,
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
    };
    const validation = validateDailyEdition(edition, new Date(edition.generatedAt));
    const body = { edition, snapshot, validation, markdown: '# Edition' };

    expect(PublishEditorialEditionSchema.safeParse(body).success).toBe(true);
    expect(
      PublishEditorialEditionSchema.safeParse({
        ...body,
        snapshot: { ...snapshot, editionDate: '2026-07-12' },
      }).success
    ).toBe(false);
    expect(
      PublishEditorialEditionSchema.safeParse({
        ...body,
        candidateArtifact: {
          schemaVersion: 2,
          id: 'candidates-v2',
          snapshotId: snapshot.id,
          editionDate: snapshot.editionDate,
          generatedAt: edition.generatedAt,
          strategy: 'EDITORIAL_V2',
          featureModel: 'CORPUS_TFIDF_V1',
          weights: {
            conversationBreadth: 0.16,
            attention: 0.12,
            recommendationStrength: 0.08,
            momentum: 0.1,
            freshness: 0.1,
            personalRelevance: 0.12,
            evidenceQuality: 0.12,
            crossSource: 0.08,
            historicalNovelty: 0.08,
            serendipity: 0.04,
          },
          provenance: snapshot.provenance,
          clusters: [
            {
              id: 'cluster-v2',
              key: 'url:https://example.com/source',
              title: 'Source',
              firstSeenAt: edition.generatedAt,
              lastSeenAt: edition.generatedAt,
              topics: ['source'],
              canonicalUrls: ['https://example.com/source'],
              sourceIds: ['source-1'],
              xSourceIds: [],
              zineSourceIds: [],
              externalSourceIds: ['source-1'],
              featureModel: 'CORPUS_TFIDF_V1',
            },
          ],
          candidates: [
            {
              id: 'candidate-v2',
              clusterId: 'cluster-v2',
              rank: 1,
              title: 'Source',
              summary: 'One outside-lens source formed this candidate.',
              canonicalUrl: 'https://example.com/source',
              sourceIds: ['source-1'],
              representativeSourceIds: ['source-1'],
              xSourceIds: [],
              zineSourceIds: [],
              externalSourceIds: ['source-1'],
              zineMatches: [],
              independentVoiceCount: 1,
              sourceCount: 1,
              xPostCount: 0,
              xRunCount: 0,
              explicitRecommendationCount: 0,
              linkedSourceCount: 1,
              historicalSimilarity: 0,
              score: {
                conversationBreadth: 50,
                attention: 0,
                recommendationStrength: 50,
                momentum: 0,
                freshness: 50,
                personalRelevance: 0,
                evidenceQuality: 50,
                crossSource: 50,
                historicalNovelty: 100,
                serendipity: 50,
                penalties: 0,
                feedbackAdjustment: 0,
                total: 50,
              },
              scoreReasons: ['Topic-neutral evidence formed this candidate.'],
            },
          ],
          portfolio: {
            algorithm: 'MMR_PORTFOLIO_V1',
            targetSize: 1,
            selectedCandidateIds: ['candidate-v2'],
            decisions: [
              {
                candidateId: 'candidate-v2',
                selected: true,
                portfolioRank: 1,
                selectionScore: 50,
                redundancyPenalty: 0,
                sourceConcentrationPenalty: 0,
                historicalRepeatPenalty: 0,
                reason: 'Selected on evidence strength.',
              },
            ],
            editorialOverrides: [],
            diagnostics: {
              selectedCount: 1,
              meanPairwiseSimilarity: 0,
              maxPairwiseSimilarity: 0,
              corpusTopicConcentration: 1,
              selectedTopicConcentration: 1,
              uniqueCreators: 1,
              uniqueDomains: 1,
              historicalRepeatRiskCount: 0,
              originCounts: { x: 0, zine: 0, external: 1 },
            },
          },
          coverageNotes: [],
        },
      }).success
    ).toBe(true);
    expect(
      PublishEditorialEditionSchema.safeParse({
        ...body,
        edition: { ...edition, timezone: 'Chicago' },
        snapshot: { ...snapshot, timezone: 'Chicago' },
      }).success
    ).toBe(false);
    expect(
      PublishEditorialEditionSchema.safeParse({
        ...body,
        candidateArtifact: {
          schemaVersion: 1,
          id: 'candidates-1',
          snapshotId: snapshot.id,
          editionDate: snapshot.editionDate,
          generatedAt: edition.generatedAt,
          strategy: 'X_LED_V1',
          weights: {
            xConversation: 0.24,
            attention: 0.2,
            endorsement: 0.15,
            momentum: 0.1,
            novelty: 0.08,
            zineResonance: 0.15,
            sourceQuality: 0.08,
          },
          provenance: snapshot.provenance,
          clusters: [
            {
              id: 'cluster-1',
              key: 'cluster',
              title: 'Cluster',
              firstSeenAt: edition.generatedAt,
              lastSeenAt: edition.generatedAt,
              topics: [],
              canonicalUrls: [],
              xSourceIds: ['missing-x-source'],
              zineSourceIds: [],
            },
          ],
          candidates: [],
          coverageNotes: [],
        },
      }).success
    ).toBe(false);
  });
});
