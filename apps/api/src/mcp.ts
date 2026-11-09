import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod4';
import { saveSchema, patchItemSchema, progressSchema } from './items';
import { searchSchema } from './query';
import { contributionSchema } from './enrichment';

type CallApi = (path: string, method?: string, body?: unknown, key?: string) => Promise<Response>;
export function mcpHandler(callApi: CallApi) {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'zine-api', version: '0.1.0' });
    const result = async (path: string, method = 'GET', body?: unknown, key?: string) => {
      // Authorization follows URL normalization, exactly as the downstream
      // Request/router does. A raw-path check can be bypassed with dot segments
      // or a query string on an otherwise restricted operation.
      const origin = 'https://zine-api.invalid';
      let normalized: URL;
      let pathname: string;
      try {
        normalized = new URL(path, origin);
        pathname = decodeURIComponent(normalized.pathname).replace(/\/+/g, '/');
        if (normalized.origin !== origin || !/^\/v1\/[A-Za-z0-9/_-]*$/.test(pathname))
          throw new Error('Invalid API path');
      } catch {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Use a valid /v1/ API path.' }],
        };
      }
      // Credentials are managed outside MCP tools. Agent content access must not
      // silently become authority to create additional persistent credentials.
      if (/^\/v1\/(?:tokens|connections|account)(?:\/|$)/.test(pathname))
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'Manage API credentials through interactive authentication.',
            },
          ],
        };
      const response = await callApi(`${pathname}${normalized.search}`, method, body, key);
      const value = response.status === 204 ? { deleted: true } : await response.json();
      const structuredContent = { status: response.status, result: value };
      return {
        isError: response.status >= 400,
        content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
        structuredContent,
      };
    };
    const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
    const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
    const itemId = z.string().regex(/^itm_[a-f0-9]+$/);
    server.registerTool(
      'zine_save',
      {
        description:
          'Durably save a reference with optional personal context. Enrichment follows asynchronously. Reuse idempotencyKey for retries.',
        inputSchema: saveSchema.extend({ idempotencyKey: z.string().max(200).optional() }),
        annotations: { ...write, idempotentHint: false },
      },
      async ({ idempotencyKey, ...input }) => result('/v1/saves', 'POST', input, idempotencyKey)
    );
    server.registerTool(
      'zine_get_item',
      {
        description:
          'Retrieve an owned item and available information. Large material is optional.',
        inputSchema: z.object({
          itemId,
          include: z
            .array(z.enum(['transcript', 'article', 'thread', 'members', 'structuredData']))
            .optional(),
        }),
        annotations: read,
      },
      async ({ itemId, include }) =>
        result(`/v1/items/${itemId}${include?.length ? `?include=${include.join(',')}` : ''}`)
    );
    server.registerTool(
      'zine_search',
      {
        description:
          'Search retained information and personal context, with filters and supporting evidence.',
        inputSchema: searchSchema,
        annotations: read,
      },
      async (input) => result('/v1/items/search', 'POST', input)
    );
    server.registerTool(
      'zine_update_item',
      {
        description:
          'Save or dismiss a received item, archive/restore a saved item, or replace its tags.',
        inputSchema: z.object({ itemId, changes: patchItemSchema }),
        annotations: write,
      },
      async ({ itemId, changes }) => result(`/v1/items/${itemId}`, 'PATCH', changes)
    );
    server.registerTool(
      'zine_progress',
      {
        description: 'Update position or completion independently. Completing does not archive.',
        inputSchema: z.object({ itemId, progress: progressSchema }),
        annotations: write,
      },
      async ({ itemId, progress }) => result(`/v1/items/${itemId}/progress`, 'PATCH', progress)
    );
    server.registerTool(
      'zine_contribute',
      {
        description:
          'Contribute source information, derived understanding or a correction. Contributions retain provenance and are private.',
        inputSchema: z.object({ itemId, contribution: contributionSchema }),
        annotations: write,
      },
      async ({ itemId, contribution }) =>
        result(`/v1/items/${itemId}/enrichment`, 'POST', contribution)
    );
    server.registerTool(
      'zine_resolve_source',
      {
        description: 'Identify a subscribable source and its supported delivery routes.',
        inputSchema: z.object({ url: z.string().url() }),
        annotations: write,
      },
      async (input) => result('/v1/sources/resolve', 'POST', input)
    );
    server.registerTool(
      'zine_request',
      {
        description:
          'Call any documented Zine content API operation. Paths must begin /v1/. Use this for collections, subscriptions, context, annotations, material, jobs and export. Credential management is excluded. Deletions are irreversible.',
        inputSchema: z.object({
          method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).default('GET'),
          path: z.string().startsWith('/v1/').max(8192),
          body: z.unknown().optional(),
          idempotencyKey: z.string().max(200).optional(),
        }),
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      },
      async ({ method, path, body, idempotencyKey }) => result(path, method, body, idempotencyKey)
    );
    return server;
  });
  return handler;
}
