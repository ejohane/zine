import { describe, expect, it, vi } from 'vitest';
import { throttleVerification } from './throttle';

function request(ip?: string, token = 'fixture') {
  return new Request('https://mcp.myzine.app/mcp', {
    headers: { Authorization: `Bearer ${token}`, ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
  });
}
describe('early opaque verification throttle', () => {
  it('requires the binding in production but permits isolated local fixtures', async () => {
    const response = await throttleVerification(request(), { ENVIRONMENT: 'production' });
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: 'VERIFICATION_UNAVAILABLE' });
    expect(response?.headers.get('Retry-After')).toBe('5');
    expect(await throttleVerification(request(), { ENVIRONMENT: 'test' })).toBeNull();
  });
  it('keys different tokens at the same IP together without including tokens or URLs', async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    const env = { MCP_VERIFICATION_LIMITER: { limit } };
    expect(await throttleVerification(request('192.0.2.1', 'one'), env)).toBeNull();
    expect(await throttleVerification(request('192.0.2.1', 'two'), env)).toBeNull();
    expect(await throttleVerification(request('2001:DB8::1'), env)).toBeNull();
    expect(limit.mock.calls).toEqual([
      [{ key: 'mcp-verify:192.0.2.1' }],
      [{ key: 'mcp-verify:192.0.2.1' }],
      [{ key: 'mcp-verify:2001:db8::1' }],
    ]);
  });
  it('returns a private 429 with retry guidance when denied', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const response = await throttleVerification(request('192.0.2.1'), {
      MCP_VERIFICATION_LIMITER: { limit },
    });
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('60');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.has('WWW-Authenticate')).toBe(false);
    expect(await response?.json()).toEqual({ error: 'RATE_LIMITED' });
  });
  it.each([undefined, 'unknown', '192.0.2.1,192.0.2.2', 'a'.repeat(46)])(
    'fails closed without a usable Cloudflare edge IP %j',
    async (ip) => {
      const limit = vi.fn();
      expect(
        (await throttleVerification(request(ip), { MCP_VERIFICATION_LIMITER: { limit } }))?.status
      ).toBe(503);
      expect(limit).not.toHaveBeenCalled();
    }
  );
  it('does not use a caller-supplied X-Forwarded-For fallback', async () => {
    const value = request();
    value.headers.set('X-Forwarded-For', '192.0.2.1');
    const limit = vi.fn();
    expect(
      (await throttleVerification(value, { MCP_VERIFICATION_LIMITER: { limit } }))?.status
    ).toBe(503);
    expect(limit).not.toHaveBeenCalled();
  });
  it('fails closed on unavailable or malformed limiter responses without leaking errors', async () => {
    for (const limit of [
      vi.fn().mockRejectedValue(new Error('private fixture data')),
      vi.fn().mockResolvedValue({}),
      vi.fn().mockResolvedValue(null),
    ]) {
      const response = await throttleVerification(request('192.0.2.1'), {
        MCP_VERIFICATION_LIMITER: { limit },
      });
      expect(response?.status).toBe(503);
      expect(await response?.text()).toBe('{"error":"VERIFICATION_UNAVAILABLE"}');
    }
  });
});
