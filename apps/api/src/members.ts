import { Hono } from 'hono';
import { z } from 'zod4';
import { getItem } from './items';
import { ApiError, digest, ownedItem, stmt } from './lib';
import { spotifyMemberPage } from './providers/spotify';
import { youtubePlaylistPage } from './providers/youtube-api';
import type { AppEnv, Env } from './types';
interface MemberCursor {
  signature: string;
  page: string | number;
  version?: string;
}
export async function collectionMembers(env: Env, owner: string, itemId: string, cursor?: string) {
  const personal = await ownedItem(env, owner, itemId);
  const source = (await stmt(
    env.DB,
    'SELECT canonical_url,platform,kind FROM content_items WHERE id=?',
    personal.content_id
  ).first<{ canonical_url: string; platform: string; kind: string }>())!;
  const signature = await digest(
    JSON.stringify({ owner, itemId, generation: personal.generation, url: source.canonical_url })
  );
  let page: string | number = 0;
  let cursorVersion: string | undefined;
  if (cursor) {
    try {
      const parsed = JSON.parse(atob(cursor)) as MemberCursor;
      if (parsed.signature !== signature || !['string', 'number'].includes(typeof parsed.page))
        throw new Error();
      page = parsed.page;
      cursorVersion = parsed.version;
    } catch {
      throw new ApiError(
        422,
        'invalid_cursor',
        'Member cursor is invalid or belongs to another item'
      );
    }
  }
  const encode = (value: string | number | null | undefined, version?: string) =>
    value === null || value === undefined
      ? null
      : btoa(JSON.stringify({ signature, page: value, version }));
  if (source.platform === 'spotify') {
    const offset = z.number().int().min(0).max(1000000).safeParse(page);
    if (!offset.success) throw new ApiError(422, 'invalid_cursor', 'Invalid member offset');
    const result = await spotifyMemberPage(env, source.canonical_url, offset.data);
    return {
      items: result.items,
      total: result.total,
      nextCursor: encode(result.nextOffset),
      consistency: 'live',
      complete: result.complete,
    };
  }
  if (source.platform === 'youtube' && source.kind === 'playlist') {
    const result = await youtubePlaylistPage(
      env,
      owner,
      source.canonical_url,
      typeof page === 'string' ? page : undefined
    );
    return {
      items: result.entries,
      total: result.total ?? null,
      nextCursor: encode(result.nextCursor),
      consistency: 'live',
      complete: !result.nextCursor,
    };
  }
  const item = await getItem(env, owner, itemId, ['members']);
  const material = (item.content as Record<string, unknown>).members;
  const items = Array.isArray(material)
    ? material
    : (material as { items?: unknown[] } | undefined)?.items;
  if (!items)
    throw new ApiError(
      404,
      'members_unavailable',
      'No retained members are available for this reference'
    );
  const version = await digest(JSON.stringify(items));
  if (cursor && cursorVersion !== version)
    throw new ApiError(
      409,
      'members_changed',
      'Retained members changed; restart from the first page'
    );
  const offset = z.number().int().min(0).max(1000000).safeParse(page);
  if (!offset.success) throw new ApiError(422, 'invalid_cursor', 'Invalid member offset');
  return {
    items: items.slice(offset.data, offset.data + 50),
    total: Array.isArray(material)
      ? items.length
      : ((material as { total?: number }).total ?? items.length),
    nextCursor: offset.data + 50 < items.length ? encode(offset.data + 50, version) : null,
    consistency: 'retained',
    complete: Array.isArray(material) || (material as { complete?: boolean }).complete !== false,
  };
}
export const memberRoutes = new Hono<AppEnv>();
memberRoutes.get('/items/:itemId/members', async (c) =>
  c.json(
    await collectionMembers(
      c.env,
      c.get('principal').userId,
      c.req.param('itemId'),
      c.req.query('cursor')
    )
  )
);
