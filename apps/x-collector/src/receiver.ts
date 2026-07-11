import {
  XPostSchema,
  XTimelineCaptureSchema,
  XTimelineItemSchema,
  type XPost,
  type XTimelineItem,
} from '@zine/x-archive-schema';
import { z } from 'zod';
import { uploadCapture, type UploadResult } from './upload';

const BatchSchema = z
  .object({
    posts: z.array(XPostSchema).max(200),
    items: z.array(XTimelineItemSchema).max(100),
    adKeys: z.array(z.string().min(1).max(1_000)).max(200).default([]),
    excludedAds: z.number().int().nonnegative().default(0),
  })
  .strict();

const CompleteSchema = z
  .object({
    status: z.enum(['COMPLETE', 'PARTIAL']).default('COMPLETE'),
    failureReason: z.string().max(2_000).nullable().optional(),
  })
  .strict();

export type ReceiverOptions = {
  requestedCount: number;
  apiUrl: string;
  token: string;
  port?: number;
  collectorVersion?: string;
  runId?: string;
  startedAt?: string;
};

export type ReceiverHandle = {
  url: string;
  runId: string;
  completed: Promise<UploadResult>;
  stop: () => void;
};

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

export function startReceiver(options: ReceiverOptions): ReceiverHandle {
  const runId = options.runId ?? crypto.randomUUID();
  const startedAt = options.startedAt ?? new Date().toISOString();
  const posts = new Map<string, XPost>();
  const items = new Map<string, XTimelineItem>();
  const acceptedAdKeys = new Set<string>();
  let legacyExcludedAds = 0;
  let resolveCompleted!: (result: UploadResult) => void;
  let rejectCompleted!: (error: unknown) => void;
  const completed = new Promise<UploadResult>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: options.port ?? 4319,
    async fetch(request) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
      const url = new URL(request.url);
      const excludedAds = legacyExcludedAds + acceptedAdKeys.size;
      if (request.method === 'GET' && url.pathname === '/session') {
        return Response.json(
          {
            runId,
            startedAt,
            requestedCount: options.requestedCount,
            collectorVersion: options.collectorVersion ?? 'browser-dom-v2',
            posts: posts.size,
            items: items.size,
            excludedAds,
            nextPosition:
              items.size === 0
                ? 0
                : Math.max(...[...items.values()].map((item) => item.position)) + 1,
          },
          { headers: corsHeaders() }
        );
      }
      if (request.method === 'GET' && url.pathname === '/checkpoint') {
        const orderedItems = [...items.values()].sort(
          (left, right) => left.position - right.position
        );
        return Response.json(
          {
            runId,
            startedAt,
            requestedCount: options.requestedCount,
            collectorVersion: options.collectorVersion ?? 'browser-dom-v2',
            acceptedTweetIds: orderedItems.map((item) => item.tweetId),
            acceptedAdKeys: [...acceptedAdKeys],
            nextPosition:
              orderedItems.length === 0
                ? 0
                : Math.max(...orderedItems.map((item) => item.position)) + 1,
            canonicalPosts: posts.size,
            excludedAds,
          },
          { headers: corsHeaders() }
        );
      }
      if (request.method === 'POST' && url.pathname === '/batch') {
        const parsed = BatchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: 'Invalid collector batch', issues: parsed.error.issues },
            { status: 400, headers: corsHeaders() }
          );
        }
        for (const post of parsed.data.posts) posts.set(post.tweetId, post);
        for (const item of parsed.data.items) {
          if (!items.has(item.tweetId)) items.set(item.tweetId, item);
        }
        if (parsed.data.adKeys.length > 0) {
          for (const adKey of parsed.data.adKeys) acceptedAdKeys.add(adKey);
        } else {
          legacyExcludedAds += parsed.data.excludedAds;
        }
        const updatedExcludedAds = legacyExcludedAds + acceptedAdKeys.size;
        return Response.json(
          {
            accepted: true,
            canonicalPosts: posts.size,
            timelineItems: items.size,
            excludedAds: updatedExcludedAds,
          },
          { headers: corsHeaders() }
        );
      }
      if (request.method === 'POST' && url.pathname === '/complete') {
        const parsed = CompleteSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: 'Invalid completion payload', issues: parsed.error.issues },
            { status: 400, headers: corsHeaders() }
          );
        }
        try {
          const capture = XTimelineCaptureSchema.parse({
            runId,
            requestedCount: options.requestedCount,
            startedAt,
            completedAt: new Date().toISOString(),
            collectorVersion: options.collectorVersion ?? 'browser-dom-v2',
            excludedAds: legacyExcludedAds + acceptedAdKeys.size,
            status: parsed.data.status,
            failureReason: parsed.data.failureReason ?? null,
            posts: [...posts.values()],
            items: [...items.values()].sort((left, right) => left.position - right.position),
          });
          const result = await uploadCapture(capture, {
            apiUrl: options.apiUrl,
            token: options.token,
            verify: true,
          });
          resolveCompleted(result);
          setTimeout(() => server.stop(), 100);
          return Response.json({ success: true, ...result }, { headers: corsHeaders() });
        } catch (error) {
          rejectCompleted(error);
          return Response.json(
            { success: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500, headers: corsHeaders() }
          );
        }
      }
      return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders() });
    },
  });

  return {
    url: `http://${server.hostname}:${server.port}`,
    runId,
    completed,
    stop: () => server.stop(),
  };
}
