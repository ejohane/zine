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
 * @returns NewItem ready for database insertion
 * @throws TransformError if videoId is missing
 */
export function transformYouTubeVideo(playlistItem: YouTubePlaylistItem): NewItem {
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
    title: snippet.title || 'Untitled',
    description: snippet.description,
    creator: snippet.channelTitle || 'Unknown',
    creatorId: snippet.channelId,
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
 * Note: The showName must be passed in since episodes don't include
 * the parent show name directly.
 *
 * @param episode - Raw Spotify episode from API
 * @param showName - Name of the podcast show (from parent context)
 * @returns NewItem ready for database insertion
 * @throws TransformError if episode id is missing
 */
export function transformSpotifyEpisode(episode: SpotifyEpisode, showName: string): NewItem {
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
    title: episode.name,
    description: episode.description,
    creator: showName,
    imageUrl: episode.images?.[0]?.url,
    durationSeconds: Math.floor(episode.duration_ms / 1000),
    publishedAt,
    createdAt: now,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse Spotify's variable date format into Unix milliseconds.
 *
 * Spotify release_date can be one of three formats:
 * - YYYY (just year) → normalizes to YYYY-01-01
 * - YYYY-MM (year-month) → normalizes to YYYY-MM-01
 * - YYYY-MM-DD (full date) → used as-is
 *
 * All dates are interpreted as UTC midnight.
 *
 * @param dateStr - Spotify date string (YYYY, YYYY-MM, or YYYY-MM-DD)
 * @returns Unix timestamp in milliseconds
 */
function parseSpotifyDate(dateStr: string): number {
  // Normalize to YYYY-MM-DD format
  const normalized =
    dateStr.length === 4
      ? `${dateStr}-01-01` // YYYY → YYYY-01-01
      : dateStr.length === 7
        ? `${dateStr}-01` // YYYY-MM → YYYY-MM-01
        : dateStr; // YYYY-MM-DD → unchanged

  return new Date(`${normalized}T00:00:00Z`).getTime();
}
