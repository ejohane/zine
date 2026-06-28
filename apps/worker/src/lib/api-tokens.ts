import { ApiTokenScopesSchema, type ApiTokenScope } from '@zine/shared/api-tokens';
import type { apiTokens } from '../db/schema';

export const API_TOKEN_PREFIX = 'zine_pat_';

export { ApiTokenScopesSchema };
export type { ApiTokenScope };

export type ApiTokenRecord = typeof apiTokens.$inferSelect;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function generateApiToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${API_TOKEN_PREFIX}${toBase64Url(bytes)}`;
}

export function getApiTokenPrefix(token: string): string {
  return token.slice(0, API_TOKEN_PREFIX.length + 8);
}

export async function hashApiToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bufferToHex(digest);
}

export function parseApiTokenScopes(scopesJson: string): ApiTokenScope[] {
  const parsed = JSON.parse(scopesJson) as unknown;
  return ApiTokenScopesSchema.parse(parsed);
}

export function hasApiTokenScope(token: ApiTokenRecord, scope: ApiTokenScope): boolean {
  try {
    return parseApiTokenScopes(token.scopesJson).includes(scope);
  } catch {
    return false;
  }
}

export function isApiTokenActive(token: ApiTokenRecord, now = Date.now()): boolean {
  return token.revokedAt === null && (token.expiresAt === null || token.expiresAt > now);
}

export function toApiTokenSummary(token: ApiTokenRecord) {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: parseApiTokenScopes(token.scopesJson),
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
  };
}
