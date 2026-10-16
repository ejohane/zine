import { describe, expect, it } from 'bun:test';
import { inspectClerk } from './mcp-clerk-preflight';
const metadata = {
  issuer: 'https://clerk.myzine.app',
  scopes_supported: ['openid', 'profile'],
  code_challenge_methods_supported: ['S256'],
  authorization_response_iss_parameter_supported: true,
};
describe('Clerk preflight is read-only and does not expose secret settings', () => {
  it('inspects public metadata without credentials', async () => {
    const calls: unknown[] = [];
    const fetcher = (async (url, options) => {
      calls.push({ url, options });
      return Response.json(metadata);
    }) as typeof fetch;
    expect(await inspectClerk(fetcher)).toMatchObject({
      s256_advertised: true,
      cimd_advertised: false,
      private_settings: 'NOT_INSPECTED_NO_APPROVED_SECRET',
    });
    expect(calls).toHaveLength(1);
  });
  it('uses the approved secret only at the fixed private GET endpoint and prints a setting allowlist', async () => {
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const fetcher = (async (url, options) => {
      calls.push({ url: String(url), options });
      return Response.json(
        calls.length === 1
          ? metadata
          : { aud_claim_enabled: true, oauth_jwt_access_tokens: false, secret: 'must not escape' }
      );
    }) as typeof fetch;
    const report = await inspectClerk(fetcher, 'fixture-only');
    expect(calls[0].options).not.toHaveProperty('headers');
    expect(calls[1].url).toBe('https://api.clerk.com/v1/instance/oauth_application_settings');
    expect(calls[1].options?.method).toBe('GET');
    expect(JSON.stringify(report)).not.toContain('fixture-only');
    expect(JSON.stringify(report)).not.toContain('must not escape');
    expect(report.private_settings).toHaveProperty('aud_claim_enabled', true);
  });
});
