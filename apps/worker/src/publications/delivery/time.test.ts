import { describe, it, expect } from 'vitest';
import { nextMorning, localDate, retryAt } from './time';
import { createApnsProvider } from './apns';
describe('calendar digest scheduling', () => {
  it.each([
    ['2026-03-07T15:00:00Z', 'America/Chicago', '2026-03-08T14:00:00.000Z'],
    ['2026-10-31T14:00:00Z', 'America/Chicago', '2026-11-01T15:00:00.000Z'],
    ['2026-10-08T03:16:00Z', 'Asia/Kathmandu', '2026-10-09T03:15:00.000Z'],
    ['2026-12-31T09:00:00Z', 'UTC', '2027-01-01T09:00:00.000Z'],
  ])('next 09:00 follows local calendar %s %s', (after, zone, expected) => {
    expect(new Date(nextMorning(Date.parse(after), zone)).toISOString()).toBe(expected);
  });
  it('local date differs from UTC and retry backoff is bounded', () => {
    expect(localDate(Date.parse('2026-10-08T01:00:00Z'), 'America/Chicago')).toBe('2026-10-07');
    expect(retryAt(0, 99)).toBe(6 * 60 * 60 * 1000);
    expect(retryAt(0, 0, 120)).toBe(120000);
  });
  it('missing APNs config never attempts external fetch', async () => {
    const result = await createApnsProvider({})({
      activityId: 'id',
      publicationId: 'p',
      issueIds: [],
      type: 'ISSUE_PUBLISHED',
      token: 'private',
      environment: 'sandbox',
      topic: 'app.zine.native',
    });
    expect(result).toEqual({ kind: 'configuration', reason: 'APNS_NOT_CONFIGURED' });
  });
});

describe('APNs authenticated requests and safe response handling', () => {
  async function config() {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const text = btoa(String.fromCharCode(...bytes));
    return {
      APNS_ENABLED: 'true',
      APNS_TEAM_ID: 'TEAM',
      APNS_KEY_ID: 'KEY',
      APNS_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${text}\n-----END PRIVATE KEY-----`,
    };
  }
  const input = {
    activityId: 'activity',
    publicationId: 'publication',
    issueIds: ['issue'],
    type: 'ISSUE_PUBLISHED' as const,
    token: 'a'.repeat(64),
    environment: 'sandbox' as const,
    topic: 'app.zine.native',
  };
  it('uses bearer ES256 auth, stable collapse identity and ID-only navigation', async () => {
    let captured: RequestInit | undefined;
    const provider = createApnsProvider(await config(), async (_url, init) => {
      captured = init;
      return new Response(null, { status: 200, headers: { 'apns-id': 'uuid' } });
    });
    expect(await provider(input)).toMatchObject({ kind: 'sent', apnsId: 'uuid' });
    const headers = captured!.headers as Record<string, string>;
    expect(headers.authorization.startsWith('bearer ')).toBe(true);
    expect(headers['apns-collapse-id']).toBe('activity');
    const payload = JSON.parse(captured!.body as string);
    expect(payload.activityId).toBe('activity');
    expect(payload.token).toBeUndefined();
  });
  it.each([
    [410, 'Unregistered', 'invalid-token'],
    [403, 'ExpiredProviderToken', 'configuration'],
    [429, 'TooManyRequests', 'retry'],
    [503, 'ServiceUnavailable', 'retry'],
    [400, 'BadPayload', 'permanent'],
  ])('classifies status %s safely', async (status, reason, kind) => {
    const provider = createApnsProvider(
      await config(),
      async () =>
        new Response(JSON.stringify({ reason }), {
          status: Number(status),
          headers: { 'retry-after': '120' },
        })
    );
    expect(await provider(input)).toMatchObject({ kind, reason });
  });
});
