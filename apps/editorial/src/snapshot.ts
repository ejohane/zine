import {
  EDITORIAL_SCHEMA_VERSION,
  DailyEditionSchema,
  EditorialExternalDiscoveryArtifactSchema,
  EditorialFeedbackProfileSchema,
  EditorialSnapshotSchema,
  type EditorialExternalDiscoveryArtifact,
  type EditorialFeedbackProfile,
  type EditorialHistory,
  type EditorialSnapshot,
  type EditorialSnapshotDocument,
  type SourceReference,
} from '@zine/editorial-schema';

type JsonRecord = Record<string, unknown>;

const MAX_CONTEXTUAL_BOOKMARKS = 200;

export type SnapshotOptions = {
  token: string;
  archiveToken: string;
  apiUrl: string;
  xApiUrl: string;
  now: Date;
  timezone: string;
  editionDate: string;
  snapshotKey: string;
  externalDiscovery?: EditorialExternalDiscoveryArtifact;
};

function valueString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function valueStringMax(value: unknown, maxLength: number): string | null {
  const parsed = valueString(value);
  return parsed ? parsed.slice(0, maxLength) : null;
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

function timestampMs(value: unknown): number {
  const parsed = Date.parse(valueString(value) ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
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
    provider: valueString(item.provider),
    imageUrl: valueString(item.thumbnailUrl),
    excerpt: valueStringMax(item.summary, 2_000),
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
    links: [],
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
  const links = (Array.isArray(post.links) ? post.links : [])
    .filter((link): link is JsonRecord => Boolean(link && typeof link === 'object'))
    .map((link) => {
      const url = valueString(link.url);
      const normalizedUrl = valueString(link.normalizedUrl) ?? url;
      if (!url || !normalizedUrl) return null;
      const card = link.card && typeof link.card === 'object' ? (link.card as JsonRecord) : null;
      return {
        url,
        normalizedUrl,
        displayUrl: valueString(link.displayUrl),
        redirectUrl: valueString(link.redirectUrl),
        source: valueString(link.source) === 'CARD' ? ('CARD' as const) : ('TEXT' as const),
        card: card
          ? {
              title: valueString(card.title),
              description: valueString(card.description),
              domain: valueString(card.domain),
              imageUrl: valueString(card.imageUrl),
            }
          : null,
      };
    })
    .filter((link): link is NonNullable<typeof link> => Boolean(link));
  const firstCard = links.find((link) => link.card)?.card;
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
      provider: 'X',
      imageUrl: firstCard?.imageUrl ?? null,
      excerpt: valueStringMax(post.text, 2_000),
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
    links,
    signals: {
      ingestedAt: null,
      bookmarkedAt: null,
      lastOpenedAt: null,
      isFinished: false,
      tags: [`x-run:${runId}`],
    },
  };
}

function mergeXDocuments(
  left: EditorialSnapshotDocument,
  right: EditorialSnapshotDocument
): EditorialSnapshotDocument {
  const leftObservedAt = timestampMs(left.observedAt);
  const rightObservedAt = timestampMs(right.observedAt);
  const latest = rightObservedAt >= leftObservedAt ? right : left;
  const earliestFirstSeenAt =
    timestampMs(left.firstSeenAt) <= timestampMs(right.firstSeenAt)
      ? left.firstSeenAt
      : right.firstSeenAt;
  const links = new Map<string, EditorialSnapshotDocument['links'][number]>();
  for (const link of [...left.links, ...right.links]) {
    links.set(link.normalizedUrl ?? link.redirectUrl ?? link.url, link);
  }
  const metric = (key: 'replies' | 'reposts' | 'likes' | 'views') =>
    Math.max(left.engagement?.[key] ?? 0, right.engagement?.[key] ?? 0);

  return {
    ...latest,
    firstSeenAt: earliestFirstSeenAt,
    links: [...links.values()],
    engagement: {
      replies: metric('replies'),
      reposts: metric('reposts'),
      likes: metric('likes'),
      views: metric('views'),
    },
    signals: {
      ...latest.signals,
      tags: [...new Set([...left.signals.tags, ...right.signals.tags])].sort(),
    },
  };
}

async function collectEditorialHistory(
  apiUrl: string,
  token: string,
  editionDate: string
): Promise<EditorialHistory> {
  const response = await getJson(`${apiUrl}/api/v1/editorial/editions?limit=14`, token);
  const summaries = Array.isArray(response.editions) ? (response.editions as JsonRecord[]) : [];
  const editionIds: string[] = [];
  const stories: EditorialHistory['stories'] = [];
  for (const summary of summaries) {
    const id = valueString(summary.id);
    if (!id || valueString(summary.editionDate) === editionDate) continue;
    const detail = await getJson(
      `${apiUrl}/api/v1/editorial/editions/${encodeURIComponent(id)}`,
      token
    );
    const parsed = DailyEditionSchema.safeParse(detail.edition);
    if (!parsed.success) continue;
    editionIds.push(id);
    const sourceUrls = new Map(
      parsed.data.sources.map((source) => [source.id, source.canonicalUrl])
    );
    for (const story of parsed.data.stories) {
      stories.push({
        editionId: id,
        editionDate: parsed.data.editionDate,
        storyId: story.id,
        title: story.title,
        topics: story.topics,
        canonicalUrls: [
          ...new Set(
            story.sourceIds
              .map((sourceId) => sourceUrls.get(sourceId))
              .filter((url): url is string => Boolean(url))
          ),
        ],
      });
    }
  }
  return { lookbackDays: 14, editionIds, stories };
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

  let history: EditorialHistory | undefined;
  try {
    history = await collectEditorialHistory(options.apiUrl, options.token, options.editionDate);
  } catch (error) {
    warnings.push(
      `Editorial history collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let feedbackProfile: EditorialFeedbackProfile | undefined;
  try {
    const response = await getJson(
      `${options.apiUrl}/api/v1/editorial/feedback/profile`,
      options.token
    );
    const parsed = EditorialFeedbackProfileSchema.safeParse(response.profile);
    if (parsed.success) {
      feedbackProfile = parsed.data;
    } else {
      warnings.push('Editorial feedback profile was invalid and was excluded from this snapshot.');
    }
  } catch (error) {
    warnings.push(
      `Editorial feedback profile collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

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
  const recentBookmarkIds = new Set(
    recentBookmarks.map((item) => valueString(item.id)).filter((id): id is string => Boolean(id))
  );
  const comparisonAfterMs = Date.parse(comparisonAfter);
  const newContentAfterMs = Date.parse(newContentAfter);
  const contextualBookmarks = bookmarks
    .filter((item) => {
      const id = valueString(item.id);
      return !id || !recentBookmarkIds.has(id);
    })
    .filter((item) => {
      const bookmarkedAt = timestampMs(item.bookmarkedAt);
      return bookmarkedAt > 0 && bookmarkedAt <= newContentAfterMs;
    })
    .sort((left, right) => {
      const leftBookmarkedAt = timestampMs(left.bookmarkedAt);
      const rightBookmarkedAt = timestampMs(right.bookmarkedAt);
      const leftIsActiveComparison =
        left.isFinished !== true && leftBookmarkedAt > comparisonAfterMs;
      const rightIsActiveComparison =
        right.isFinished !== true && rightBookmarkedAt > comparisonAfterMs;
      if (leftIsActiveComparison !== rightIsActiveComparison) {
        return leftIsActiveComparison ? -1 : 1;
      }
      const leftLastTouchedAt = Math.max(timestampMs(left.lastOpenedAt), leftBookmarkedAt);
      const rightLastTouchedAt = Math.max(timestampMs(right.lastOpenedAt), rightBookmarkedAt);
      if (leftLastTouchedAt !== rightLastTouchedAt) return rightLastTouchedAt - leftLastTouchedAt;
      return (valueString(left.id) ?? '').localeCompare(valueString(right.id) ?? '');
    })
    .slice(0, MAX_CONTEXTUAL_BOOKMARKS);

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
    if (selected.length === 0 && usable[0]) {
      selected = [usable[0]];
      xArchiveStatus = 'PARTIAL';
      warnings.push(
        `No X archive run completed after ${newContentAfter}; using ${valueString(usable[0].id) ?? 'the latest usable run'} as partial fallback coverage.`
      );
    } else if (selected.length === 0) {
      xArchiveStatus = 'UNAVAILABLE';
      warnings.push('No complete or partial X archive runs were available for this snapshot.');
    }
    let selectedRunCount = 0;
    let successfulRunCount = 0;
    for (const run of selected) {
      const runId = valueString(run.id);
      if (!runId) continue;
      selectedRunCount++;
      try {
        const detail = await getJson(
          `${options.xApiUrl}/api/v1/x-timeline/runs/${encodeURIComponent(runId)}`,
          options.archiveToken
        );
        successfulRunCount++;
        xRunIds.push(runId);
        if (valueString(run.status) === 'PARTIAL') xArchiveStatus = 'PARTIAL';
        const items = Array.isArray(detail.items) ? (detail.items as JsonRecord[]) : [];
        for (const item of items) {
          const document = xDocument(item, runId, now);
          if (document) xDocuments.push(document);
        }
      } catch (error) {
        xArchiveStatus = 'PARTIAL';
        warnings.push(
          `X archive run ${runId} collection failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    if (selectedRunCount > 0 && successfulRunCount === 0) {
      xArchiveStatus = 'UNAVAILABLE';
    } else if (successfulRunCount < selectedRunCount) {
      xArchiveStatus = 'PARTIAL';
    }
  } catch (error) {
    xArchiveStatus = 'UNAVAILABLE';
    warnings.push(
      `X archive collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const documentsBySourceId = new Map<string, EditorialSnapshotDocument>();
  for (const document of xDocuments) {
    const existing = documentsBySourceId.get(document.source.id);
    documentsBySourceId.set(
      document.source.id,
      existing ? mergeXDocuments(existing, document) : document
    );
  }
  for (const item of [...recentInbox, ...contextualBookmarks, ...recentBookmarks]) {
    const document = zineDocument(item, now);
    if (document) documentsBySourceId.set(document.source.id, document);
  }
  const externalDiscovery = options.externalDiscovery
    ? EditorialExternalDiscoveryArtifactSchema.parse(options.externalDiscovery)
    : undefined;
  for (const document of externalDiscovery?.documents ?? []) {
    documentsBySourceId.set(document.source.id, document);
  }
  if (externalDiscovery) warnings.push(...externalDiscovery.coverageNotes);
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
        externalDiscoverySources: externalDiscovery?.documents.length ?? 0,
      },
      sourceStatus: {
        xArchive: xArchiveStatus,
        zineInbox: zineInboxStatus,
        zineBookmarks: zineBookmarksStatus,
        externalVerification: 'NOT_RUN' as const,
        externalDiscovery: externalDiscovery ? ('COMPLETE' as const) : ('NOT_RUN' as const),
      },
      snapshotKey: options.snapshotKey,
      warnings,
    },
    documents,
    ...(feedbackProfile ? { feedbackProfile } : {}),
    ...(history ? { history } : {}),
  };
  return EditorialSnapshotSchema.parse(snapshot);
}
