import {
  XPostSchema,
  XTimelineCaptureSchema,
  XTimelineItemSchema,
  type XPost,
  type XTimelineItem,
} from '@zine/x-archive-schema';
import { z } from 'zod';
import { uploadCapture, uploadDailySourceSnapshot, type UploadResult } from './upload';

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

const SourceMembersSchema = z
  .object({
    usernames: z.array(z.string().trim().min(1).max(64)).max(500),
    status: z.enum(['CAPTURING', 'COMPLETE', 'PARTIAL']).optional(),
    failureReason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();

const ContextStatusSchema = z
  .object({
    rootTweetId: z.string().min(1).max(64),
    status: z.enum(['COMPLETE', 'TRUNCATED', 'FAILED']),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
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
  contextBudget?: number;
  source?: {
    type: 'FOLLOWING' | 'FAVORITES' | 'LIST';
    id: string;
    name: string;
    url?: string | null;
  };
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

function summarizeContextCoverage(
  budget: number,
  records: Map<string, { status: 'COMPLETE' | 'TRUNCATED' | 'FAILED'; reason: string | null }>
) {
  const values = [...records.values()];
  return {
    budget,
    attempted: values.length,
    completed: values.filter((record) => record.status === 'COMPLETE').length,
    truncated: values.filter((record) => record.status === 'TRUNCATED').length,
    failed: values.filter((record) => record.status === 'FAILED').length,
    warnings: [
      ...new Set(
        values
          .filter((record) => record.status !== 'COMPLETE')
          .map(
            (record) =>
              record.reason ??
              (record.status === 'TRUNCATED'
                ? 'context_expansion_truncated'
                : 'context_expansion_failed')
          )
      ),
    ],
  };
}

export function startReceiver(options: ReceiverOptions): ReceiverHandle {
  const runId = options.runId ?? crypto.randomUUID();
  const startedAt = options.startedAt ?? new Date().toISOString();
  const posts = new Map<string, XPost>();
  const items = new Map<string, XTimelineItem>();
  const acceptedAdKeys = new Set<string>();
  const sourceMembers = new Set<string>();
  let sourceMembershipStatus: 'COMPLETE' | 'PARTIAL' =
    options.source?.type === 'FAVORITES' || options.source?.type === 'LIST'
      ? 'PARTIAL'
      : 'COMPLETE';
  let sourceMembershipFailureReason: string | null =
    sourceMembershipStatus === 'PARTIAL' ? 'membership_not_finalized' : null;
  const contextRecords = new Map<
    string,
    { status: 'COMPLETE' | 'TRUNCATED' | 'FAILED'; reason: string | null }
  >();
  const contextBudget =
    options.contextBudget ??
    (options.source?.type === 'FAVORITES' || options.source?.type === 'LIST' ? 40 : 0);
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
            collectorVersion: options.collectorVersion ?? 'browser-dom-v3',
            source: options.source ?? { type: 'FOLLOWING', id: 'following', name: 'Following' },
            posts: posts.size,
            items: items.size,
            excludedAds,
            sourceMemberCount: sourceMembers.size,
            sourceMembershipStatus,
            sourceMembershipFailureReason,
            contextCoverage: summarizeContextCoverage(contextBudget, contextRecords),
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
            collectorVersion: options.collectorVersion ?? 'browser-dom-v3',
            source: options.source ?? { type: 'FOLLOWING', id: 'following', name: 'Following' },
            acceptedTweetIds: orderedItems.map((item) => item.tweetId),
            acceptedPostIds: [...posts.keys()],
            acceptedAdKeys: [...acceptedAdKeys],
            nextPosition:
              orderedItems.length === 0
                ? 0
                : Math.max(...orderedItems.map((item) => item.position)) + 1,
            canonicalPosts: posts.size,
            excludedAds,
            sourceMembers: [...sourceMembers],
            sourceMembershipStatus,
            sourceMembershipFailureReason,
            contextRecords: [...contextRecords].map(([rootTweetId, record]) => ({
              rootTweetId,
              ...record,
            })),
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
      if (request.method === 'POST' && url.pathname === '/source-members') {
        const parsed = SourceMembersSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: 'Invalid source member batch', issues: parsed.error.issues },
            { status: 400, headers: corsHeaders() }
          );
        }
        for (const username of parsed.data.usernames) {
          sourceMembers.add(username.toLocaleLowerCase());
        }
        if (parsed.data.status === 'COMPLETE') {
          sourceMembershipStatus = 'COMPLETE';
          sourceMembershipFailureReason = null;
        } else if (parsed.data.status === 'PARTIAL') {
          sourceMembershipStatus = 'PARTIAL';
          sourceMembershipFailureReason = parsed.data.failureReason ?? 'membership_capture_partial';
        }
        return Response.json(
          {
            accepted: true,
            sourceMemberCount: sourceMembers.size,
            sourceMembershipStatus,
            sourceMembershipFailureReason,
          },
          { headers: corsHeaders() }
        );
      }
      if (request.method === 'POST' && url.pathname === '/context-status') {
        const parsed = ContextStatusSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: 'Invalid context status', issues: parsed.error.issues },
            { status: 400, headers: corsHeaders() }
          );
        }
        contextRecords.set(parsed.data.rootTweetId, {
          status: parsed.data.status,
          reason: parsed.data.reason ?? null,
        });
        return Response.json(
          {
            accepted: true,
            contextCoverage: summarizeContextCoverage(contextBudget, contextRecords),
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
            collectorVersion: options.collectorVersion ?? 'browser-dom-v3',
            source: options.source ?? { type: 'FOLLOWING', id: 'following', name: 'Following' },
            excludedAds: legacyExcludedAds + acceptedAdKeys.size,
            status: parsed.data.status,
            failureReason: parsed.data.failureReason ?? null,
            contextCoverage: summarizeContextCoverage(contextBudget, contextRecords),
            posts: [...posts.values()],
            items: [...items.values()].sort((left, right) => left.position - right.position),
          });
          const result = await uploadCapture(capture, {
            apiUrl: options.apiUrl,
            token: options.token,
            verify: true,
          });
          if (options.source?.type === 'FAVORITES' || options.source?.type === 'LIST') {
            await uploadDailySourceSnapshot(
              {
                runId,
                sourceId: options.source.id,
                sourceType: options.source.type,
                name: options.source.name,
                selected: true,
                capturedAt: new Date().toISOString(),
                status: sourceMembershipStatus,
                failureReason: sourceMembershipFailureReason,
                usernames: [...sourceMembers],
              },
              { apiUrl: options.apiUrl, token: options.token }
            );
          }
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
