import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';

const args = process.argv.slice(2);
const command = args.shift() ?? 'help';
const positional: string[] = [];
const flags = new Map<string, string[]>();
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const name = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    flags.set(name, [...(flags.get(name) ?? []), value]);
  } else positional.push(args[i]);
}
const flag = (name: string) => flags.get(name)?.at(-1);
const origin = process.env.ZINE_API_BASE_URL ?? 'https://api-next.myzine.app';
const base = new URL(origin);
if (
  base.protocol !== 'https:' &&
  !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))
)
  throw new Error('Use HTTPS or a loopback development API');
if (command === 'help') {
  console.log(`Zine API CLI

Authentication: inject ZINE_API_TOKEN (never pass credentials as command arguments).
Verification login: secretsctl run zine.test -- bun run scripts/zine.ts <command>

save URL [--context TEXT] [--tag TAG] [--collection ID] [--key KEY]
get ITEM_ID [--include transcript,article,thread]
list [--type TYPE] [--tag TAG] [--status saved|received|dismissed] [--archived true|false]
search QUERY [--match keyword|semantic|hybrid] [--tag TAG] [--type TYPE]
request METHOD /v1/PATH [JSON_BODY] [--key KEY]

Use --limit, --cursor and --output FILE where applicable. Private output files
are created with mode 0600 and must not already exist. Credential values are redacted.`);
  process.exit(0);
}
const session = !process.env.ZINE_API_TOKEN ? await realSession() : null;
try {
  let path: string;
  let method = 'GET';
  let body: unknown;
  let key = flag('key');
  if (command === 'save') {
    if (!positional[0]) throw new Error('A URL is required');
    path = '/v1/saves';
    method = 'POST';
    key ??= randomUUID();
    body = {
      url: positional[0],
      ...(flag('context') ? { context: { text: flag('context') } } : {}),
      ...(flags.has('tag') ? { tags: flags.get('tag') } : {}),
      ...(flags.has('collection') ? { collectionIds: flags.get('collection') } : {}),
    };
  } else if (command === 'get') {
    if (!/^itm_[a-f0-9]+$/.test(positional[0] ?? ''))
      throw new Error('A personal item ID is required');
    path = `/v1/items/${positional[0]}${flag('include') ? `?include=${encodeURIComponent(flag('include')!)}` : ''}`;
  } else if (command === 'list') {
    const query = new URLSearchParams();
    for (const name of [
      'type',
      'tag',
      'status',
      'archived',
      'limit',
      'cursor',
      'collectionId',
      'completed',
    ])
      if (flag(name)) query.set(name, flags.get(name)!.join(','));
    path = `/v1/items?${query}`;
  } else if (command === 'search') {
    if (!positional[0]) throw new Error('A search query is required');
    path = '/v1/items/search';
    method = 'POST';
    body = {
      query: positional.join(' '),
      match: flag('match') ?? 'hybrid',
      filters: {
        ...(flags.has('tag') ? { tags: flags.get('tag') } : {}),
        ...(flags.has('type') ? { types: flags.get('type') } : {}),
      },
      ...(flag('limit') ? { limit: Number(flag('limit')) } : {}),
      ...(flag('cursor') ? { cursor: flag('cursor') } : {}),
    };
  } else if (command === 'request') {
    method = positional[0]?.toUpperCase();
    path = positional[1];
    if (positional[2]) body = JSON.parse(positional.slice(2).join(' '));
  } else throw new Error('Unknown command. Run with help.');
  if (!path.startsWith('/v1/') || !['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method))
    throw new Error('Use a supported method and /v1/ path');
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = process.env.ZINE_API_TOKEN ?? (await session!.getToken());
    response = await fetch(new URL(path, origin), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (response.status < 500 || attempt === 2 || (method !== 'GET' && !key)) break;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  const value = response!.status === 204 ? { deleted: true } : await response!.json();
  const redact = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(redact)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).map(([key, v]) => [
              key,
              /^(token|access_token|refresh_token|authorization|secret)$/i.test(key)
                ? '[redacted]'
                : redact(v),
            ])
          )
        : value;
  const output = JSON.stringify(redact(value), null, 2) + '\n';
  if (flag('output')) await writeFile(flag('output')!, output, { mode: 0o600, flag: 'wx' });
  else process.stdout.write(output);
  if (!response!.ok) process.exitCode = 1;
} finally {
  await session?.close();
}
