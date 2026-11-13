import { realSession } from '../../api/scripts/clerk-session';
import { ZineClient } from '../../api/client';
const session = await realSession();
let count = 0;
try {
  const api = new ZineClient({ baseUrl: 'https://api-next.myzine.app', token: session.getToken });
  for await (const item of api.items({ tags: ['zine-web-verification'] })) {
    const match = item.content.url.match(
      /^https:\/\/example\.com\/zine-web-proof\/([a-f0-9-]{36})$/
    );
    if (!match || !item.context.some((c) => c.text === 'Connected browser acceptance ' + match[1]))
      throw Error('Refusing cleanup of unrecognized verification data');
    await api.request('DELETE', '/v1/items/' + encodeURIComponent(item.id));
    count++;
  }
  console.log(JSON.stringify({ controlledVerificationReferencesRemoved: count }));
} finally {
  await session.close();
}
