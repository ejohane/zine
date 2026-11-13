import { describe, test, expect } from 'bun:test';
import { API, ServiceError, apiOrigin } from './live-api';

describe('Connected browser API boundary', () => {
  test('only configured /v1 paths receive session credentials', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const api = new API(
      async () => 'session-secret',
      async (url, init) => {
        calls.push({ url: String(url), init });
        return Response.json({ id: 'owner' });
      }
    );
    await api.request('GET', '/v1/me');
    expect(calls[0].url).toBe(apiOrigin + '/v1/me');
    expect(calls[0].init?.redirect).toBe('error');
    expect(calls[0].init?.cache).toBe('no-store');
    for (const path of [
      'https://elsewhere.example/v1/me',
      '/v1/../../other',
      '/next/',
      '//elsewhere.example/v1/me',
    ])
      await expect(api.request('GET', path)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
  test('save retries reuse the operation key and body', async () => {
    const calls: RequestInit[] = [];
    const api = new API(
      async () => 'session',
      async (_url, init) => {
        calls.push(init!);
        if (calls.length === 1) throw Error('Connection lost after commit');
        return Response.json({ item: { id: 'same-item' } });
      }
    );
    await api.save({ url: 'https://example.com', context: { text: 'keep' } }, 'persisted-key');
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toBe(calls[1].body);
    expect((calls[1].headers as Record<string, string>)['idempotency-key']).toBe('persisted-key');
  });
  test('unsafe note mutations are never automatically retried', async () => {
    let calls = 0;
    const api = new API(
      async () => 'session',
      async () => {
        calls++;
        throw Error('Connection lost');
      }
    );
    await expect(api.note('item', 'one note')).rejects.toThrow();
    expect(calls).toBe(1);
  });
  test('quota failures surface a request reference without a long sleep', async () => {
    let calls = 0;
    const api = new API(
      async () => 'session',
      async () => {
        calls++;
        return Response.json(
          { error: { code: 'rate_limited', message: 'Try later' } },
          { status: 429, headers: { 'retry-after': '3600', 'x-request-id': 'request-reference' } }
        );
      }
    );
    try {
      await api.request('GET', '/v1/items');
      throw Error('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).requestId).toBe('request-reference');
    }
    expect(calls).toBe(1);
  });
  test('pagination uses the opaque cursor and singular type contract', async () => {
    let url = '';
    const api = new API(
      async () => 'session',
      async (input) => {
        url = String(input);
        return Response.json({ items: [], nextCursor: null });
      }
    );
    await api.list('Podcasts', 'opaque+/=');
    const params = new URL(url).searchParams;
    expect(params.get('type')).toBe('podcast_episode');
    expect(params.get('cursor')).toBe('opaque+/=');
  });
  test('auth denial remains an error instead of returning mock data', async () => {
    const api = new API(
      async () => 'expired',
      async () =>
        Response.json(
          { error: { code: 'invalid_token', message: 'Sign in again' } },
          { status: 401 }
        )
    );
    await expect(api.list('Home')).rejects.toBeInstanceOf(ServiceError);
  });
});
