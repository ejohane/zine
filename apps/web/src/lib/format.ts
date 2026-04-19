import {
  formatDurationTimestamp,
  isValidUrl as isValidSharedUrl,
  mapContentType as mapSharedContentType,
  mapProvider as mapSharedProvider,
} from '@zine/shared/format';
import type { ContentType, Provider } from '@zine/shared/types';

export function mapContentType(contentType: ContentType | string) {
  return mapSharedContentType(contentType);
}

export function mapProvider(provider: Provider | string) {
  return mapSharedProvider(provider);
}

export function formatPlainText(value?: string | null) {
  if (!value) {
    return null;
  }

  const plainText = value
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|#160);/gi, ' ')
    .replace(/&(amp|#38);/gi, '&')
    .replace(/&(quot|#34);/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

  return plainText.length > 0 ? plainText : null;
}

export function formatDuration(seconds?: number | null): string | undefined {
  return formatDurationTimestamp(seconds);
}

export function formatRelativeDate(value?: string | number | null) {
  if (!value) return 'Recently';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const buckets: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, size] of buckets) {
    if (Math.abs(seconds) >= size || unit === 'minute') {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }

  return 'Just now';
}

export function formatEstimatedMinutes(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return '0m';
  }

  const roundedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

export function isValidUrl(urlString: string): boolean {
  return isValidSharedUrl(urlString);
}
