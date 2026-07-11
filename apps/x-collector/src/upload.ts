import {
  XTimelineCaptureSchema,
  X_ARCHIVE_MAX_TIMELINE_ITEMS_PER_CHUNK,
  type XPost,
  type XTimelineCapture,
  type XTimelineItem,
} from '@zine/x-archive-schema';

export type UploadOptions = {
  apiUrl: string;
  token: string;
  chunkSize?: number;
  verify?: boolean;
  fetchImpl?: typeof fetch;
};

export type UploadResult = {
  runId: string;
  chunksUploaded: number;
  postsSubmitted: number;
  timelineItemsSubmitted: number;
  verified: boolean | null;
  run: unknown;
};

type Chunk = { posts: XPost[]; items: XTimelineItem[] };

export function buildUploadChunks(capture: XTimelineCapture, requestedChunkSize = 25): Chunk[] {
  const chunkSize = Math.min(
    X_ARCHIVE_MAX_TIMELINE_ITEMS_PER_CHUNK,
    Math.max(1, requestedChunkSize)
  );
  const postById = new Map(capture.posts.map((post) => [post.tweetId, post]));
  const submittedPostIds = new Set<string>();
  const chunks: Chunk[] = [];

  for (let offset = 0; offset < capture.items.length; offset += chunkSize) {
    const items = capture.items.slice(offset, offset + chunkSize);
    const posts = items.map((item) => {
      const post = postById.get(item.tweetId);
      if (!post) throw new Error(`Missing canonical post ${item.tweetId}`);
      submittedPostIds.add(post.tweetId);
      return post;
    });
    chunks.push({ posts, items });
  }

  const remainingPosts = capture.posts.filter((post) => !submittedPostIds.has(post.tweetId));
  for (let offset = 0; offset < remainingPosts.length; offset += chunkSize) {
    chunks.push({ posts: remainingPosts.slice(offset, offset + chunkSize), items: [] });
  }
  return chunks;
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, init);
      const text = await response.text();
      const body = text ? (JSON.parse(text) as unknown) : null;
      if (response.ok) return body as T;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts) {
        throw new Error(`Archive API ${response.status}: ${text || response.statusText}`);
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError;
}

export async function uploadCapture(
  rawCapture: unknown,
  options: UploadOptions
): Promise<UploadResult> {
  const capture = XTimelineCaptureSchema.parse(rawCapture);
  const apiUrl = options.apiUrl.replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${options.token}`,
    'Content-Type': 'application/json',
  };

  const create = await requestJson<{ run: unknown }>(
    `${apiUrl}/api/v1/x-timeline/runs`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        runId: capture.runId,
        requestedCount: capture.requestedCount,
        startedAt: capture.startedAt,
        collectorVersion: capture.collectorVersion,
      }),
    },
    fetchImpl
  );

  const chunks = buildUploadChunks(capture, options.chunkSize);
  let postsSubmitted = 0;
  let timelineItemsSubmitted = 0;
  for (const [chunkIndex, chunk] of chunks.entries()) {
    await requestJson(
      `${apiUrl}/api/v1/x-timeline/runs/${encodeURIComponent(capture.runId)}/chunks/${chunkIndex}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(chunk),
      },
      fetchImpl
    );
    postsSubmitted += chunk.posts.length;
    timelineItemsSubmitted += chunk.items.length;
  }

  const completed = await requestJson<{ run: unknown }>(
    `${apiUrl}/api/v1/x-timeline/runs/${encodeURIComponent(capture.runId)}/complete`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        collectedCount: capture.items.length,
        completedAt: capture.completedAt ?? new Date().toISOString(),
        excludedAds: capture.excludedAds,
        status: capture.status,
        failureReason: capture.failureReason ?? null,
      }),
    },
    fetchImpl
  );

  let verified: boolean | null = null;
  if (options.verify !== false) {
    try {
      const verification = await requestJson<{ run: { id: string; collectedCount: number } }>(
        `${apiUrl}/api/v1/x-timeline/runs/${encodeURIComponent(capture.runId)}`,
        { headers: { Authorization: `Bearer ${options.token}` } },
        fetchImpl,
        1
      );
      verified =
        verification.run.id === capture.runId &&
        verification.run.collectedCount === capture.items.length;
      if (!verified) throw new Error('Archive verification did not match the uploaded capture');
    } catch (error) {
      if (error instanceof Error && error.message.includes('403')) verified = null;
      else throw error;
    }
  }

  return {
    runId: capture.runId,
    chunksUploaded: chunks.length,
    postsSubmitted,
    timelineItemsSubmitted,
    verified,
    run: completed.run ?? create.run,
  };
}
