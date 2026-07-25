export type CollectorSource = {
  type: 'FOLLOWING' | 'FAVORITES' | 'LIST';
  id: string;
  name: string;
  url: string;
};

export type CollectorCollectionConfig = {
  requestedCount: number;
  collectionPolicy:
    | { mode: 'COUNT' }
    | {
        mode: 'ROLLING_WINDOW';
        windowHours: number;
        cutoffAt: string;
        boundaryEvidenceRequired: number;
      };
};

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100_000) {
    throw new Error(`${label} must be between 1 and 100000`);
  }
  return parsed;
}

export function resolveCollectionConfig(input: {
  source: CollectorSource;
  count?: string;
  safetyLimit?: string;
  windowHours?: string;
  startedAt: string;
}): CollectorCollectionConfig {
  if (input.source.type === 'FOLLOWING') {
    if (input.safetyLimit !== undefined || input.windowHours !== undefined) {
      throw new Error('Following collection uses --count, not rolling-window options');
    }
    return {
      requestedCount: positiveInteger(input.count, 500, '--count'),
      collectionPolicy: { mode: 'COUNT' },
    };
  }

  if (input.count !== undefined) {
    throw new Error(
      'Favorites/List collection uses --window-hours and --safety-limit, not --count'
    );
  }
  const windowHours = positiveInteger(input.windowHours, 24, '--window-hours');
  if (windowHours > 168) throw new Error('--window-hours must be between 1 and 168');
  const startedAt = Date.parse(input.startedAt);
  if (!Number.isFinite(startedAt)) throw new Error('startedAt must be an ISO timestamp');
  return {
    requestedCount: positiveInteger(input.safetyLimit, 5_000, '--safety-limit'),
    collectionPolicy: {
      mode: 'ROLLING_WINDOW',
      windowHours,
      cutoffAt: new Date(startedAt - windowHours * 60 * 60 * 1_000).toISOString(),
      boundaryEvidenceRequired: 3,
    },
  };
}

export function resolveCollectorSource(input: {
  type?: string;
  id?: string;
  name?: string;
  url?: string;
}): CollectorSource {
  const type = (input.type ?? 'FOLLOWING').toUpperCase();
  if (type !== 'FOLLOWING' && type !== 'FAVORITES' && type !== 'LIST') {
    throw new Error('--source-type must be FOLLOWING, FAVORITES, or LIST');
  }

  if (type === 'FOLLOWING') {
    if (input.id && input.id !== 'following') {
      throw new Error('Following source id must be following');
    }
    if (input.url) {
      const sourceURL = new URL(input.url);
      if (
        sourceURL.protocol !== 'https:' ||
        !['x.com', 'www.x.com'].includes(sourceURL.hostname) ||
        sourceURL.pathname !== '/home'
      ) {
        throw new Error('Following source URL must be https://x.com/home');
      }
    }
    return {
      type,
      id: 'following',
      name: input.name ?? 'Following',
      url: 'https://x.com/home',
    };
  }

  if (!input.url) throw new Error('--source-url is required for list sources');
  const sourceURL = new URL(input.url);
  if (sourceURL.protocol !== 'https:' || !['x.com', 'www.x.com'].includes(sourceURL.hostname)) {
    throw new Error('--source-url must be an https://x.com/i/lists/<id> URL');
  }
  const match = sourceURL.pathname.match(/^\/i\/lists\/(\d+)\/?$/);
  if (!match) throw new Error('--source-url must be an https://x.com/i/lists/<id> URL');
  const id = `x-list:${match[1]}`;
  if (input.id && input.id !== id) {
    throw new Error(`--source-id must match the list URL (${id})`);
  }
  return {
    type,
    id,
    name: input.name ?? (type === 'FAVORITES' ? 'Favorites' : `List ${match[1]}`),
    url: `https://x.com/i/lists/${match[1]}`,
  };
}
