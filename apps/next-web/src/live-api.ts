// Browser-only /v1 boundary; mirrors apps/api/client retry and idempotency semantics.
export const libraryPageSize = 30;
export const apiOrigin = 'https://api-next.myzine.app';
export const appURL = apiOrigin + '/next/';
export type RemoteItem = {
  id: string;
  status: 'saved' | 'received' | 'dismissed';
  archived: boolean;
  revision: number;
  createdAt: string;
  savedAt: string | null;
  updatedAt: string;
  content: {
    id: string;
    url: string;
    platform: string;
    type: string;
    title?: string;
    creator?: string | { name: string };
    description?: string;
    thumbnail?: string;
    creatorImageUrl?: string;
    source?: { url?: string; kind?: string };
    durationSeconds?: number;
    summary?: string;
    topics?: string[];
    publishedAt?: string;
  };
  context: { id: string; text: string; origin: string; contributor: string }[];
  tags: string[];
  collectionIds: string[];
  progress: { position: number | null; unit: string | null; completedAt: string | null };
  enrichment: {
    fields: Record<
      string,
      {
        category: string;
        contributionId: string;
        provenance: {
          coverage?: string;
          sourceCoverage?: string;
          method?: string;
          description?: string;
        };
      }
    >;
    components: { component: string; status: string; reasonCode: string | null }[];
  };
};
export type Page = { items: RemoteItem[]; nextCursor: string | null };
export type Collection = {
  id: string;
  name: string;
  description?: string;
  notes?: { id: string; text: string; itemIds: string[] }[];
};
export type Material = {
  field: string;
  value: {
    text?: string;
    html?: string;
    coverage?: string;
    segments?: { text: string; startSeconds?: number }[];
    posts?: { text: string }[];
  };
  provenance: { coverage?: string; method?: string; description?: string };
};
export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string
  ) {
    super(message);
  }
}
export class API {
  constructor(
    private token: () => Promise<string>,
    private transport: (input: string, init?: RequestInit) => Promise<Response> = (input, init) =>
      fetch(input, init)
  ) {}
  async request<T>(method: string, path: string, body?: unknown, key?: string): Promise<T> {
    if (
      !path.startsWith('/v1/') ||
      new URL(path, apiOrigin).origin !== apiOrigin ||
      !new URL(path, apiOrigin).pathname.startsWith('/v1/')
    )
      throw Error('Invalid API path');
    const retry = method === 'GET' || (method === 'POST' && path === '/v1/saves' && !!key);
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.transport(apiOrigin + path, {
          method,
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
          headers: {
            authorization: 'Bearer ' + (await this.token()),
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(key ? { 'idempotency-key': key } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (!retry || attempt >= 2) throw error;
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
        continue;
      }
      if (response.status === 204) return undefined as T;
      let result;
      try {
        result = await response.json();
      } catch {
        throw new ServiceError(
          response.status,
          'invalid_response',
          'The service returned an unreadable response.'
        );
      }
      if (response.ok) return result as T;
      const seconds = Number(response.headers.get('retry-after') ?? '0');
      if (
        retry &&
        attempt < 2 &&
        [429, 502, 503, 504].includes(response.status) &&
        Number.isFinite(seconds) &&
        seconds <= 2
      ) {
        await new Promise((r) => setTimeout(r, Math.max(200, seconds * 1000)));
        continue;
      }
      throw new ServiceError(
        response.status,
        result.error?.code ?? 'request_failed',
        result.error?.message ?? 'The request could not be completed.',
        response.headers.get('x-request-id') ?? undefined
      );
    }
  }
  list(section: string, cursor?: string, status?: 'received') {
    const type: Record<string, string> = {
      Podcasts: 'podcast_episode',
      Articles: 'article',
      Videos: 'video',
      Posts: 'post,thread',
    };
    const params = new URLSearchParams({
      limit: String(libraryPageSize),
      ...(status ? { status } : {}),
      ...(type[section] ? { type: type[section] } : {}),
      ...(cursor ? { cursor } : {}),
    });
    return this.request<Page>('GET', '/v1/items?' + params);
  }
  search(query: string, cursor?: string) {
    return this.request<Page>('POST', '/v1/items/search', {
      query,
      match: 'hybrid',
      limit: libraryPageSize,
      ...(cursor ? { cursor } : {}),
    });
  }
  item(id: string) {
    return this.request<RemoteItem>('GET', '/v1/items/' + encodeURIComponent(id));
  }
  save(input: unknown, key: string) {
    return this.request<{ item: { id: string }; save: { outcome: string } }>(
      'POST',
      '/v1/saves',
      input,
      key
    );
  }
  patch(id: string, changes: unknown) {
    return this.request<RemoteItem>('PATCH', '/v1/items/' + encodeURIComponent(id), changes);
  }
  progress(id: string, changes: unknown) {
    return this.request<RemoteItem>(
      'PATCH',
      '/v1/items/' + encodeURIComponent(id) + '/progress',
      changes
    );
  }
  note(id: string, text: string) {
    return this.request('POST', '/v1/items/' + encodeURIComponent(id) + '/context', {
      text,
      origin: 'explicit',
    });
  }
}
export function message(error: unknown) {
  if (error instanceof ServiceError) {
    if (error.status === 401) return 'Your session has ended. Sign out and sign in again.';
    if (error.status === 429)
      return 'Zine is receiving too many requests. Your saves are safe; try again shortly.';
    return error.message + (error.requestId ? ' · Reference ' + error.requestId : '');
  }
  return 'Could not reach Zine. Check your connection and try again.';
}
