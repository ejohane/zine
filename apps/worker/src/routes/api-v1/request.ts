const DEFAULT_BOOKMARKS_LIMIT = 10;

const MAX_BOOKMARKS_LIMIT = 50;

export function parseLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_BOOKMARKS_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BOOKMARKS_LIMIT;
  }

  return Math.min(MAX_BOOKMARKS_LIMIT, Math.max(1, parsed));
}

export function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

export function getRetryAfterSeconds(message: string): number | undefined {
  const match = message.match(/wait (\d+) seconds/i);
  if (!match) {
    return undefined;
  }

  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}
