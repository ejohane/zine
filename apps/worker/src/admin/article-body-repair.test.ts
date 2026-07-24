import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  acquireArticleBody,
  processArticleBodyQueueMessage,
  getArticleBodyStatus,
  markArticleBodyUnavailable,
  resolveArticleBodyDlqEvents,
  createDb,
} = vi.hoisted(() => ({
  acquireArticleBody: vi.fn(),
  processArticleBodyQueueMessage: vi.fn(),
  getArticleBodyStatus: vi.fn(),
  markArticleBodyUnavailable: vi.fn(),
  resolveArticleBodyDlqEvents: vi.fn(),
  createDb: vi.fn(() => ({ kind: 'db' })),
}));

vi.mock('../article-body/acquisition', async (importOriginal) => ({
  ...(await importOriginal()),
  acquireArticleBody,
}));
vi.mock('../article-body/processor', () => ({ processArticleBodyQueueMessage }));
vi.mock('../article-body/service', () => ({
  getArticleBodyStatus,
  markArticleBodyUnavailable,
  resolveArticleBodyDlqEvents,
}));
vi.mock('../db', () => ({ createDb }));

import {
  ArticleBodyCandidateRepairSchema,
  repairArticleBodyFromCandidate,
} from './article-body-repair';

const candidate = {
  html: '<article><p>A reviewed public article body.</p></article>',
  sourceKind: 'PUBLIC_NEWSLETTER' as const,
  sourceUrl: 'https://newsletter.example.com/post',
};
const artifact = {
  schemaVersion: 1,
  extractorVersion: 9,
  sourceKind: 'PUBLIC_NEWSLETTER',
  sourceUrl: candidate.sourceUrl,
  contentHash: `sha256:${'a'.repeat(64)}`,
  wordCount: 720,
  readingTimeMinutes: 4,
  qualityScore: 1,
  qualityWarnings: [],
};

function environment(item: Record<string, unknown> | null = {}) {
  const first = vi.fn().mockResolvedValue(
    item === null
      ? null
      : {
          id: 'item_1',
          canonical_url: 'https://newsletter.example.com/post',
          title: 'Reviewed post',
          publisher: 'Example',
          published_at: null,
          ...item,
        }
  );
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { DB: { prepare }, ARTICLE_CONTENT: {} } as never;
}

describe('article-body candidate repair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquireArticleBody.mockResolvedValue({
      status: 'AVAILABLE',
      artifact,
      attempts: [],
      errorCode: null,
      lastHttpStatus: null,
    });
    getArticleBodyStatus.mockResolvedValue({ status: 'AVAILABLE' });
  });

  it('previews a bounded candidate without publishing it', async () => {
    const result = await repairArticleBodyFromCandidate(environment(), {
      itemId: 'item_1',
      dryRun: true,
      candidate,
    });

    expect(result).toMatchObject({
      dryRun: true,
      published: false,
      preview: { contentHash: artifact.contentHash, qualityScore: 1, wordCount: 720 },
    });
    expect(processArticleBodyQueueMessage).not.toHaveBeenCalled();
  });

  it('publishes only the exact candidate confirmed after dry-run', async () => {
    const env = environment();
    const result = await repairArticleBodyFromCandidate(env, {
      itemId: 'item_1',
      dryRun: false,
      confirmedContentHash: artifact.contentHash,
      candidate,
    });

    expect(processArticleBodyQueueMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item_1',
        trigger: 'repair',
        embeddedCandidates: [candidate],
      }),
      expect.anything(),
      env
    );
    expect(result).toMatchObject({ published: true, currentStatus: 'AVAILABLE' });
  });

  it('rejects a changed candidate hash', async () => {
    await expect(
      repairArticleBodyFromCandidate(environment(), {
        itemId: 'item_1',
        dryRun: false,
        confirmedContentHash: `sha256:${'b'.repeat(64)}`,
        candidate,
      })
    ).rejects.toMatchObject({
      code: 'HASH_MISMATCH',
      status: 409,
    });
    expect(processArticleBodyQueueMessage).not.toHaveBeenCalled();
  });

  it('rejects unsafe sources and oversized candidates at the boundary', async () => {
    await expect(
      repairArticleBodyFromCandidate(environment(), {
        itemId: 'item_1',
        dryRun: true,
        candidate: { ...candidate, sourceUrl: 'http://127.0.0.1/private' },
      })
    ).rejects.toMatchObject({ code: 'UNSAFE_SOURCE_URL', status: 422 });

    expect(
      ArticleBodyCandidateRepairSchema.safeParse({
        itemId: 'item_1',
        dryRun: true,
        candidate: { ...candidate, html: 'x'.repeat(90 * 1024) },
      }).success
    ).toBe(false);
  });

  it('dry-runs and confirms an authoritative terminal repair', async () => {
    const env = environment();
    const terminal = {
      errorCode: 'HTTP_404' as const,
      sourceUrl: 'https://newsletter.example.com/api/v1/posts/missing',
    };

    const dryRun = await repairArticleBodyFromCandidate(env, {
      itemId: 'item_1',
      dryRun: true,
      terminal,
    });
    expect(dryRun).toMatchObject({
      dryRun: true,
      preview: { status: 'UNAVAILABLE', errorCode: 'HTTP_404', httpStatus: 404 },
    });
    expect(markArticleBodyUnavailable).not.toHaveBeenCalled();

    getArticleBodyStatus.mockResolvedValue({ status: 'UNAVAILABLE' });
    const result = await repairArticleBodyFromCandidate(env, {
      itemId: 'item_1',
      dryRun: false,
      confirmedTerminalCode: 'HTTP_404',
      terminal,
    });
    expect(markArticleBodyUnavailable).toHaveBeenCalledWith(
      expect.anything(),
      'item_1',
      'HTTP_404',
      { httpStatus: 404 }
    );
    expect(resolveArticleBodyDlqEvents).toHaveBeenCalledWith(expect.anything(), 'item_1', 9);
    expect(result).toMatchObject({ published: false, currentStatus: 'UNAVAILABLE' });
  });
});
