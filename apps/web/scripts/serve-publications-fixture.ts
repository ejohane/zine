/** Isolated public-host fixture server. No auth bypass and no production/API writes. */
import path from 'node:path';
import type { PublicWorkerEnv } from '../src/public-worker';
import { pathToFileURL } from 'node:url';
const bundle =
  process.env.PUBLIC_WORKER_BUNDLE || '/tmp/zine-public-sharing-bundle/public-worker.js';
const { default: publicWorker } = (await import(pathToFileURL(bundle).href)) as {
  default: { fetch(request: Request, env: PublicWorkerEnv): Promise<Response> };
};
import fixture from '../../../packages/shared/src/fixtures/publications/v1.json';
const directory = path.resolve(import.meta.dir, '../dist');
const id = fixture.publicIssue.id;
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PUBLIC_FIXTURE_PORT || 45273),
  fetch(request) {
    return publicWorker.fetch(request, {
      UPSTREAM_API_URL: 'https://fixture.invalid',
      APPLE_APPLICATION_IDENTIFIER: 'TRA7965NM5.app.zine.native',
      API: {
        async fetch(upstream) {
          const url = new URL(upstream.url);
          if (upstream.method !== 'GET')
            return Response.json({ error: 'Fixture server is read-only.' }, { status: 403 });
          if (url.pathname === `/api/v1/issues/${id}`)
            return Response.json({ issue: fixture.publicIssue });
          if (url.pathname === `/api/v1/publications/${fixture.publicPublication.id}`)
            return Response.json({ publication: fixture.publicPublication });
          if (url.pathname === `/api/v1/publications/${fixture.publicPublication.id}/issues`)
            return Response.json({ issues: [fixture.publicIssue], nextCursor: null });
          return new Response(null, { status: 404 });
        },
      },
      ASSETS: {
        async fetch(assetRequest) {
          const target = path.resolve(directory, '.' + new URL(assetRequest.url).pathname);
          if (!target.startsWith(directory + path.sep)) return new Response(null, { status: 404 });
          const file = Bun.file(target);
          return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
        },
      },
    });
  },
});
console.log(`Isolated publication fixture host: ${server.url}i/${id}`);
