import type { z } from 'zod4';
import type { getItem, saveSchema } from '../src/items';
import type { filterSchema, listItems, searchItems, searchSchema } from '../src/query';
import type { subscribeSchema } from '../src/subscriptions';

export type SaveInput = z.input<typeof saveSchema>;
export type Item = Awaited<ReturnType<typeof getItem>>;
export interface SaveReceipt {
  item: { id: string; contentId: string; status: 'saved'; archived: boolean; url: string };
  save: { id: string; outcome: 'created' | 'reactivated' | 'already_saved' };
  enrichment: { status: 'available' | 'processing' | 'pending' };
}
export type ItemPage = Awaited<ReturnType<typeof listItems>>;
export type SearchInput = z.input<typeof searchSchema>;
export type SearchResults = Awaited<ReturnType<typeof searchItems>>;
export type SubscribeInput = z.input<typeof subscribeSchema>;
export interface Job {
  id: string;
  kind: string;
  itemId: string | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempts: number;
  errorCode: string | null;
  availableAt: string;
}
export class ZineError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public details?: unknown,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ZineError';
  }
}
export interface ClientOptions {
  baseUrl: string;
  token: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
  /** Retries apply only to reads, search and saves carrying a stable idempotency key. */
  retries?: number;
  maxRetryDelayMs?: number;
  timeoutMs?: number;
}
/** A thin fetch client. It never persists credentials or silently retries unsafe mutations. */
export class ZineClient {
  private origin: string;
  private transport: typeof fetch;
  constructor(private options: ClientOptions) {
    const url = new URL(options.baseUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw new Error('baseUrl must be an origin');
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
      throw new Error('Use HTTPS, or loopback HTTP for local development');
    this.origin = url.origin;
    this.transport = options.fetch ?? fetch;
  }
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { idempotencyKey?: string } = {}
  ): Promise<T> {
    if (
      !path.startsWith('/v1/') ||
      !new URL(path, this.origin).pathname.startsWith('/v1/') ||
      new URL(path, this.origin).origin !== this.origin
    )
      throw new Error('Only /v1/ paths on the configured origin are allowed');
    const safe =
      method === 'GET' ||
      (method === 'POST' && path === '/v1/items/search') ||
      (method === 'POST' && path === '/v1/saves' && !!options.idempotencyKey);
    const retries = safe ? Math.max(0, Math.min(5, this.options.retries ?? 2)) : 0;
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        const token =
          typeof this.options.token === 'function'
            ? await this.options.token()
            : this.options.token;
        response = await this.transport(this.origin + path, {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 20000),
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (attempt >= retries) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(100 * 2 ** attempt, this.options.maxRetryDelayMs ?? 2000))
        );
        continue;
      }
      const text = await response.text();
      let value: unknown;
      try {
        value = text ? JSON.parse(text) : undefined;
      } catch {
        throw new ZineError(
          response.status,
          'invalid_response',
          'The service returned a non-JSON response',
          response.headers.get('x-request-id') ?? undefined
        );
      }
      if (response.ok) return value as T;
      const record = value as {
        error?: { code?: string; message?: string; requestId?: string; details?: unknown };
      };
      const retryHeader = response.headers.get('retry-after');
      const seconds = retryHeader === null ? NaN : Number(retryHeader);
      const retryAfterMs =
        retryHeader === null
          ? undefined
          : Math.max(
              0,
              Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryHeader) - Date.now()
            );
      const error = new ZineError(
        response.status,
        record?.error?.code ?? 'http_error',
        record?.error?.message ?? `HTTP ${response.status}`,
        record?.error?.requestId ?? response.headers.get('x-request-id') ?? undefined,
        record?.error?.details,
        retryAfterMs
      );
      const delay = retryAfterMs ?? 100 * 2 ** attempt;
      if (
        attempt >= retries ||
        ![429, 502, 503, 504].includes(response.status) ||
        !Number.isFinite(delay) ||
        delay > (this.options.maxRetryDelayMs ?? 2000)
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  save(input: SaveInput, idempotencyKey: string = crypto.randomUUID()) {
    return this.request<SaveReceipt>('POST', '/v1/saves', input, { idempotencyKey });
  }
  item(id: string, include: string[] = []) {
    return this.request<Item>(
      'GET',
      `/v1/items/${encodeURIComponent(id)}${include.length ? '?include=' + encodeURIComponent(include.join(',')) : ''}`
    );
  }
  list(
    filters: z.input<typeof filterSchema> = {},
    options: { limit?: number; cursor?: string } = {}
  ) {
    const query = new URLSearchParams();
    const names: Record<string, string> = {
      types: 'type',
      platforms: 'platform',
      tags: 'tag',
      collectionIds: 'collectionId',
      sourceIds: 'sourceId',
      subscriptionIds: 'subscriptionId',
    };
    for (const [key, value] of Object.entries({ ...filters, ...options }))
      if (value !== undefined)
        query.set(names[key] ?? key, Array.isArray(value) ? value.join(',') : String(value));
    return this.request<ItemPage>('GET', '/v1/items?' + query);
  }
  async *items(filters: z.input<typeof filterSchema> = {}, limit = 50) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await this.list(filters, { limit, cursor });
      for (const item of page.items) yield item;
      cursor = page.nextCursor ?? undefined;
      if (cursor && seen.has(cursor))
        throw new ZineError(502, 'pagination_cycle', 'The service repeated a pagination cursor');
      if (cursor) seen.add(cursor);
    } while (cursor);
  }
  search(input: SearchInput) {
    return this.request<SearchResults>('POST', '/v1/items/search', input);
  }
  job(id: string) {
    return this.request<Job>('GET', '/v1/jobs/' + encodeURIComponent(id));
  }
  async waitForJob(id: string, options: { timeoutMs?: number; intervalMs?: number } = {}) {
    const until = Date.now() + (options.timeoutMs ?? 60000);
    while (true) {
      const job = await this.job(id);
      if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
      if (Date.now() >= until)
        throw new ZineError(
          408,
          'job_wait_timeout',
          'Work remains queued; the accepted save is durable',
          undefined,
          { jobId: id, status: job.status }
        );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(options.intervalMs ?? 1000, Math.max(0, until - Date.now())))
      );
    }
  }
  subscribe(input: SubscribeInput) {
    return this.request<{ id: string; status: string; jobId: string }>(
      'POST',
      '/v1/subscriptions',
      input
    );
  }
  unsubscribe(id: string) {
    return this.request<void>('DELETE', '/v1/subscriptions/' + encodeURIComponent(id));
  }
}
