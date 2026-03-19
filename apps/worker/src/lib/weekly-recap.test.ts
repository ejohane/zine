import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

import {
  buildWeeklyRecap,
  getWeeklyRecap,
  getWeeklyRecapWindow,
  resolveWeeklyRecapTimezone,
  toWeeklyRecapTeaser,
} from './weekly-recap';

const NOW = new Date('2026-03-17T15:00:00.000Z');
const TIMEZONE = 'America/Chicago';

describe('weekly recap', () => {
  describe('resolveWeeklyRecapTimezone', () => {
    it('falls back to UTC for invalid timezones', () => {
      expect(resolveWeeklyRecapTimezone('Mars/Olympus')).toBe('UTC');
    });

    it('accepts valid IANA timezones', () => {
      expect(resolveWeeklyRecapTimezone(TIMEZONE)).toBe(TIMEZONE);
    });
  });

  describe('getWeeklyRecapWindow', () => {
    it('builds the most recent completed week in the requested timezone across DST changes', () => {
      const window = getWeeklyRecapWindow(TIMEZONE, NOW);

      expect(window.startAt).toBe('2026-03-08T06:00:00.000Z');
      expect(window.endAt).toBe('2026-03-15T05:00:00.000Z');
      expect(window.comparisonStartAt).toBe('2026-03-01T06:00:00.000Z');
      expect(window.comparisonEndAt).toBe('2026-03-08T06:00:00.000Z');
      expect(window.label).toBe('Mar 8 - Mar 14');
    });

    it('resolves the same recap window on Sunday and Monday', () => {
      const sundayWindow = getWeeklyRecapWindow(TIMEZONE, new Date('2026-03-15T15:00:00.000Z'));
      const mondayWindow = getWeeklyRecapWindow(TIMEZONE, new Date('2026-03-16T15:00:00.000Z'));

      expect(mondayWindow).toMatchObject({
        startAt: sundayWindow.startAt,
        endAt: sundayWindow.endAt,
        comparisonStartAt: sundayWindow.comparisonStartAt,
        comparisonEndAt: sundayWindow.comparisonEndAt,
        label: sundayWindow.label,
      });
    });
  });

  describe('buildWeeklyRecap', () => {
    it('aggregates the latest completion state per recap week and uses the latest started timestamp', () => {
      const recap = buildWeeklyRecap({
        timezone: TIMEZONE,
        now: NOW,
        completionTransitions: [
          {
            event_id: 'evt-current-finished',
            user_item_id: 'ui-event-finished',
            item_id: 'item-video-current',
            event_type: 'FINISHED',
            occurred_at: Date.parse('2026-03-14T15:00:00.000Z'),
            bookmarked_at: '2026-03-13T15:00:00.000Z',
            ingested_at: '2026-03-12T15:00:00.000Z',
            title: 'Deep Work Video',
            thumbnail_url: 'https://example.com/video.jpg',
            content_type: 'VIDEO',
            provider: 'YOUTUBE',
            duration: 1800,
            reading_time_minutes: null,
            word_count: null,
            creator_id: 'creator-video',
            creator_name: 'Video Creator',
          },
          {
            event_id: 'evt-current-unfinished',
            user_item_id: 'ui-event-unfinished',
            item_id: 'item-video-unfinished',
            event_type: 'UNFINISHED',
            occurred_at: Date.parse('2026-03-14T18:00:00.000Z'),
            bookmarked_at: '2026-03-14T12:00:00.000Z',
            ingested_at: '2026-03-13T12:00:00.000Z',
            title: 'Undo Finish Video',
            thumbnail_url: 'https://example.com/undo.jpg',
            content_type: 'VIDEO',
            provider: 'YOUTUBE',
            duration: 1200,
            reading_time_minutes: null,
            word_count: null,
            creator_id: 'creator-undo',
            creator_name: 'Undo Creator',
          },
          {
            event_id: 'evt-current-finished-then-undone',
            user_item_id: 'ui-event-unfinished',
            item_id: 'item-video-unfinished',
            event_type: 'FINISHED',
            occurred_at: Date.parse('2026-03-14T17:00:00.000Z'),
            bookmarked_at: '2026-03-14T12:00:00.000Z',
            ingested_at: '2026-03-13T12:00:00.000Z',
            title: 'Undo Finish Video',
            thumbnail_url: 'https://example.com/undo.jpg',
            content_type: 'VIDEO',
            provider: 'YOUTUBE',
            duration: 1200,
            reading_time_minutes: null,
            word_count: null,
            creator_id: 'creator-undo',
            creator_name: 'Undo Creator',
          },
          {
            event_id: 'evt-comparison-finished',
            user_item_id: 'ui-event-comparison',
            item_id: 'item-article-comparison',
            event_type: 'FINISHED',
            occurred_at: Date.parse('2026-03-06T16:00:00.000Z'),
            bookmarked_at: '2026-03-05T16:00:00.000Z',
            ingested_at: '2026-03-05T12:00:00.000Z',
            title: 'Comparison Article',
            thumbnail_url: null,
            content_type: 'ARTICLE',
            provider: 'RSS',
            duration: null,
            reading_time_minutes: 12,
            word_count: null,
            creator_id: 'creator-article',
            creator_name: 'Article Creator',
          },
        ],
        legacyCompletedRows: [
          {
            user_item_id: 'ui-legacy-current',
            item_id: 'item-legacy-current',
            finished_at: '2026-03-12T14:00:00.000Z',
            bookmarked_at: '2026-03-10T14:00:00.000Z',
            ingested_at: '2026-03-09T14:00:00.000Z',
            title: 'Legacy Read',
            thumbnail_url: null,
            content_type: 'ARTICLE',
            provider: 'WEB',
            duration: null,
            reading_time_minutes: null,
            word_count: 660,
            creator_id: 'creator-legacy',
            creator_name: 'Legacy Creator',
          },
          {
            user_item_id: 'ui-event-finished',
            item_id: 'item-video-current',
            finished_at: '2026-03-14T15:00:00.000Z',
            bookmarked_at: '2026-03-13T15:00:00.000Z',
            ingested_at: '2026-03-12T15:00:00.000Z',
            title: 'Duplicate Event Backed Item',
            thumbnail_url: null,
            content_type: 'VIDEO',
            provider: 'YOUTUBE',
            duration: 1800,
            reading_time_minutes: null,
            word_count: null,
            creator_id: 'creator-video',
            creator_name: 'Video Creator',
          },
          {
            user_item_id: 'ui-event-unfinished',
            item_id: 'item-video-unfinished',
            finished_at: '2026-03-14T17:00:00.000Z',
            bookmarked_at: '2026-03-14T12:00:00.000Z',
            ingested_at: '2026-03-13T12:00:00.000Z',
            title: 'Legacy Undo Candidate',
            thumbnail_url: null,
            content_type: 'VIDEO',
            provider: 'YOUTUBE',
            duration: 1200,
            reading_time_minutes: null,
            word_count: null,
            creator_id: 'creator-undo',
            creator_name: 'Undo Creator',
          },
        ],
        startedSnapshotRows: [
          {
            user_item_id: 'ui-started',
            item_id: 'item-started',
            title: 'Started Podcast',
            thumbnail_url: null,
            content_type: 'PODCAST',
            provider: 'SPOTIFY',
            creator_id: 'creator-podcast',
            creator_name: 'Podcast Creator',
            last_opened_at: '2026-03-14T04:00:00.000Z',
            progress_position: 600,
            progress_duration: 1800,
            progress_updated_at: '2026-03-13T03:05:00.000Z',
            last_touched_at: '2026-03-14T04:00:00.000Z',
          },
          {
            user_item_id: 'ui-event-finished',
            item_id: 'item-video-current',
            title: 'Should be excluded from started',
            thumbnail_url: null,
            content_type: 'VIDEO',
            provider: 'YOUTUBE',
            creator_id: 'creator-video',
            creator_name: 'Video Creator',
            last_opened_at: '2026-03-14T20:00:00.000Z',
            progress_position: null,
            progress_duration: null,
            progress_updated_at: null,
            last_touched_at: '2026-03-14T20:00:00.000Z',
          },
        ],
      });

      expect(recap.totals.completedCount).toBe(2);
      expect(recap.totals.startedCount).toBe(1);
      expect(recap.totals.estimatedMinutesByMode).toEqual({
        reading: 3,
        watching: 30,
        listening: 0,
      });
      expect(recap.totals.contentTypeCounts).toEqual({
        article: 1,
        post: 0,
        video: 1,
        podcast: 0,
      });
      expect(recap.headline.completedDeltaPct).toBe(100);
      expect(recap.headline.estimatedMinutesDeltaPct).toBe(175);
      expect(recap.headline.dominantMode).toBe('WATCHING');
      expect(recap.highlights.longestCompletedItem?.title).toBe('Deep Work Video');
      expect(recap.highlights.topCreators[0]).toEqual({
        creatorId: 'creator-video',
        creator: 'Video Creator',
        completedCount: 1,
        estimatedMinutes: 30,
      });
      expect(recap.highlights.topProviders[0]).toEqual({
        provider: 'YOUTUBE',
        completedCount: 1,
        estimatedMinutes: 30,
      });
      expect(recap.highlights.medianBookmarkToFinishHours).toBe(36);
      expect(recap.startedItems).toHaveLength(1);
      expect(recap.startedItems[0]).toMatchObject({
        userItemId: 'ui-started',
        title: 'Started Podcast',
        lastTouchedAt: '2026-03-14T04:00:00.000Z',
        progressPercent: 33,
      });
      expect(recap.completedItems.map((item) => item.userItemId)).toEqual([
        'ui-event-finished',
        'ui-legacy-current',
      ]);
      expect(recap.trend.find((bucket) => bucket.date === '2026-03-14')).toMatchObject({
        completedCount: 1,
        estimatedMinutes: 30,
        watchingMinutes: 30,
      });
      expect(recap.trend.find((bucket) => bucket.date === '2026-03-12')).toMatchObject({
        completedCount: 1,
        estimatedMinutes: 3,
        readingMinutes: 3,
      });

      const teaser = toWeeklyRecapTeaser(recap);
      expect(teaser.headline).toBe('You finished 2 things last week');
      expect(teaser.supportingLine).toBe('3m reading, 30m watching');
      expect(teaser.trendLabel).toBe('Up 175% vs last week');
    });

    it('returns an empty recap when the user has no recent activity', () => {
      const recap = buildWeeklyRecap({
        timezone: TIMEZONE,
        now: NOW,
        completionTransitions: [],
        legacyCompletedRows: [],
        startedSnapshotRows: [],
      });

      expect(recap.totals.completedCount).toBe(0);
      expect(recap.totals.startedCount).toBe(0);
      expect(recap.headline.dominantMode).toBe('NONE');
      expect(toWeeklyRecapTeaser(recap)).toMatchObject({
        headline: 'No completed items last week',
        supportingLine: 'No estimated time yet',
        trendLabel: 'No change vs last week',
      });
    });
  });

  describe('getWeeklyRecap', () => {
    it('queries D1 and returns a mobile-ready recap payload', async () => {
      const observedBindings: Array<Array<string | number>> = [];
      const fakeD1 = {
        prepare(sqlText: string) {
          return {
            bind(...bindings: Array<string | number>) {
              observedBindings.push(bindings);
              return {
                all: async () => {
                  if (sqlText.includes('FROM user_item_consumption_events')) {
                    return {
                      results: [
                        {
                          event_id: 'evt-1',
                          user_item_id: 'ui-1',
                          item_id: 'item-1',
                          event_type: 'FINISHED',
                          occurred_at: Date.parse('2026-03-14T01:00:00.000Z'),
                          bookmarked_at: '2026-03-13T01:00:00.000Z',
                          ingested_at: '2026-03-12T01:00:00.000Z',
                          title: 'Mock Video',
                          thumbnail_url: null,
                          content_type: 'VIDEO',
                          provider: 'YOUTUBE',
                          duration: 900,
                          reading_time_minutes: null,
                          word_count: null,
                          creator_id: 'creator-1',
                          creator_name: 'Mock Creator',
                        },
                      ],
                    };
                  }

                  return { results: [] };
                },
              };
            },
          };
        },
      } as unknown as D1Database;

      const recap = await getWeeklyRecap({
        d1: fakeD1,
        userId: 'user-1',
        timezone: TIMEZONE,
        now: NOW,
      });

      expect(recap.totals.completedCount).toBe(1);
      expect(recap.headline.estimatedTotalMinutes).toBe(15);
      expect(recap.completedItems[0]).toMatchObject({
        userItemId: 'ui-1',
        title: 'Mock Video',
      });
      expect(observedBindings[0]?.[0]).toBe('user-1');
    });
  });
});
