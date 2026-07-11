import { describe, expect, it } from 'bun:test';
import { DailyEditionSchema } from '@zine/editorial-schema';
import { renderEditionMarkdown } from './render';

describe('renderEditionMarkdown', () => {
  it('renders deterministic inline citations and source links', () => {
    const cited = { text: 'Grounded text.', claimIds: ['claim-1'] };
    const edition = DailyEditionSchema.parse({
      schemaVersion: 1,
      id: 'edition-1',
      userId: 'current-user',
      editionDate: '2026-07-11',
      timezone: 'America/Chicago',
      revision: 1,
      status: 'VALIDATED',
      generatedAt: '2026-07-11T12:00:00.000Z',
      window: {
        newContentAfter: '2026-07-10T12:00:00.000Z',
        through: '2026-07-11T12:00:00.000Z',
        comparisonAfter: '2026-07-04T12:00:00.000Z',
        previousEditionId: null,
        fallbackWindowUsed: true,
      },
      provenance: {
        xRunIds: [],
        inputCounts: {
          xTimelineEntries: 0,
          xCanonicalPosts: 0,
          inboxItems: 1,
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
      headline: 'Headline',
      dek: 'Dek',
      briefing: [cited],
      stories: [
        {
          id: 'story-1',
          rank: 1,
          type: 'NEWS',
          lifecycle: 'DEVELOPING',
          title: 'Story',
          lede: cited,
          whatHappened: cited,
          whyItMatters: cited,
          conversation: cited,
          editorialAnalysis: cited,
          importance: 4,
          momentum: 'HIGH',
          topics: [],
          entities: [],
          sourceIds: ['source-1'],
          claimIds: ['claim-1'],
        },
      ],
      recommendations: [],
      emergingSignals: [],
      bigPicture: cited,
      coverageNotes: [],
      sources: [
        {
          id: 'source-1',
          origin: 'ZINE',
          role: 'PRIMARY',
          canonicalUrl: 'https://example.com',
          title: 'Example',
          creator: null,
          publisher: null,
          publishedAt: null,
          xTweetId: null,
          zineItemId: 'item-1',
          zineUserItemId: 'user-item-1',
          contentType: 'ARTICLE',
          userState: 'INBOX',
        },
      ],
      claims: [
        {
          id: 'claim-1',
          text: 'Claim',
          classification: 'FACT',
          confidence: 'HIGH',
          sourceIds: ['source-1'],
          verification: 'PRIMARY_SOURCE',
        },
      ],
      generation: {
        workflowVersion: '1',
        promptVersion: '1',
        model: 'test',
        generatorRunId: 'run-1',
      },
      quality: {
        scores: {
          groundingAndTrust: 5,
          editorialJudgment: 4,
          synthesis: 4,
          personalUtility: 4,
          noveltyAndMomentum: 4,
          clarityAndEconomy: 4,
        },
        overallScore: 85,
        passed: true,
        notes: [],
      },
    });
    const markdown = renderEditionMarkdown(edition);
    expect(markdown).toContain('Grounded text. [1]');
    expect(markdown).toContain('1. [Example](https://example.com)');
  });
});
