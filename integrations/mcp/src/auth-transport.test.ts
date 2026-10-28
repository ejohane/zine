import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { handleMcp } from './server';
import type { Bindings } from '../../../apps/worker/src/types';

vi.mock('googleapis', () => ({ google: {} }));

it.each(['initialize', 'tools/call'])(
  'starts standard SDK OAuth from anonymous %s',
  async (method) => {
    const resource = 'https://zine.example/mcp';
    const issuer = 'https://identity.example';
    let redirect: URL | undefined;
    let verifier = '';
    const provider: OAuthClientProvider = {
      redirectUrl: 'http://127.0.0.1:8976/callback',
      clientMetadata: {
        redirect_uris: ['http://127.0.0.1:8976/callback'],
        token_endpoint_auth_method: 'none',
      },
      clientInformation: () => ({ client_id: 'fixture-agent', issuer }),
      tokens: () => undefined,
      saveTokens: () => {
        throw new Error('No account grant belongs in this test');
      },
      redirectToAuthorization: (url) => {
        redirect = url;
      },
      saveCodeVerifier: (value) => {
        verifier = value;
      },
      codeVerifier: () => verifier,
    };
    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      authProvider: provider,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).origin === issuer) {
          return Response.json({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            response_types_supported: ['code'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
          });
        }
        expect(new URL(request.url).origin).toBe('https://zine.example');
        return handleMcp(request, {
          ...(env as unknown as Bindings),
          MCP_RESOURCE: resource,
          MCP_OAUTH_ISSUER: issuer,
          MCP_OAUTH_JWKS_URL: `${issuer}/jwks`,
        });
      },
    });
    await transport.start();
    try {
      await expect(
        transport.send({
          jsonrpc: '2.0',
          id: 1,
          method,
          params:
            method === 'initialize'
              ? {
                  protocolVersion: '2025-11-25',
                  capabilities: {},
                  clientInfo: { name: 'fixture-agent', version: '1' },
                }
              : { name: 'get_home_components', arguments: {} },
        })
      ).rejects.toThrow('Unauthorized');
      expect(redirect?.origin).toBe(issuer);
      expect(redirect?.searchParams.get('resource')).toBe(resource);
      expect(redirect?.searchParams.get('scope')).toBe('bookmarks:read');
      expect(redirect?.searchParams.get('code_challenge_method')).toBe('S256');
      expect(verifier.length).toBeGreaterThan(32);
    } finally {
      await transport.close();
    }
  }
);
