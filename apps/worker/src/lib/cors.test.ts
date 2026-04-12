import { describe, expect, it } from 'vitest';
import { isDevelopmentOrigin, resolveCorsOrigin } from './cors';

describe('CORS origin resolution', () => {
  it('accepts Tailscale worktree origins in development', () => {
    const origin = 'http://100.92.242.50:8224';

    expect(isDevelopmentOrigin(origin)).toBe(true);
    expect(resolveCorsOrigin(origin, 'development')).toBe(origin);
  });

  it('accepts loopback and private LAN development origins', () => {
    expect(isDevelopmentOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isDevelopmentOrigin('http://192.168.1.20:8224')).toBe(true);
    expect(isDevelopmentOrigin('http://app.local:8224')).toBe(true);
  });

  it('keeps non-development environments on the explicit production allowlist', () => {
    expect(resolveCorsOrigin('http://100.92.242.50:8224', 'production')).toBeNull();
    expect(resolveCorsOrigin('https://myzine.app', 'production')).toBe('https://myzine.app');
  });

  it('rejects malformed or public origins in development', () => {
    expect(isDevelopmentOrigin('not-a-url')).toBe(false);
    expect(isDevelopmentOrigin('https://example.com')).toBe(false);
    expect(resolveCorsOrigin('https://example.com', 'development')).toBeNull();
  });
});
