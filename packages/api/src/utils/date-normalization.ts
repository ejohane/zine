/**
 * Date normalization utilities for consistent date handling across platforms
 * 
 * YouTube API: Returns ISO 8601 string with full timestamp (2024-03-15T10:30:00Z)
 * Spotify API: Returns date-only string (2024-03-15)
 * oEmbed APIs: Don't provide publish dates
 */

/**
 * Normalize various date formats to a consistent Date object
 * @param dateInput - Date in various formats
 * @returns Date object or undefined if invalid/missing
 */
export function normalizeDate(dateInput: string | Date | number | undefined | null): Date | undefined {
  if (!dateInput) {
    return undefined;
  }

  try {
    // Already a Date object
    if (dateInput instanceof Date) {
      return isValidDate(dateInput) ? dateInput : undefined;
    }

    // Unix timestamp (number)
    if (typeof dateInput === 'number') {
      const date = new Date(dateInput);
      return isValidDate(date) ? date : undefined;
    }

    // String date
    if (typeof dateInput === 'string') {
      // Handle Spotify's date-only format (YYYY-MM-DD)
      // Convert to ISO 8601 with noon UTC time to avoid timezone issues
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        const date = new Date(`${dateInput}T12:00:00Z`);
        return isValidDate(date) ? date : undefined;
      }

      // Handle ISO 8601 format (from YouTube API)
      // Examples: 2024-03-15T10:30:00Z, 2024-03-15T10:30:00.000Z
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput)) {
        const date = new Date(dateInput);
        return isValidDate(date) ? date : undefined;
      }

      // Try parsing other date formats
      const date = new Date(dateInput);
      return isValidDate(date) ? date : undefined;
    }

    return undefined;
  } catch (error) {
    console.warn('[DateNormalization] Failed to parse date:', dateInput, error);
    return undefined;
  }
}

/**
 * Check if a Date object is valid
 */
function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Convert a date to Unix timestamp (milliseconds)
 * This is what gets stored in the database
 */
export function dateToTimestamp(date: Date | undefined): number | undefined {
  if (!date || !isValidDate(date)) {
    return undefined;
  }
  return date.getTime();
}

/**
 * Convert a date to ISO 8601 string for API responses
 * This ensures consistent format for mobile app
 */
export function dateToISOString(date: Date | undefined): string | undefined {
  if (!date || !isValidDate(date)) {
    return undefined;
  }
  return date.toISOString();
}

/**
 * Parse and normalize date from YouTube API response
 */
export function parseYouTubeDate(publishedAt: string | undefined): Date | undefined {
  // YouTube always provides ISO 8601 format
  return normalizeDate(publishedAt);
}

/**
 * Parse and normalize date from Spotify API response
 */
export function parseSpotifyDate(releaseDate: string | undefined): Date | undefined {
  // Spotify provides YYYY-MM-DD format
  return normalizeDate(releaseDate);
}

/**
 * Get a fallback date (current date) when no date is available
 * This is useful for content from oEmbed that doesn't provide dates
 */
export function getFallbackDate(): Date {
  return new Date();
}

/**
 * Format date for database storage (Unix timestamp in milliseconds)
 */
export function formatForDatabase(date: Date | string | number | undefined): number | undefined {
  const normalized = normalizeDate(date);
  return dateToTimestamp(normalized);
}

/**
 * Format date for API response (ISO 8601 string)
 */
export function formatForAPI(date: Date | string | number | undefined): string | undefined {
  const normalized = normalizeDate(date);
  return dateToISOString(normalized);
}

/**
 * Compare two dates for sorting (newest first)
 */
export function compareDatesDescending(a: Date | string | undefined, b: Date | string | undefined): number {
  const dateA = normalizeDate(a);
  const dateB = normalizeDate(b);
  
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;  // Put items without dates at the end
  if (!dateB) return -1; // Put items without dates at the end
  
  return dateB.getTime() - dateA.getTime(); // Newest first
}

/**
 * Check if a date is within a specific time range
 */
export function isWithinTimeRange(date: Date | string | undefined, hours: number): boolean {
  const normalized = normalizeDate(date);
  if (!normalized) return false;
  
  const now = new Date();
  const hoursInMs = hours * 60 * 60 * 1000;
  return (now.getTime() - normalized.getTime()) <= hoursInMs;
}

/**
 * Get human-readable time ago string (for debugging)
 */
export function getTimeAgo(date: Date | string | undefined): string {
  const normalized = normalizeDate(date);
  if (!normalized) return 'Unknown';
  
  const now = new Date();
  const diffMs = now.getTime() - normalized.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffSecs > 0) return `${diffSecs} second${diffSecs === 1 ? '' : 's'} ago`;
  return 'Just now';
}