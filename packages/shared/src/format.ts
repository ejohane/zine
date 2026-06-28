import type { ContentType, ContentTypeValue, Provider, ProviderValue } from './types/domain';

export type UIContentType = Lowercase<`${ContentType}`>;
export type UIProvider = Lowercase<`${Provider}`>;

export function mapContentType(contentType: ContentType | ContentTypeValue): UIContentType;
export function mapContentType(contentType: string): Lowercase<string>;
export function mapContentType(contentType: ContentType | string): Lowercase<string> {
  return contentType.toString().toLowerCase() as Lowercase<string>;
}

export function mapProvider(provider: Provider | ProviderValue): UIProvider;
export function mapProvider(provider: string): Lowercase<string>;
export function mapProvider(provider: Provider | string): Lowercase<string> {
  return provider.toString().toLowerCase() as Lowercase<string>;
}

export function formatDurationTimestamp(seconds?: number | null): string | undefined {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatEstimatedMinutes(totalMinutes: number): string {
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
  if (!urlString || urlString.trim().length === 0) {
    return false;
  }

  try {
    const url = new URL(urlString.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
