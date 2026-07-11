import {
  EDITORIAL_SCHEMA_VERSION,
  EditorialSnapshotSchema,
  type EditorialSnapshot,
  type EditorialSnapshotDocument,
  type SourceReference,
} from '@zine/editorial-schema';

type JsonRecord = Record<string, unknown>;

export type SnapshotOptions = {
  token: string;
  archiveToken: string;
  apiUrl: string;
  xApiUrl: string;
  now: Date;
  timezone: string;
  editionDate: string;
  snapshotKey: string;
};

function valueString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function valueNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

function timestamp(value: unknown, fallback: string): string {
  const parsed = valueString(value);
  return parsed && !Number.isNaN(Date.parse(parsed)) ? new Date(parsed).toISOString() : fallback;
}

async function getJson(url: string, token: string): Promise<JsonRecord> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
  return (await response.json()) as JsonRecord;
}

async function getOptionalJson(url: string, token: string): Promise<JsonRecord | null> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
  return (await response.json()) as JsonRecord;
}

async function listPaginated(baseUrl: string, path: string, token: string): Promise<JsonRecord[]> {
  const items: JsonRecord[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL(path, baseUrl);
    url.searchParams.set('limit', '50');
    if (cursor) url.searchParams.set('cursor', cursor);
    const page = await getJson(url.toString(), token);
    const rows = Array.isArray(page.items) ? (page.items as JsonRecord[]) : [];
    items.push(...rows);
    cursor = valueString(page.nextCursor);
  } while (cursor);
  return items;
}

function zineSource(item: JsonRecord): SourceReference | null {
  const itemId = valueString(item.itemId);
  const userItemId = valueString(item.id);
  const canonicalUrl = valueString(item.canonicalUrl);
  if (!itemId || !userItemId || !canonicalUrl) return null;
  const rawState = valueString(item.state);
  const isFinished = item.isFinished === true;
  const userState = isFinished
    ? 'FINISHED'
    : rawState === 'BOOKMARKED'
      ? 'BOOKMARKED'
      : rawState === 'INBOX'
        ? 'INBOX'
        : null;
  const rawContentType = valueString(item.contentType);
  const contentType = ['ARTICLE', 'VIDEO', 'PODCAST', 'POST'].includes(rawContentType ?? '')
    ? (rawContentType as SourceReference['contentType'])
    : 'OTHER';

  return {
    id: `zine:${itemId}`,
    origin: 'ZINE',
    role: 'REPORTING',
    canonicalUrl,
    title: valueString(item.title),
    creator: valueString(item.creator),
    publisher: valueString(item.publisher),
    publishedAt: valueString(item.publishedAt),
    xTweetId: null,
    zineItemId: itemId,
    zineUserItemId: userItemId,
    contentType,
    userState,
  };
}

function zineDocument(item: JsonRecord, now: string): EditorialSnapshotDocument | null {
  const source = zineSource(item);
  if (!source) return null;
  const tags = Array.isArray(item.tags)
    ? item.tags
        .map((tag) => (typeof tag === 'string' ? tag : valueString((tag as JsonRecord).name)))
        .filter((tag): tag is string => Boolean(tag))
    : [];
  const ingestedAt = valueString(item.ingestedAt);
  const bookmarkedAt = valueString(item.bookmarkedAt);
  return {
    source,
    observedAt: timestamp(bookmarkedAt ?? ingestedAt, now),
    firstSeenAt: timestamp(ingestedAt ?? bookmarkedAt, now),
    text: null,
    summary: valueString(item.summary),
    timelinePosition: null,
    engagement: null,
    signals: {
      ingestedAt,
      bookmarkedAt,
      lastOpenedAt: valueString(item.lastOpenedAt),
      isFinished: item.isFinished === true,
      tags,
    },
  };
}

function xDocument(item: JsonRecord, runId: string, now: string): EditorialSnapshotDocument | null {
  const post = item.post && typeof item.post === 'object' ? (item.post as JsonRecord) : null;
  if (!post) return null;
  const tweetId = valueString(post.tweetId);
  const url = valueString(post.url);
  if (!tweetId || !url) return null;
  const author = post.author && typeof post.author === 'object' ? (post.author as JsonRecord) : {};
  const metrics =
    post.metrics && typeof post.metrics === 'object' ? (post.metrics as JsonRecord) : {};
  const observedAt = timestamp(item.observedAt, now);
  return {
    source: {
      id: `x:${tweetId}`,
      origin: 'X',
      role: 'COMMENTARY',
      canonicalUrl: url,
      title: null,
      creator: valueString(author.name) ?? valueString(author.username),
      publisher: 'X',
      publishedAt: valueString(post.publishedAt),
      xTweetId: tweetId,
      zineItemId: null,
      zineUserItemId: null,
      contentType: 'POST',
      userState: null,
    },
    observedAt,
    firstSeenAt: timestamp(post.firstSeenAt, observedAt),
    text: valueString(post.text) ?? '',
    summary: null,
    timelinePosition: valueNumber(item.position),
    engagement: {
      replies: valueNumber(metrics.replies),
      reposts: valueNumber(metrics.reposts),
      likes: valueNumber(metrics.likes),
      views: valueNumber(metrics.views),
    },
    signals: {
      ingestedAt: null,
      bookmarkedAt: null,
      lastOpenedAt: null,
      isFinished: false,
      tags: [`x-run:${runId}`],
    },
  };
}

export async function buildEditorialSnapshot(options: SnapshotOptions): Promise<EditorialSnapshot> {
  const now = options.now.toISOString();
  const warnings: string[] = [];
  let previousEdition: JsonRecord | null = null;
  try {
    previousEdition = await getOptionalJson(
      `${options.apiUrl}/api/v1/editorial/editions/latest`,
      options.token
    );
  } catch (error) {
    warnings.push(
      `Previous edition lookup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const previous = previousEdition?.edition as JsonRecord | undefined;
  const previousThrough = valueString((previous?.window as JsonRecord | undefined)?.through);
  const fallbackWindowUsed = !previousThrough;
  const newContentAfter = previousThrough
    ? new Date(previousThrough).toISOString()
    : new Date(options.now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
  const comparisonAfter = new Date(options.now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const window = {
    newContentAfter,
    through: now,
    comparisonAfter,
    previousEditionId: valueString(previous?.id),
    fallbackWindowUsed,
  };

  let inbox: JsonRecord[] = [];
  let bookmarks: JsonRecord[] = [];
  let zineInboxStatus: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' = 'COMPLETE';
  let zineBookmarksStatus: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' = 'COMPLETE';
  try {
    inbox = await listPaginated(options.apiUrl, '/api/v1/inbox', options.token);
  } catch (error) {
    zineInboxStatus = 'UNAVAILABLE';
    warnings.push(
      `Inbox collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  try {
    bookmarks = await listPaginated(options.apiUrl, '/api/v1/bookmarks', options.token);
  } catch (error) {
    zineBookmarksStatus = 'UNAVAILABLE';
    warnings.push(
      `Bookmark collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const recentInbox = inbox.filter(
    (item) => Date.parse(valueString(item.ingestedAt) ?? '') > Date.parse(newContentAfter)
  );
  const recentBookmarks = bookmarks.filter(
    (item) => Date.parse(valueString(item.bookmarkedAt) ?? '') > Date.parse(newContentAfter)
  );
  const contextualBookmarks = bookmarks.filter((item) => {
    const bookmarkedAt = Date.parse(valueString(item.bookmarkedAt) ?? '');
    return (
      item.isFinished !== true &&
      bookmarkedAt > Date.parse(comparisonAfter) &&
      bookmarkedAt <= Date.parse(newContentAfter)
    );
  });

  let xArchiveStatus: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' = 'COMPLETE';
  const xRunIds: string[] = [];
  const xDocuments: EditorialSnapshotDocument[] = [];
  try {
    const runsResponse = await getJson(
      `${options.xApiUrl}/api/v1/x-timeline/runs`,
      options.archiveToken
    );
    const runs = Array.isArray(runsResponse.runs) ? (runsResponse.runs as JsonRecord[]) : [];
    const usable = runs.filter((run) =>
      ['COMPLETE', 'PARTIAL'].includes(valueString(run.status) ?? '')
    );
    let selected = usable.filter(
      (run) =>
        Date.parse(valueString(run.completedAt) ?? valueString(run.startedAt) ?? '') >
        Date.parse(newContentAfter)
    );
    if (selected.length === 0 && usable[0]) selected = [usable[0]];
    for (const run of selected) {
      const runId = valueString(run.id);
      if (!runId) continue;
      xRunIds.push(runId);
      if (valueString(run.status) === 'PARTIAL') xArchiveStatus = 'PARTIAL';
      const detail = await getJson(
        `${options.xApiUrl}/api/v1/x-timeline/runs/${encodeURIComponent(runId)}`,
        options.archiveToken
      );
      const items = Array.isArray(detail.items) ? (detail.items as JsonRecord[]) : [];
      for (const item of items) {
        const document = xDocument(item, runId, now);
        if (document) xDocuments.push(document);
      }
    }
  } catch (error) {
    xArchiveStatus = 'UNAVAILABLE';
    warnings.push(
      `X archive collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const documentsBySourceId = new Map<string, EditorialSnapshotDocument>();
  for (const document of xDocuments) documentsBySourceId.set(document.source.id, document);
  for (const item of [...recentInbox, ...contextualBookmarks, ...recentBookmarks]) {
    const document = zineDocument(item, now);
    if (document) documentsBySourceId.set(document.source.id, document);
  }
  const documents = [...documentsBySourceId.values()];

  const snapshot = {
    schemaVersion: EDITORIAL_SCHEMA_VERSION,
    id: `snapshot_${options.editionDate}_${options.now.getTime()}`,
    generatedAt: now,
    editionDate: options.editionDate,
    timezone: options.timezone,
    window,
    provenance: {
      xRunIds,
      inputCounts: {
        xTimelineEntries: xDocuments.length,
        xCanonicalPosts: new Set(xDocuments.map((document) => document.source.id)).size,
        inboxItems: recentInbox.length,
        recentBookmarks: recentBookmarks.length,
        contextualBookmarks: contextualBookmarks.length,
        externalVerificationSources: 0,
      },
      sourceStatus: {
        xArchive: xArchiveStatus,
        zineInbox: zineInboxStatus,
        zineBookmarks: zineBookmarksStatus,
        externalVerification: 'NOT_RUN' as const,
      },
      snapshotKey: options.snapshotKey,
      warnings,
    },
    documents,
  };
  return EditorialSnapshotSchema.parse(snapshot);
}
