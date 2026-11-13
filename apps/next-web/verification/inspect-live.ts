import { realSession } from '../../api/scripts/clerk-session';
import { ZineClient } from '../../api/client';
const session = await realSession();
try {
  const api = new ZineClient({ baseUrl: 'https://api-next.myzine.app', token: session.getToken });
  const me = await api.request<Record<string, unknown>>('GET', '/v1/me');
  const page = await api.list({}, { limit: 5 });
  console.log(
    JSON.stringify({
      meKeys: Object.keys(me),
      items: page.items.length,
      hasNext: !!page.nextCursor,
      contentKeys: [...new Set(page.items.flatMap((i) => Object.keys(i.content)))],
      types: page.items.map((i) => i.content.type),
      thumbnailCount: page.items.filter((i) => i.content.thumbnail).length,
    })
  );
} finally {
  await session.close();
}
