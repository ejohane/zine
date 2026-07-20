import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { replayEditorialDirectory } from './replay';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('replayEditorialDirectory', () => {
  it('replays retained snapshots into deterministic portfolio diagnostics', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zine-editorial-replay-'));
    temporaryDirectories.push(directory);
    const dayDirectory = join(directory, '2026-07-18');
    await mkdir(dayDirectory);
    await Bun.write(
      join(dayDirectory, 'snapshot.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'snapshot-replay',
        generatedAt: '2026-07-18T12:00:00.000Z',
        editionDate: '2026-07-18',
        timezone: 'America/Chicago',
        window: {
          newContentAfter: '2026-07-17T12:00:00.000Z',
          through: '2026-07-18T12:00:00.000Z',
          comparisonAfter: '2026-07-11T12:00:00.000Z',
          previousEditionId: null,
          fallbackWindowUsed: true,
        },
        provenance: {
          xRunIds: [],
          inputCounts: {
            xTimelineEntries: 0,
            xCanonicalPosts: 0,
            inboxItems: 0,
            recentBookmarks: 0,
            contextualBookmarks: 0,
            externalVerificationSources: 0,
            externalDiscoverySources: 1,
          },
          sourceStatus: {
            xArchive: 'UNAVAILABLE',
            zineInbox: 'COMPLETE',
            zineBookmarks: 'COMPLETE',
            externalVerification: 'NOT_RUN',
            externalDiscovery: 'COMPLETE',
          },
          snapshotKey: 'snapshot.json',
          warnings: [],
        },
        documents: [
          {
            source: {
              id: 'external:one',
              origin: 'EXTERNAL',
              role: 'REPORTING',
              canonicalUrl: 'https://example.com/story',
              title: 'A discovery outside the timeline',
              creator: 'Example Desk',
              publisher: 'Example',
              publishedAt: '2026-07-18T10:00:00.000Z',
              xTweetId: null,
              zineItemId: null,
              zineUserItemId: null,
              contentType: 'ARTICLE',
              userState: null,
            },
            observedAt: '2026-07-18T11:00:00.000Z',
            firstSeenAt: '2026-07-18T11:00:00.000Z',
            text: null,
            summary: 'Substantial reporting from a trusted outside source.',
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
      })
    );

    const report = await replayEditorialDirectory(directory, new Date('2026-07-19T12:00:00.000Z'));
    expect(report).toMatchObject({
      schemaVersion: 1,
      generatedAt: '2026-07-19T12:00:00.000Z',
      snapshots: 1,
      rows: [
        {
          editionDate: '2026-07-18',
          previousStrategy: null,
          v2CandidateCount: 1,
          selectedCount: 1,
          originCounts: { x: 0, zine: 0, external: 1 },
        },
      ],
    });
  });
});
