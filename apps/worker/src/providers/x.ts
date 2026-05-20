export type XRateLimitInfo = {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
};

export type XUser = {
  id: string;
  name: string;
  username: string;
  description?: string;
  profile_image_url?: string;
  url?: string;
  verified?: boolean;
  public_metrics?: {
    followers_count?: number;
  };
};

export type XMedia = {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
};

export type XTweet = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  attachments?: {
    media_keys?: string[];
  };
  public_metrics?: Record<string, number>;
  note_tweet?: {
    text?: string;
  };
};

export type XBookmarksResponse = {
  data?: XTweet[];
  includes?: {
    users?: XUser[];
    media?: XMedia[];
  };
  meta?: {
    result_count?: number;
    next_token?: string;
    previous_token?: string;
  };
  errors?: unknown[];
};

export type XBookmarksPage = XBookmarksResponse & {
  rateLimit: XRateLimitInfo;
};

export class XRateLimitError extends Error {
  readonly resetAt: number | null;
  readonly rateLimit: XRateLimitInfo;

  constructor(message: string, rateLimit: XRateLimitInfo) {
    super(message);
    this.name = 'XRateLimitError';
    this.rateLimit = rateLimit;
    this.resetAt = rateLimit.resetAt;
  }
}

export class XAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'XAuthError';
    this.status = status;
  }
}

export const X_BOOKMARKS_MAX_RESULTS = 100;
export const X_USER_SEARCH_MAX_RESULTS = 10;

function parseRateLimit(headers: Headers): XRateLimitInfo {
  const limit = headers.get('x-rate-limit-limit');
  const remaining = headers.get('x-rate-limit-remaining');
  const reset = headers.get('x-rate-limit-reset');

  return {
    limit: limit ? Number(limit) : null,
    remaining: remaining ? Number(remaining) : null,
    resetAt: reset ? Number(reset) * 1000 : null,
  };
}

export async function fetchXBookmarksPage(params: {
  accessToken: string;
  userId: string;
  paginationToken?: string | null;
  maxResults?: number;
}): Promise<XBookmarksPage> {
  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(params.userId)}/bookmarks`);
  url.searchParams.set('max_results', String(params.maxResults ?? X_BOOKMARKS_MAX_RESULTS));
  url.searchParams.set(
    'tweet.fields',
    ['attachments', 'author_id', 'created_at', 'id', 'note_tweet', 'public_metrics', 'text'].join(
      ','
    )
  );
  url.searchParams.set('expansions', ['attachments.media_keys', 'author_id'].join(','));
  url.searchParams.set('user.fields', ['id', 'name', 'profile_image_url', 'username'].join(','));
  url.searchParams.set(
    'media.fields',
    ['duration_ms', 'height', 'media_key', 'preview_image_url', 'type', 'url', 'width'].join(',')
  );

  if (params.paginationToken) {
    url.searchParams.set('pagination_token', params.paginationToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: 'application/json',
    },
  });
  const rateLimit = parseRateLimit(response.headers);

  if (response.status === 429) {
    throw new XRateLimitError('X bookmark lookup rate limit exceeded', rateLimit);
  }

  if (response.status === 401 || response.status === 403) {
    const text = await response.text();
    throw new XAuthError(response.status, text || `X bookmark lookup failed: ${response.status}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`X bookmark lookup failed: ${response.status} ${text}`);
  }

  const body = (await response.json()) as XBookmarksResponse;
  return {
    ...body,
    rateLimit,
  };
}

export async function searchXUsers(params: {
  bearerToken: string;
  query: string;
  maxResults?: number;
}): Promise<XUser[]> {
  const url = new URL('https://api.x.com/2/users/search');
  url.searchParams.set('query', params.query);
  url.searchParams.set(
    'user.fields',
    [
      'description',
      'id',
      'name',
      'profile_image_url',
      'public_metrics',
      'url',
      'username',
      'verified',
    ].join(',')
  );
  url.searchParams.set('max_results', String(params.maxResults ?? X_USER_SEARCH_MAX_RESULTS));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      Accept: 'application/json',
    },
  });
  const rateLimit = parseRateLimit(response.headers);

  if (response.status === 429) {
    throw new XRateLimitError('X user search rate limit exceeded', rateLimit);
  }

  if (response.status === 401 || response.status === 403) {
    const text = await response.text();
    throw new XAuthError(response.status, text || `X user search failed: ${response.status}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`X user search failed: ${response.status} ${text}`);
  }

  const body = (await response.json()) as { data?: XUser[] };
  return body.data ?? [];
}
