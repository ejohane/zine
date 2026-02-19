/**
 * Content Transformers
 *
 * Transforms provider-specific content (YouTube videos, Spotify episodes)
 * into canonical Zine items. These functions are used by the ingestion pipeline
 * to normalize content from different sources.
 *
 * @see /features/subscriptions/backend-spec.md - Section 4.2: Item Transformation
 */

import { ContentType, Provider } from '@zine/shared';
import { ulid } from 'ulid';
import { parseSpotifyDate } from '../lib/timestamps';

// ============================================================================
// HTML Entity Decoding
// ============================================================================

/**
 * Common HTML entity mappings for decoding API responses.
 * Spotify and YouTube APIs often return HTML-encoded strings.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#47;': '/',
};

/**
 * Decode HTML entities in a string.
 * Handles both named entities (&amp;) and numeric entities (&#x27;, &#39;).
 */
function decodeHtmlEntities(text: string): string {
  // First, replace known named/numeric entities
  let decoded = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.split(entity).join(char);
  }

  // Handle remaining numeric entities (&#xHH; and &#DDD;)
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

  return decoded;
}

function stripHtmlTags(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSummaryText(summary?: string): string | undefined {
  if (!summary) return undefined;
  const decoded = decodeHtmlEntities(summary);
  const stripped = stripHtmlTags(decoded);
  return stripped.length > 0 ? stripped : undefined;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a new item to be inserted into the items table.
 * Uses Unix milliseconds for timestamps (matches new tables convention).
 */
export interface NewItem {
  id: string;
  contentType: ContentType;
  provider: Provider;
  providerId: string;
  canonicalUrl: string;
  title: string;
  description?: string;
  creator: string;
  creatorId?: string;
  creatorImageUrl?: string; // Channel/show/podcast image (distinct from episode thumbnail)
  imageUrl?: string;
  durationSeconds?: number;
  publishedAt: number; // Unix ms
  createdAt: number; // Unix ms
}

/**
 * Custom error for transformation failures.
 * Thrown when required fields are missing or invalid.
 */
export class TransformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransformError';
  }
}

// ============================================================================
// YouTube Transformer
// ============================================================================

/**
 * YouTube Playlist Item structure from the YouTube Data API v3.
 * This represents a video in a channel's uploads playlist.
 *
 * @see https://developers.google.com/youtube/v3/docs/playlistItems
 */
interface YouTubePlaylistItem {
  contentDetails?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string; // ISO8601 timestamp
    thumbnails?: {
      high?: { url?: string };
      default?: { url?: string };
    };
  };
  /**
   * Duration in seconds, enriched by polling layer after fetching via videos.list API.
   * This is NOT from the playlistItems API directly - we add it before transformation.
   * undefined = duration unknown (API error or not fetched)
   */
  durationSeconds?: number;
}

/**
 * Transform a YouTube playlist item into a canonical Zine item.
 *
 * Maps YouTube-specific fields to our unified schema:
 * - videoId → providerId
 * - channelTitle → creator
 * - channelId → creatorId
 * - thumbnails.high.url → imageUrl (falls back to default)
 *
 * @param playlistItem - Raw YouTube playlist item from API
 * @param channelImageUrl - Optional channel avatar/image URL (from subscription context)
 * @returns NewItem ready for database insertion
 * @throws TransformError if videoId is missing
 */
export function transformYouTubeVideo(
  playlistItem: YouTubePlaylistItem,
  channelImageUrl?: string
): NewItem {
  const videoId = playlistItem.contentDetails?.videoId;
  if (!videoId) {
    throw new TransformError('YouTube video missing videoId');
  }

  const snippet = playlistItem.snippet || {};
  const now = Date.now();

  return {
    id: ulid(),
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    providerId: videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: decodeHtmlEntities(snippet.title || 'Untitled'),
    description: snippet.description ? decodeHtmlEntities(snippet.description) : undefined,
    creator: decodeHtmlEntities(snippet.channelTitle || 'Unknown'),
    creatorId: snippet.channelId,
    creatorImageUrl: channelImageUrl,
    imageUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
    durationSeconds: playlistItem.durationSeconds,
    publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt).getTime() : now,
    createdAt: now,
  };
}

// ============================================================================
// Spotify Transformer
// ============================================================================

/**
 * Spotify Episode structure from the Spotify Web API.
 *
 * @see https://developer.spotify.com/documentation/web-api/reference/get-a-shows-episodes
 */
interface SpotifyEpisode {
  id: string;
  name: string;
  description?: string;
  release_date: string; // Can be YYYY, YYYY-MM, or YYYY-MM-DD
  duration_ms: number;
  external_urls: { spotify: string };
  images?: { url: string }[];
}

/**
 * Transform a Spotify episode into a canonical Zine item.
 *
 * Maps Spotify-specific fields to our unified schema:
 * - id → providerId
 * - name → title
 * - external_urls.spotify → canonicalUrl
 * - duration_ms → durationSeconds (converted)
 * - images[0].url → imageUrl
 *
 * Note: The showName and showImageUrl must be passed in since episodes don't include
 * the parent show details directly.
 *
 * @param episode - Raw Spotify episode from API
 * @param showName - Name of the podcast show (from parent context)
 * @param showImageUrl - Image URL of the podcast show (from parent context)
 * @returns NewItem ready for database insertion
 * @throws TransformError if episode id is missing
 */
export function transformSpotifyEpisode(
  episode: SpotifyEpisode,
  showName: string,
  showImageUrl?: string
): NewItem {
  if (!episode.id) {
    throw new TransformError('Spotify episode missing id');
  }

  const now = Date.now();

  // Parse Spotify's variable date format
  const publishedAt = parseSpotifyDate(episode.release_date);

  return {
    id: ulid(),
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    providerId: episode.id,
    canonicalUrl: episode.external_urls.spotify,
    title: decodeHtmlEntities(episode.name),
    description: episode.description ? decodeHtmlEntities(episode.description) : undefined,
    creator: decodeHtmlEntities(showName),
    creatorImageUrl: showImageUrl,
    imageUrl: episode.images?.[0]?.url,
    durationSeconds: Math.floor(episode.duration_ms / 1000),
    publishedAt,
    createdAt: now,
  };
}

// ============================================================================
// RSS Transformer
// ============================================================================

export interface RssEntryForTransform {
  providerId: string;
  canonicalUrl: string;
  title: string;
  summary?: string;
  creator?: string;
  creatorImageUrl?: string;
  imageUrl?: string;
  publishedAt?: number;
}

/**
 * Transform a normalized RSS entry into a canonical Zine item.
 */
export function transformRssEntry(entry: RssEntryForTransform): NewItem {
  if (!entry.providerId) {
    throw new TransformError('RSS entry missing providerId');
  }

  if (!entry.canonicalUrl) {
    throw new TransformError('RSS entry missing canonicalUrl');
  }

  const now = Date.now();

  return {
    id: ulid(),
    contentType: ContentType.ARTICLE,
    provider: Provider.RSS,
    providerId: entry.providerId,
    canonicalUrl: entry.canonicalUrl,
    title: decodeHtmlEntities(entry.title || 'Untitled'),
    description: normalizeSummaryText(entry.summary),
    creator: decodeHtmlEntities(entry.creator || 'Unknown'),
    creatorImageUrl: entry.creatorImageUrl,
    imageUrl: entry.imageUrl,
    publishedAt: entry.publishedAt ?? now,
    createdAt: now,
  };
}
