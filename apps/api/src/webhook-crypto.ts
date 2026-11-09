import { ApiError } from './lib';
import type { Env } from './types';
const encoder = new TextEncoder();
const encode = (data: Uint8Array) => btoa(Array.from(data, (c) => String.fromCharCode(c)).join(''));
const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function key(env: Env) {
  if (!env.CREDENTIAL_KEY)
    throw new ApiError(
      503,
      'credential_storage_unavailable',
      'Signing-secret storage is not configured'
    );
  const data = decode(env.CREDENTIAL_KEY);
  if (data.length !== 32) throw new Error('Invalid credential key configuration');
  return crypto.subtle.importKey('raw', data, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealWebhookSecret(env: Env, owner: string, hookId: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`zine-api:webhook:${owner}:${hookId}`) },
    await key(env),
    encoder.encode(secret)
  );
  return `1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function openWebhookSecret(env: Env, owner: string, hookId: string, envelope: string) {
  const [version, iv, data] = envelope.split('.');
  if (version !== '1' || !iv || !data) throw new Error('Invalid webhook envelope');
  const clear = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decode(iv),
      additionalData: encoder.encode(`zine-api:webhook:${owner}:${hookId}`),
    },
    await key(env),
    decode(data)
  );
  return new TextDecoder().decode(clear);
}
export async function webhookSignature(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp + '.' + body))
  );
  return 'v1=' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
