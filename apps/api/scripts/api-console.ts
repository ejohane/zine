import { createInterface } from 'node:readline';
import { mkdir, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';

const origin = 'https://api-next.myzine.app';
const session = await realSession();
const readline = createInterface({ input: process.stdin, terminal: false });
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
await mkdir('.local-data', { recursive: true, mode: 0o700 });
await mkdir('evidence', { recursive: true });
console.log(
  JSON.stringify({
    ready: true,
    origin,
    authentication: 'real Clerk session',
    input: 'JSON lines: {method,path,body}; {quit:true} to close',
  })
);
try {
  for await (const line of readline) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as {
        method?: string;
        path?: string;
        body?: unknown;
        key?: string;
        quit?: boolean;
        label?: string;
      };
      if (request.quit) break;
      if (!request.path?.startsWith('/v1/')) throw new Error('Use a /v1/ path');
      const method = request.method ?? 'GET';
      const response = await fetch(`${origin}${request.path}`, {
        method,
        headers: {
          authorization: `Bearer ${await session.getToken()}`,
          ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(request.key ? { 'idempotency-key': request.key } : {}),
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
      const body = redact(response.status === 204 ? null : await response.json());
      const privateRecord = {
        at: new Date().toISOString(),
        method,
        path: request.path,
        status: response.status,
        requestId: response.headers.get('x-request-id'),
        body,
      };
      await appendFile('.local-data/manual-http.jsonl', JSON.stringify(privateRecord) + '\n', {
        mode: 0o600,
      });
      const publicRecord = {
        ...privateRecord,
        path: request.path
          .replace(/\?.*$/, '')
          .replace(/\b(?:itm|cnt|col|ctx|ann|sub|job|enr|tok|note)_[A-Za-z0-9_]+/g, ':id'),
        body: undefined,
        responseSha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
        responseKeys: body && typeof body === 'object' ? Object.keys(body) : [],
        label: request.label,
      };
      await appendFile('evidence/manual-http.jsonl', JSON.stringify(publicRecord) + '\n');
      console.log(JSON.stringify(privateRecord));
    } catch (error) {
      console.log(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Console operation failed',
        })
      );
    }
  }
} finally {
  readline.close();
  await session.close();
  console.log(JSON.stringify({ closed: true }));
}
