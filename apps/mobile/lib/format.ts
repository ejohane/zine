/**
 * Formatting utilities for the Zine mobile app
 *
 * Centralized formatters for duration, relative time, and dates.
 * Used across all screens for consistent UI display.
 */

// ============================================================================
// Duration Formatting
// ============================================================================

/**
 * Format duration in seconds to human-readable string
 *
 * Returns a friendly format like "1h 23m" for display in cards and lists.
 * For video player timestamps, use formatDurationTimestamp instead.
 *
 * @param seconds - Duration in seconds (from API)
 * @returns Formatted string like "1h 23m" or "45m"
 *
 * @example
 * formatDuration(3723) // "1h 2m"
 * formatDuration(2700) // "45m"
 * formatDuration(59)   // "0m" (less than a minute)
 * formatDuration(0)    // "0m"
 * formatDuration(null) // ""
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  if (seconds < 0) return '';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

/**
 * Format duration in seconds to timestamp format (H:MM:SS or M:SS)
 *
 * Used for video/podcast player progress display.
 *
 * @param seconds - Duration in seconds
 * @returns Timestamp string like "1:02:05" or "2:05"
 *
 * @example
 * formatDurationTimestamp(3661) // "1:01:01"
 * formatDurationTimestamp(125)  // "2:05"
 * formatDurationTimestamp(45)   // "0:45"
 * formatDurationTimestamp(null) // ""
 */
export function formatDurationTimestamp(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  if (seconds < 0) return '';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// ============================================================================
// Relative Time Formatting
// ============================================================================

/**
 * Format timestamp to relative time string
 *
 * Provides human-friendly "time ago" strings with appropriate granularity.
 *
 * @param dateString - ISO 8601 date string
 * @returns Relative time like "2 hours ago", "Yesterday", "3 days ago"
 *
 * @example
 * formatRelativeTime('2024-01-15T10:00:00Z') // "2 days ago"
 * formatRelativeTime(new Date().toISOString()) // "Just now"
 * formatRelativeTime(null) // ""
 */
export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);

  // Check for invalid date
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Handle future dates
  if (diffMs < 0) return 'Just now';

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  // Less than 1 minute
  if (diffMinutes < 1) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diffHours < 1) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  // Yesterday (1 day)
  if (diffDays === 1) {
    return 'Yesterday';
  }

  // Less than 7 days
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  // Less than 30 days (show weeks)
  if (diffDays < 30) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }

  // 30+ days: show actual date
  const year = date.getFullYear();
  const currentYear = now.getFullYear();

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(year !== currentYear && { year: 'numeric' }),
  };

  return date.toLocaleDateString('en-US', options);
}

// ============================================================================
// Absolute Date Formatting
// ============================================================================

/**
 * Format absolute date for display
 *
 * @param dateString - ISO 8601 date string
 * @returns Formatted date like "Jan 15, 2024" or "Jan 15" (same year)
 *
 * @example
 * formatDate('2024-01-15T10:00:00Z') // "Jan 15, 2024" (if different year)
 * formatDate('2025-01-15T10:00:00Z') // "Jan 15" (if same year)
 * formatDate(null) // ""
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);

  // Check for invalid date
  if (isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(year !== currentYear && { year: 'numeric' }),
  };

  return date.toLocaleDateString('en-US', options);
}

/**
 * Format date with time
 *
 * @param dateString - ISO 8601 date string
 * @returns Formatted date and time like "Jan 15, 2024 at 3:30 PM"
 *
 * @example
 * formatDateTime('2024-01-15T15:30:00Z') // "Jan 15, 2024 at 3:30 PM"
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);

  // Check for invalid date
  if (isNaN(date.getTime())) return '';

  const dateOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const formattedDate = date.toLocaleDateString('en-US', dateOptions);
  const formattedTime = date.toLocaleTimeString('en-US', timeOptions);

  return `${formattedDate} at ${formattedTime}`;
}
