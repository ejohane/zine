import { formatDurationTimestamp as formatSharedDurationTimestamp } from '@zine/shared/format';

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

export function formatDurationTimestamp(seconds: number | null | undefined): string {
  return formatSharedDurationTimestamp(seconds) ?? '';
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);

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

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffHours < 1) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  if (diffDays < 30) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }

  const year = date.getFullYear();
  const currentYear = now.getFullYear();

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(year !== currentYear && { year: 'numeric' }),
  };

  return date.toLocaleDateString('en-US', options);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);

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

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);

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
