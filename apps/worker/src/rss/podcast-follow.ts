import type { PodcastShowResolution } from './podcast-resolver';
import { hashString } from './url';

interface ExistingPodcastFeed {
  id: string;
  title: string | null;
  status: string;
  feedType: string;
  baselineEntryIdsJson: string | null;
  lastPolledAt: number | null;
  lastSuccessAt: number | null;
  etag: string | null;
  lastModified: string | null;
}

function baselineCount(value: string | null, fallback: number): number {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry === 'string').length
      : fallback;
  } catch {
    return fallback;
  }
}

export function buildPodcastFollowWrite(
  existing: ExistingPodcastFeed | undefined,
  resolution: PodcastShowResolution,
  now: number
) {
  if (
    existing?.status === 'ACTIVE' &&
    existing.feedType === 'PODCAST' &&
    existing.baselineEntryIdsJson != null
  ) {
    return {
      values: null,
      title: existing.title ?? resolution.title,
      status: existing.status,
      baselineCount: baselineCount(
        existing.baselineEntryIdsJson,
        resolution.baselineEntryIds.length
      ),
    };
  }

  return {
    values: {
      feedUrl: resolution.feedUrl,
      feedUrlHash: hashString(resolution.feedUrl),
      title: resolution.title,
      description: resolution.description,
      siteUrl: resolution.siteUrl,
      imageUrl: resolution.artworkUrl,
      feedType: 'PODCAST' as const,
      baselineEntryIdsJson: JSON.stringify(resolution.baselineEntryIds),
      sourceUrl: resolution.sourceUrl,
      sourcePlayer: resolution.sourcePlayer,
      status: 'ACTIVE' as const,
      lastPolledAt: now,
      lastSuccessAt: now,
      lastErrorAt: null,
      lastError: null,
      errorCount: 0,
      updatedAt: now,
    },
    title: resolution.title,
    status: 'ACTIVE',
    baselineCount: resolution.baselineEntryIds.length,
  };
}
