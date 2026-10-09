import { z } from 'zod';
import { PublicationIdSchema } from '@zine/shared';
const STORAGE_KEY = 'zine.publication.intent.v1';
const IntentSchema = z
  .object({
    action: z.enum(['save', 'subscribe']),
    publicationId: PublicationIdSchema,
    issueId: PublicationIdSchema.optional(),
    selectionId: PublicationIdSchema.optional(),
    key: z.string().uuid(),
    createdAt: z.number(),
  })
  .strict()
  .refine((v) => v.action !== 'save' || Boolean(v.issueId && v.selectionId));
export type PublicationIntent = z.infer<typeof IntentSchema>;
export function readIntent(
  storage?: Pick<Storage, 'getItem' | 'removeItem'>,
  now = Date.now()
): PublicationIntent | null {
  try {
    storage ??= window.sessionStorage;
    const value = IntentSchema.safeParse(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
    if (
      !value.success ||
      now - value.data.createdAt > 30 * 60 * 1000 ||
      now < value.data.createdAt
    ) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return value.data;
  } catch {
    return null;
  }
}
export function storeIntent(
  intent: Omit<PublicationIntent, 'key' | 'createdAt'>,
  storage?: Pick<Storage, 'setItem'>
): PublicationIntent {
  const value = IntentSchema.parse({ ...intent, key: crypto.randomUUID(), createdAt: Date.now() });
  (storage ?? window.sessionStorage).setItem(STORAGE_KEY, JSON.stringify(value));
  return value;
}
export function clearIntent(storage?: Pick<Storage, 'removeItem'>) {
  try {
    (storage ?? window.sessionStorage).removeItem(STORAGE_KEY);
  } catch {
    /* Storage can be disabled. */
  }
}
export function intentPath(intent: PublicationIntent): string {
  return `${intent.issueId ? `/i/${intent.issueId}` : `/p/${intent.publicationId}`}?continue=${intent.key}`;
}
export function authContinuation(
  search: string,
  storage?: Pick<Storage, 'getItem' | 'removeItem'>
): { returnTo: string; query: string } | null {
  const intent = readIntent(storage);
  if (!intent || new URLSearchParams(search).get('continue') !== intent.key) return null;
  return { returnTo: intentPath(intent), query: `?continue=${intent.key}` };
}
