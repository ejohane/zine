import type { DailyEdition, SourceReference } from '@zine/editorial-schema';

import { getEditorialEdition } from './editorial-storage';
import { parseLink } from './link-parser';

const DEFAULT_TIMEZONE = 'America/Chicago';

type EditorialRunRow = {
  id: string;
  status: string;
  edition_id: string | null;
  edition_date: string;
  failure_stage: string | null;
  error_message: string | null;
  updated_at: number;
};

type SourceItemRow = {
  item_id: string;
  canonical_url: string;
  title: string;
  thumbnail_url: string | null;
  provider: string;
  summary: string | null;
  creator_name: string | null;
  publisher: string | null;
  user_item_id: string | null;
  state: string | null;
  is_finished: number | null;
};

type SourceItemLookup = {
  byId: Map<string, SourceItemRow>;
  byCanonicalUrl: Map<string, SourceItemRow>;
};

export type EditorialSourcePresentation = {
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  provider: string | null;
  excerpt: string | null;
  zineUserItemId: string | null;
  zineItemId: string | null;
  isSaved: boolean;
  isFinished: boolean;
};

function localDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function latestRun(
  db: D1Database,
  userId: string,
  expectedEditionDate: string
): Promise<EditorialRunRow | null> {
  return db
    .prepare(
      `SELECT id, status, edition_id, edition_date, failure_stage, error_message, updated_at
       FROM editorial_runs WHERE user_id = ? AND edition_date = ?
       ORDER BY updated_at DESC LIMIT 1`
    )
    .bind(userId, expectedEditionDate)
    .first<EditorialRunRow>();
}

function canonicalUrlVariants(canonicalUrl: string): string[] {
  const normalized = parseLink(canonicalUrl)?.canonicalUrl;
  return [...new Set([canonicalUrl, normalized].filter((url): url is string => Boolean(url)))];
}

function preferSourceItem(
  rows: Map<string, SourceItemRow>,
  key: string,
  candidate: SourceItemRow
): void {
  const existing = rows.get(key);
  const score = (row: SourceItemRow) =>
    (row.state === 'BOOKMARKED' ? 2 : 0) + (row.is_finished ? 1 : 0);
  if (!existing || score(candidate) > score(existing)) rows.set(key, candidate);
}

async function sourceItemRows(
  db: D1Database,
  userId: string,
  sources: SourceReference[]
): Promise<SourceItemLookup> {
  const result: SourceItemLookup = {
    byId: new Map<string, SourceItemRow>(),
    byCanonicalUrl: new Map<string, SourceItemRow>(),
  };
  const itemIds = [
    ...new Set(
      sources
        .map((source) => source.zineItemId)
        .filter((itemId): itemId is string => Boolean(itemId))
    ),
  ];
  const canonicalUrls = [
    ...new Set(
      sources
        .filter((source) => !source.zineItemId)
        .flatMap((source) => canonicalUrlVariants(source.canonicalUrl))
    ),
  ];

  for (const { column, values, requireUserItem } of [
    { column: 'id', values: itemIds, requireUserItem: false },
    { column: 'canonical_url', values: canonicalUrls, requireUserItem: true },
  ] as const) {
    for (let offset = 0; offset < values.length; offset += 50) {
      const batch = values.slice(offset, offset + 50);
      if (batch.length === 0) continue;
      const placeholders = batch.map(() => '?').join(', ');
      const rows = await db
        .prepare(
          `SELECT i.id AS item_id, i.canonical_url, i.title, i.thumbnail_url, i.provider, i.summary,
            c.name AS creator_name, i.publisher, ui.id AS user_item_id, ui.state, ui.is_finished
           FROM items i
           LEFT JOIN creators c ON c.id = i.creator_id
           ${requireUserItem ? 'JOIN' : 'LEFT JOIN'} user_items ui
             ON ui.item_id = i.id AND ui.user_id = ?
           WHERE i.${column} IN (${placeholders})`
        )
        .bind(userId, ...batch)
        .all<SourceItemRow>();
      for (const row of rows.results) {
        if (column === 'id') result.byId.set(row.item_id, row);
        if (column === 'canonical_url' && row.user_item_id) {
          for (const variant of canonicalUrlVariants(row.canonical_url)) {
            preferSourceItem(result.byCanonicalUrl, variant, row);
          }
        }
      }
    }
  }
  return result;
}

function basePresentation(source: SourceReference): EditorialSourcePresentation {
  const isFinished = source.userState === 'FINISHED';
  return {
    title: source.title,
    subtitle: source.creator ?? source.publisher,
    imageUrl: source.imageUrl ?? null,
    provider: source.provider ?? (source.origin === 'X' ? 'X' : null),
    excerpt: source.excerpt ?? null,
    zineUserItemId: source.zineUserItemId,
    zineItemId: source.zineItemId,
    isSaved: source.userState === 'BOOKMARKED' || isFinished,
    isFinished,
  };
}

export async function buildEditorialPresentation(
  db: D1Database,
  userId: string,
  edition: DailyEdition
): Promise<Record<string, EditorialSourcePresentation>> {
  const rows = await sourceItemRows(db, userId, edition.sources);
  return Object.fromEntries(
    edition.sources.map((source) => {
      const presentation = basePresentation(source);
      const item = source.zineItemId
        ? rows.byId.get(source.zineItemId)
        : canonicalUrlVariants(source.canonicalUrl)
            .map((url) => rows.byCanonicalUrl.get(url))
            .find((row): row is SourceItemRow => Boolean(row));
      if (item) {
        presentation.title = item.title || presentation.title;
        presentation.subtitle = item.creator_name ?? item.publisher ?? presentation.subtitle;
        presentation.imageUrl = item.thumbnail_url ?? presentation.imageUrl;
        presentation.provider = item.provider ?? presentation.provider;
        presentation.excerpt = item.summary ?? presentation.excerpt;
        presentation.zineItemId = item.item_id;
        presentation.zineUserItemId = item.user_item_id;
        presentation.isSaved = item.state === 'BOOKMARKED' || Boolean(item.is_finished);
        presentation.isFinished = Boolean(item.is_finished);
      }
      return [source.id, presentation];
    })
  );
}

export async function getEditorialToday(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  now = new Date()
) {
  const latest = await getEditorialEdition(db, bucket, userId);
  const timezone = latest?.edition.timezone ?? DEFAULT_TIMEZONE;
  let expectedEditionDate: string;
  let timezoneWarning: string | null = null;
  try {
    expectedEditionDate = localDate(now, timezone);
  } catch {
    expectedEditionDate = localDate(now, DEFAULT_TIMEZONE);
    timezoneWarning = `Edition timezone ${timezone} is invalid; freshness uses ${DEFAULT_TIMEZONE}.`;
  }
  const run = await latestRun(db, userId, expectedEditionDate);
  const issue = latest?.edition ?? null;
  const isCurrent = issue?.editionDate === expectedEditionDate;

  let status: 'PUBLISHED' | 'PREPARING' | 'STALE' | 'UNAVAILABLE';
  let message: string | null;
  if (isCurrent) {
    status = 'PUBLISHED';
    message = null;
  } else if (issue) {
    status = 'STALE';
    if (run?.status === 'FAILED') {
      const stage = run.failure_stage ? ` during ${run.failure_stage.toLocaleLowerCase()}` : '';
      message = `Today's edition failed${stage}: ${run.error_message ?? 'Unknown error'}. Showing ${issue.editionDate}.`;
    } else if (run && run.status !== 'PUBLISHED') {
      message = `The latest edition is from ${issue.editionDate}; ${expectedEditionDate} is still being prepared.`;
    } else {
      message = `The latest edition is from ${issue.editionDate}; preparation for ${expectedEditionDate} has not started.`;
    }
  } else if (run && !['FAILED', 'PUBLISHED'].includes(run.status)) {
    status = 'PREPARING';
    message = 'The first edition is being prepared.';
  } else {
    status = 'UNAVAILABLE';
    message = run?.error_message ?? 'No edition has been published yet.';
  }

  return {
    issue,
    expectedEditionDate,
    generation: {
      status,
      latestEditionId: issue?.id ?? null,
      message,
    },
    freshness: {
      isCurrent,
      sourceStatus: issue?.provenance.sourceStatus ?? null,
      warnings: [
        ...(issue?.provenance.warnings ?? []),
        ...(timezoneWarning ? [timezoneWarning] : []),
      ],
    },
    presentation: {
      sources: issue ? await buildEditorialPresentation(db, userId, issue) : {},
    },
  };
}
