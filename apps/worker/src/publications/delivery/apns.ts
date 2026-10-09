import { importPKCS8, SignJWT } from 'jose';
export interface ApnsConfig {
  APNS_ENABLED?: string;
  APNS_TEAM_ID?: string;
  APNS_KEY_ID?: string;
  APNS_PRIVATE_KEY?: string;
  APNS_TOPIC?: string;
}
export interface PushRequest {
  activityId: string;
  publicationId: string;
  issueIds: string[];
  type: 'ISSUE_PUBLISHED' | 'DAILY_ADDITIONS';
  token: string;
  environment: 'sandbox' | 'production';
  topic: string;
}
export interface PushResult {
  kind: 'sent' | 'retry' | 'invalid-token' | 'configuration' | 'permanent';
  reason: string;
  apnsId?: string;
  retryAfterSeconds?: number;
}
export type PushProvider = (request: PushRequest) => Promise<PushResult>;
export function apnsConfigured(config: ApnsConfig) {
  return (
    config.APNS_ENABLED === 'true' &&
    !!config.APNS_TEAM_ID &&
    !!config.APNS_KEY_ID &&
    !!config.APNS_PRIVATE_KEY
  );
}
/** Apple token authentication; no credentials/device tokens in logs or result details. */
export function createApnsProvider(
  config: ApnsConfig,
  fetcher: typeof fetch = fetch,
  clock = () => Date.now()
): PushProvider {
  let cached: { token: string; expires: number } | undefined;
  return async (input) => {
    if (!apnsConfigured(config)) return { kind: 'configuration', reason: 'APNS_NOT_CONFIGURED' };
    if (input.topic !== (config.APNS_TOPIC || 'app.zine.native'))
      return { kind: 'configuration', reason: 'TOPIC_MISMATCH' };
    try {
      if (!cached || cached.expires <= clock()) {
        const key = await importPKCS8(config.APNS_PRIVATE_KEY!, 'ES256');
        const token = await new SignJWT({})
          .setProtectedHeader({ alg: 'ES256', kid: config.APNS_KEY_ID! })
          .setIssuer(config.APNS_TEAM_ID!)
          .setIssuedAt(Math.floor(clock() / 1000))
          .sign(key);
        cached = { token, expires: clock() + 50 * 60_000 };
      }
    } catch {
      return { kind: 'configuration', reason: 'INVALID_PROVIDER_KEY' };
    }
    try {
      const response = await fetcher(
        `https://${input.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'}/3/device/${input.token}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: {
            authorization: `bearer ${cached.token}`,
            'content-type': 'application/json',
            'apns-topic': input.topic,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-id': crypto.randomUUID(),
            'apns-collapse-id': input.activityId,
            'apns-expiration': String(Math.floor(clock() / 1000) + 86400),
          },
          body: JSON.stringify({
            aps: {
              alert: {
                title: 'Zine',
                body:
                  input.type === 'ISSUE_PUBLISHED'
                    ? 'A new issue is ready to read.'
                    : 'New selections are ready to explore.',
              },
              sound: 'default',
            },
            activityId: input.activityId,
            publicationId: input.publicationId,
            issueIds: input.issueIds,
            type: input.type,
          }),
        }
      );
      const apnsId = response.headers.get('apns-id') || undefined;
      if (response.status === 200) return { kind: 'sent', reason: 'ACCEPTED', apnsId };
      let reason = 'PROVIDER_REJECTED';
      try {
        const data = (await response.json()) as { reason?: unknown };
        if (typeof data.reason === 'string' && /^[A-Za-z]+$/.test(data.reason))
          reason = data.reason;
      } catch {
        /* safe fallback */
      }
      if (
        response.status === 410 ||
        reason === 'BadDeviceToken' ||
        reason === 'DeviceTokenNotForTopic'
      )
        return { kind: 'invalid-token', reason, apnsId };
      if (response.status === 403) {
        cached = undefined;
        return { kind: 'configuration', reason, apnsId };
      }
      if (response.status === 429 || response.status >= 500) {
        const h = response.headers.get('retry-after');
        const seconds = h
          ? /^\d+$/.test(h)
            ? Number(h)
            : Math.max(0, (Date.parse(h) - clock()) / 1000)
          : undefined;
        return {
          kind: 'retry',
          reason,
          apnsId,
          retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
        };
      }
      return { kind: 'permanent', reason, apnsId };
    } catch {
      return { kind: 'retry', reason: 'NETWORK_ERROR' };
    }
  };
}
