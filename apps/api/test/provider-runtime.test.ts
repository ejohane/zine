import { afterEach, describe, expect, it } from 'vitest';
import { Miniflare, createFetchMock } from 'miniflare';
import { build } from 'esbuild';

let runtime: Miniflare | undefined;
afterEach(async () => runtime?.dispose());
async function worker() {
  const bundle = await build({
    stdin: {
      contents: `import {extractSpotify} from './src/providers/spotify'; import {ProviderError} from './src/remote';
    export default { async fetch(request,env) { try { return Response.json(await extractSpotify(env,'https://open.spotify.com/episode/1234567890123456789012')); } catch(error) {return Response.json({code:error instanceof ProviderError?error.code:'unexpected_runtime_error'}, {status:502});} } };`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['node:*'],
  });
  const mock = createFetchMock();
  mock.disableNetConnect();
  return { bundle: bundle.outputFiles[0].text, mock };
}
describe('provider requests inside workerd', () => {
  it('performs token and metadata requests using supported Worker fetch options', async () => {
    const { bundle, mock } = await worker();
    mock
      .get('https://accounts.spotify.com')
      .intercept({ path: '/api/token', method: 'POST' })
      .reply(200, { access_token: 'synthetic-provider-token', expires_in: 3600 });
    mock
      .get('https://api.spotify.com')
      .intercept({ path: '/v1/episodes/1234567890123456789012?market=US', method: 'GET' })
      .reply(200, {
        id: '1234567890123456789012',
        name: 'Episode',
        type: 'episode',
        duration_ms: 120000,
        description: 'Actual episode description',
        show: { id: '1234567890123456789013', name: 'Show', publisher: 'Publisher' },
      });
    runtime = new Miniflare({
      modules: true,
      script: bundle,
      compatibilityDate: '2026-07-30',
      compatibilityFlags: ['nodejs_compat'],
      fetchMock: mock,
      bindings: {
        SPOTIFY_CLIENT_ID: 'synthetic-client',
        SPOTIFY_CLIENT_SECRET: 'synthetic-secret',
      },
    });
    const response = await runtime.dispatchFetch('http://localhost');
    const value = (await response.json()) as { contributions: { field: string; value: unknown }[] };
    expect(response.status).toBe(200);
    expect(value.contributions.find((field) => field.field === 'durationSeconds')?.value).toBe(120);
  });
  it('retrieves official YouTube metadata without a public-page dependency', async () => {
    const built = await build({
      stdin: {
        contents: `import {youtubeApiExtraction} from './src/providers/youtube-api';export default {async fetch(request,env){return Response.json(await youtubeApiExtraction(env,undefined,'https://www.youtube.com/watch?v=abcdefghijk'));}};`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      external: ['node:*'],
    });
    const requests: string[] = [];
    runtime = new Miniflare({
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-07-30',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { YOUTUBE_API_KEY: 'synthetic-key' },
      outboundService: (request: Request) => {
        const url = new URL(request.url);
        requests.push(url.hostname + url.pathname);
        expect(url.hostname).toBe('www.googleapis.com');
        expect(url.searchParams.get('id')).toBe('abcdefghijk');
        return Response.json({
          items: [
            {
              id: 'abcdefghijk',
              snippet: {
                title: 'Video title',
                description: '00:00 Introduction\n01:30 Database design',
                channelTitle: 'Creator',
                channelId: 'UCexample',
                publishedAt: '2025-01-01T00:00:00Z',
                tags: ['databases'],
              },
              contentDetails: { duration: 'PT12M3S' },
            },
          ],
        });
      },
    });
    const response = await runtime.dispatchFetch('http://localhost');
    const extraction = (await response.json()) as {
      contributions: { field: string; value: unknown }[];
      components: { component: string; status: string }[];
    };
    expect(response.status).toBe(200);
    expect(extraction.contributions.find((value) => value.field === 'durationSeconds')?.value).toBe(
      723
    );
    expect(extraction.contributions.find((value) => value.field === 'chapters')?.value).toEqual([
      { startSeconds: 0, title: 'Introduction' },
      { startSeconds: 90, title: 'Database design' },
    ]);
    expect(extraction.components).toContainEqual({
      component: 'transcript',
      status: 'unavailable',
      reasonCode: 'youtube_caption_download_requires_video_permissions',
    });
    expect(requests).toEqual(['www.googleapis.com/youtube/v3/videos']);
  });
  it('polls an X creator by stored provider identity after its display handle changes', async () => {
    const built = await build({
      stdin: {
        contents: `import {xSourcePage} from './src/providers/x';export default {async fetch(request,env){return Response.json(await xSourcePage(env,'https://x.com/old_handle',undefined,'123456'));}};`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      external: ['node:*'],
    });
    const paths: string[] = [];
    runtime = new Miniflare({
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-07-30',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { X_BEARER_TOKEN: 'synthetic-app-token' },
      outboundService: (request: Request) => {
        const url = new URL(request.url);
        paths.push(url.pathname);
        return Response.json({
          data: [
            {
              id: '789',
              text: 'New post from the same creator',
              author_id: '123456',
              created_at: '2026-11-08T12:00:00Z',
            },
          ],
        });
      },
    });
    const response = await runtime.dispatchFetch('http://localhost');
    expect(response.status).toBe(200);
    expect(paths).toEqual(['/2/users/123456/tweets']);
    const page = (await response.json()) as { entries: { id: string }[]; newestFirst: boolean };
    expect(page.entries[0].id).toBe('x:post:789');
    expect(page.newestFirst).toBe(true);
  });
  it('rejects a provider redirect without forwarding credentials to its target', async () => {
    const { bundle } = await worker();
    const hosts: string[] = [];
    runtime = new Miniflare({
      modules: true,
      script: bundle,
      compatibilityDate: '2026-07-30',
      compatibilityFlags: ['nodejs_compat'],
      outboundService: (request: Request) => {
        hosts.push(new URL(request.url).hostname);
        return new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/collect' },
        });
      },
      bindings: {
        SPOTIFY_CLIENT_ID: 'synthetic-client-2',
        SPOTIFY_CLIENT_SECRET: 'synthetic-secret',
      },
    });
    const response = await runtime.dispatchFetch('http://localhost');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: 'provider_redirect_rejected' });
    expect(hosts).toEqual(['accounts.spotify.com']);
  });
});
