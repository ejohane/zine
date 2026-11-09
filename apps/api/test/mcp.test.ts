import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { runtimeHarness } from '../scripts/runtime-harness';

describe('MCP adapter through the official client and Worker HTTP transport', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let client: Client;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    const token = await runtime.token('mcp-owner');
    client = new Client({ name: 'zine-api-verifier', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const response = await runtime.mf.dispatchFetch(request.url, {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          body: request.body ? await request.arrayBuffer() : undefined,
        });
        return new Response(await response.arrayBuffer(), {
          status: response.status,
          headers: Object.fromEntries(response.headers),
        });
      },
    });
    await client.connect(transport);
  });
  afterAll(async () => {
    await client?.close();
    await runtime?.close();
  });
  it('discovers tools and performs a durable save/read/search over the same REST contract', async () => {
    const tools = await client.listTools();
    expect(tools.tools.some((tool) => tool.name === 'zine_save')).toBe(true);
    const saved = await client.callTool({
      name: 'zine_save',
      arguments: {
        url: 'https://example.com/mcp-test',
        context: { text: 'MCP context' },
        idempotencyKey: 'mcp-save',
      },
    });
    expect(saved.isError).toBe(false);
    const body = saved.structuredContent as {
      status: number;
      result: { item: { id: string }; save: { id: string } };
    };
    expect(body.status).toBe(201);
    const read = await client.callTool({
      name: 'zine_get_item',
      arguments: { itemId: body.result.item.id },
    });
    expect(read.isError).toBe(false);
    const item = (read.structuredContent as { result: { context: { text: string }[] } }).result;
    expect(item.context[0].text).toBe('MCP context');
    const search = await client.callTool({
      name: 'zine_search',
      arguments: { query: 'MCP context', match: 'keyword' },
    });
    expect(
      (search.structuredContent as { result: { items: unknown[] } }).result.items
    ).toHaveLength(1);
  });
  it('keeps credential management outside agent tools and returns API failures as tool errors', async () => {
    const forbidden = await client.callTool({
      name: 'zine_request',
      arguments: { method: 'POST', path: '/v1/tokens', body: { name: 'Agent key' } },
    });
    expect(forbidden.isError).toBe(true);
    const missing = await client.callTool({
      name: 'zine_get_item',
      arguments: { itemId: 'itm_0000000000000000000000000000000000000000' },
    });
    expect(missing.isError).toBe(true);
    expect((missing.structuredContent as { status: number }).status).toBe(404);
  });
  it('authorizes canonical paths before routing encoded or traversing requests', async () => {
    for (const path of [
      '/v1/tokens?probe=1',
      '/v1//tokens',
      '/v1/items/../tokens',
      '/v1/items/%2e%2e/tokens',
      '/v1/%74okens',
      '/v1/items/%2F..%2Ftokens',
      '/v1/items/../account/data',
    ]) {
      const denied = await client.callTool({
        name: 'zine_request',
        arguments: { method: 'POST', path, body: { name: 'Must not be issued' } },
      });
      expect(denied.isError, path).toBe(true);
      expect(denied.structuredContent, path).toBeUndefined();
    }
  });
});
