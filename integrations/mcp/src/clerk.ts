import { z } from 'zod';
import type { McpConfig, Principal } from './auth';

export const CLERK_ISSUER = 'https://clerk.myzine.app';
export const CLERK_VERIFY_URL = 'https://api.clerk.com/v1/oauth_applications/access_tokens/verify';

export class AuthenticationUnavailable extends Error {
  constructor() {
    super('AUTHENTICATION_UNAVAILABLE');
  }
}

export function clerkClients(cfg: McpConfig): string[] {
  try {
    // Clerk Dashboard can issue public client IDs without the API example's
    // `client_` prefix. Treat IDs as bounded identifiers; admission still uses
    // an exact comparison with this explicit allowlist.
    return z
      .array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/))
      .min(1)
      .max(20)
      .parse(JSON.parse(cfg.MCP_CLERK_CLIENT_IDS ?? ''));
  } catch {
    throw new Error('MCP_NOT_CONFIGURED');
  }
}

const verifiedToken = z
  .object({
    object: z.literal('clerk_idp_oauth_access_token'),
    subject: z.string().regex(/^user_[A-Za-z0-9]+$/),
    client_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    scopes: z.array(z.string().min(1).max(200)).max(100),
    aud: z.array(z.string().url()).length(1),
    revoked: z.literal(false),
    expired: z.literal(false),
    active: z.literal(true).optional(),
    expiration: z.number().int().positive(),
    // Token exchange/delegated actor chains are intentionally outside this integration.
    act: z.never().optional(),
  })
  .passthrough();

/** Clerk's opaque access token verification, never session-token or ID-token fallback. */
export async function authenticateClerkOpaque(token: string, cfg: McpConfig): Promise<Principal> {
  if (!/^oat_[A-Za-z0-9_-]{16,2048}$/.test(token)) throw new Error('UNAUTHORIZED');
  let response: Response;
  try {
    response = await fetch(CLERK_VERIFY_URL, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: `Bearer ${cfg.MCP_CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Clerk-API-Version': '2026-05-12',
      },
      body: JSON.stringify({ access_token: token }),
    });
  } catch {
    throw new AuthenticationUnavailable();
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status >= 500 || response.status === 429) throw new AuthenticationUnavailable();
    throw new Error('UNAUTHORIZED');
  }
  let data: unknown;
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    let text = '',
      size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 32768) throw new Error();
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      data = JSON.parse(text);
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  } catch {
    throw new AuthenticationUnavailable();
  }
  const parsed = verifiedToken.safeParse(data);
  if (!parsed.success) throw new Error('UNAUTHORIZED');
  const record = parsed.data,
    now = Math.floor(Date.now() / 1000);
  // Clerk's public verification API expresses expiration in Unix seconds.
  // Do not infer an audience from the OAuth client ID or from the requested URL.
  if (
    record.aud[0] !== cfg.MCP_RESOURCE ||
    !(cfg.MCP_CLERK_CLIENT_POLICY === 'instance' || clerkClients(cfg).includes(record.client_id)) ||
    record.expiration <= now ||
    record.expiration > now + 86400
  )
    throw new Error('UNAUTHORIZED');
  return { userId: record.subject, scopes: record.scopes };
}
