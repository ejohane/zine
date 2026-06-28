import {
  formatDurationTimestamp,
  mapContentType as mapSharedContentType,
  mapProvider as mapSharedProvider,
} from '@zine/shared/format';
import type { ContentType, Provider } from '@zine/shared/types';

export { formatEstimatedMinutes, isValidUrl } from '@zine/shared/format';

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

export function formatDisplayText(value?: string | null, fallback = 'Untitled') {
  return formatPlainText(value) ?? fallback;
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
