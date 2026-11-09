import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { openApiDocument, responseContract } from '../src/openapi';
import { runtimeHarness } from '../scripts/runtime-harness';

describe('published REST contract', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  beforeAll(async () => {
    runtime = await runtimeHarness();
  });
  afterAll(async () => runtime?.close());
  it('documents every implemented REST operation and resolves every schema reference', () => {
    const spec = openApiDocument() as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    for (const route of app.routes.filter(
      (route) => route.method !== 'ALL' && route.path.startsWith('/v1/')
    )) {
      const path = route.path.replace(/:(\w+)/g, '{$1}');
      expect(
        spec.paths[path]?.[route.method.toLowerCase()],
        `${route.method} ${path}`
      ).toBeTruthy();
    }
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if ('$ref' in value) {
        const ref = String(value.$ref);
        expect(ref.startsWith('#/components/schemas/')).toBe(true);
        expect(
          spec.components.schemas[ref.slice('#/components/schemas/'.length)],
          ref
        ).toBeTruthy();
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(spec);
  });
  it('serves the contract publicly and returns matching save, item and collection shapes', async () => {
    const spec = await runtime.mf.dispatchFetch('http://localhost/openapi.json');
    expect(spec.status).toBe(200);
    expect(((await spec.json()) as { openapi: string }).openapi).toBe('3.1.0');
    const token = await runtime.token('contract-owner');
    const request = async (path: string, method = 'GET', body?: unknown) => {
      const response = await runtime.mf.dispatchFetch(`http://localhost${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: JSON.parse(await response.text()) };
    };
    const save = await request('/v1/saves', 'POST', {
      url: 'https://example.com/contract',
      context: { text: 'Contract context' },
    });
    expect(save.status).toBe(201);
    expect(responseContract('POST', '/v1/saves', save.status)!.safeParse(save.body).success).toBe(
      true
    );
    const item = await request(`/v1/items/${save.body.item.id}`);
    expect(
      responseContract('GET', '/v1/items/{itemId}', item.status)!.safeParse(item.body).success
    ).toBe(true);
    const collection = await request('/v1/collections', 'POST', { name: 'Contract collection' });
    expect(
      responseContract('POST', '/v1/collections', collection.status)!.safeParse(collection.body)
        .success
    ).toBe(true);
    const annotation = await request(`/v1/items/${save.body.item.id}/annotations`, 'POST', {
      kind: 'note',
      text: 'Contract note',
    });
    expect(
      responseContract('POST', '/v1/items/{itemId}/annotations', annotation.status)!.safeParse(
        annotation.body
      ).success
    ).toBe(true);
    const annotations = await request(`/v1/items/${save.body.item.id}/annotations`);
    expect(
      responseContract('GET', '/v1/items/{itemId}/annotations', annotations.status)!.safeParse(
        annotations.body
      ).success
    ).toBe(true);
  });
});
