import { z } from 'zod4';
import type { Env, PersonalRow, SqlValue } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
export async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
}
export async function stableId(prefix: string, ...parts: string[]) {
  return `${prefix}_${(await digest(JSON.stringify(parts))).slice(0, 40)}`;
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
export const stmt = (db: D1Database, sql: string, ...args: SqlValue[]) =>
  db.prepare(sql).bind(...args);
export async function all<T>(db: D1Database, sql: string, ...args: SqlValue[]): Promise<T[]> {
  return (await stmt(db, sql, ...args).all<T>()).results;
}
export async function ownedItem(env: Env, owner: string, itemId: string, includeDeleted = false) {
  const row = await stmt(
    env.DB,
    'SELECT * FROM personal_items WHERE id=? AND owner_id=?',
    itemId,
    owner
  ).first<PersonalRow>();
  if (!row || (!includeDeleted && row.status === 'deleted'))
    throw new ApiError(404, 'not_found', 'Item not found');
  return row;
}

/** Private aliases survive soft deletion so known duplicate arrivals stay suppressed. */
export async function canonicalItemId(env: Env, owner: string, itemId: string) {
  const visited = new Set<string>();
  for (let depth = 0; depth < 16; depth++) {
    if (visited.has(itemId)) throw new ApiError(409, 'identity_cycle', 'Invalid identity alias');
    visited.add(itemId);
    const target = await stmt(
      env.DB,
      'SELECT canonical_item_id FROM item_aliases WHERE owner_id=? AND alias_item_id=?',
      owner,
      itemId
    ).first<string>('canonical_item_id');
    if (!target) return itemId;
    itemId = target;
  }
  throw new ApiError(409, 'identity_depth', 'Identity alias chain is too deep');
}

export async function canonicalItemOperation<T>(
  env: Env,
  owner: string,
  itemId: string,
  operation: (canonicalId: string) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const canonical = await canonicalItemId(env, owner, itemId);
    try {
      return await operation(canonical);
    } catch (error) {
      if (
        error instanceof ApiError &&
        [404, 409].includes(error.status) &&
        (await canonicalItemId(env, owner, itemId)) !== canonical
      )
        continue;
      throw error;
    }
  }
  throw new ApiError(409, 'identity_changed', 'Identity changed concurrently; retry the operation');
}

export async function ownerGeneration(env: Env, owner: string) {
  return (
    (await stmt(
      env.DB,
      'SELECT generation FROM owner_generations WHERE owner_id=?',
      owner
    ).first<number>('generation')) ?? 0
  );
}

/** Keep the authentication-time epoch across awaits and internal alias/MCP dispatch. */
export async function operationGeneration(env: Env, owner: string) {
  return env.OPERATION_EPOCH?.owner === owner
    ? env.OPERATION_EPOCH.generation
    : ownerGeneration(env, owner);
}
export async function atomicOwnerWrite(
  env: Env,
  owner: string,
  statements: D1PreparedStatement[],
  epoch?: number
) {
  const generation = epoch ?? (await operationGeneration(env, owner));
  const guard = id('owner_guard');
  try {
    const result = await env.DB.batch([
      stmt(
        env.DB,
        'INSERT INTO write_guards(id,valid) SELECT ?,COALESCE((SELECT generation FROM owner_generations WHERE owner_id=?),0)=?',
        guard,
        owner,
        generation
      ),
      ...statements,
      stmt(env.DB, 'DELETE FROM write_guards WHERE id=?', guard),
    ]);
    return result.slice(1, -1);
  } catch (error) {
    if (String(error).includes('CHECK constraint failed: valid=1'))
      throw new ApiError(
        409,
        'account_data_erased',
        'Account data was erased while this operation was in progress'
      );
    throw error;
  }
}

/** Optimistic guard executes inside the same atomic D1 batch as all writes. */
export async function atomicItemWrite<T>(
  env: Env,
  owner: string,
  itemId: string,
  build: (row: PersonalRow | null) => Promise<{ statements: D1PreparedStatement[]; result: T }>
): Promise<T> {
  const epoch = await operationGeneration(env, owner);
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await stmt(
      env.DB,
      'SELECT * FROM personal_items WHERE id=? AND owner_id=?',
      itemId,
      owner
    ).first<PersonalRow>();
    if (row?.status === 'deleted' && (await canonicalItemId(env, owner, itemId)) !== itemId)
      throw new ApiError(
        409,
        'identity_changed',
        'This identity was reconciled; retry the operation'
      );
    const { statements, result } = await build(row);
    const guard = id('guard');
    try {
      await env.DB.batch([
        stmt(
          env.DB,
          'INSERT INTO write_guards(id,valid) SELECT ?, COALESCE((SELECT revision FROM personal_items WHERE id=?),-1)=? AND COALESCE((SELECT generation FROM owner_generations WHERE owner_id=?),0)=?',
          guard,
          itemId,
          row?.revision ?? -1,
          owner,
          epoch
        ),
        ...statements,
        stmt(env.DB, 'DELETE FROM write_guards WHERE id=?', guard),
      ]);
      return result;
    } catch (e) {
      if (String(e).includes('CHECK constraint failed: valid=1')) {
        if ((await ownerGeneration(env, owner)) !== epoch)
          throw new ApiError(
            409,
            'account_data_erased',
            'Account data was erased while this operation was in progress'
          );
        continue;
      }
      throw e;
    }
  }
  throw new ApiError(
    409,
    'concurrent_write',
    'Concurrent update; retry with the same idempotency key'
  );
}

export const shortText = z.string().trim().min(1).max(20000);
export const tagsSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(100)
  .transform((tags) => [...new Set(tags)]);
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 1024 * 1024) throw new ApiError(413, 'body_too_large', 'Request exceeds 1 MiB');
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(415, 'json_required', 'Use application/json');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'invalid_json', 'JSON body required');
  let text = '';
  let bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.length;
    if (bytes > 1024 * 1024) {
      await reader.cancel();
      throw new ApiError(413, 'body_too_large', 'Request exceeds 1 MiB');
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Malformed JSON');
  }
  const result = schema.safeParse(json);
  if (!result.success)
    throw new ApiError(
      422,
      'validation_error',
      'Invalid request',
      result.error.issues.map(({ path, message }) => ({ path, message }))
    );
  return result.data;
}

export async function requireCollections(env: Env, owner: string, ids: string[]) {
  for (const collectionId of ids) {
    if (
      !(await stmt(
        env.DB,
        'SELECT id FROM collections WHERE id=? AND owner_id=?',
        collectionId,
        owner
      ).first())
    ) {
      throw new ApiError(404, 'collection_not_found', 'Collection not found');
    }
  }
}

export function assertPresent(row: PersonalRow | null): asserts row is PersonalRow {
  if (!row || row.status === 'deleted') throw new ApiError(404, 'not_found', 'Item not found');
}
