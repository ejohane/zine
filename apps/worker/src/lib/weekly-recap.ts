import type { D1Database } from '@cloudflare/workers-types';

const DEFAULT_TIMEZONE = 'UTC';
const RECAP_LABEL = 'Last 7 days';
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const WORDS_PER_MINUTE = 220;
const CURRENT_WINDOW_DAYS = 7;
const TOP_GROUP_LIMIT = 3;

export type WeeklyRecapMode = 'READING' | 'WATCHING' | 'LISTENING' | 'MIXED' | 'NONE';

type ModeMinutes = {
  reading: number;
  watching: number;
  listening: number;
};

type ContentTypeCounts = {
  article: number;
  post: number;
  video: number;
  podcast: number;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type WindowRange = {
  timezone: string;
  label: string;
  startAt: string;
  endAt: string;
  comparisonStartAt: string;
  comparisonEndAt: string;
  startAtMs: number;
  endAtMs: number;
  comparisonStartAtMs: number;
  comparisonEndAtMs: number;
  startLocalDate: LocalDateParts;
  currentLocalDate: LocalDateParts;
};

type TransitionEventRow = {
  event_id: string;
  user_item_id: string;
  item_id: string;
  event_type: 'FINISHED' | 'UNFINISHED';
  occurred_at: number;
  bookmarked_at: string | null;
  ingested_at: string | null;
  title: string;
  thumbnail_url: string | null;
  content_type: string;
  provider: string;
  duration: number | null;
  reading_time_minutes: number | null;
  word_count: number | null;
  creator_id: string | null;
  creator_name: string | null;
};

type LegacyCompletedRow = {
  user_item_id: string;
  item_id: string;
  finished_at: string;
  bookmarked_at: string | null;
  ingested_at: string | null;
  title: string;
  thumbnail_url: string | null;
  content_type: string;
  provider: string;
  duration: number | null;
  reading_time_minutes: number | null;
  word_count: number | null;
  creator_id: string | null;
  creator_name: string | null;
};

type StartedSnapshotRow = {
  user_item_id: string;
  item_id: string;
  title: string;
  thumbnail_url: string | null;
  content_type: string;
  provider: string;
  creator_id: string | null;
  creator_name: string | null;
  last_opened_at: string | null;
  progress_position: number | null;
  progress_duration: number | null;
  progress_updated_at: string | null;
};

type CompletedEntry = {
  userItemId: string;
  itemId: string;
  title: string;
  creatorId: string | null;
  creator: string;
  provider: string;
  contentType: string;
  thumbnailUrl: string | null;
  finishedAt: string;
  dayBucket: string;
  dayLabel: string;
  estimatedMinutes: number;
  bookmarkedAt: string | null;
  ingestedAt: string | null;
};

type StartedEntry = {
  userItemId: string;
  itemId: string;
  title: string;
  creatorId: string | null;
  creator: string;
  provider: string;
  contentType: string;
  thumbnailUrl: string | null;
  lastTouchedAt: string;
  dayBucket: string;
  dayLabel: string;
  progressPercent: number | null;
};

export type WeeklyRecapResponse = {
  window: {
    timezone: string;
    startAt: string;
    endAt: string;
    comparisonStartAt: string;
    comparisonEndAt: string;
    label: string;
  };
  headline: {
    completedCount: number;
    estimatedTotalMinutes: number;
    dominantMode: WeeklyRecapMode;
    completedDeltaPct: number | null;
    estimatedMinutesDeltaPct: number | null;
  };
  totals: {
    completedCount: number;
    startedCount: number;
    estimatedMinutesByMode: ModeMinutes;
    contentTypeCounts: ContentTypeCounts;
  };
  trend: Array<{
    date: string;
    label: string;
    completedCount: number;
    estimatedMinutes: number;
    readingMinutes: number;
    watchingMinutes: number;
    listeningMinutes: number;
  }>;
  highlights: {
    topCreators: Array<{
      creatorId: string | null;
      creator: string;
      completedCount: number;
      estimatedMinutes: number;
    }>;
    topProviders: Array<{
      provider: string;
      completedCount: number;
      estimatedMinutes: number;
    }>;
    longestCompletedItem: {
      userItemId: string;
      title: string;
      creator: string;
      estimatedMinutes: number;
      finishedAt: string;
    } | null;
    medianBookmarkToFinishHours: number | null;
  };
  completedItems: Array<{
    userItemId: string;
    itemId: string;
    title: string;
    creator: string;
    provider: string;
    contentType: string;
    finishedAt: string;
    estimatedMinutes: number;
    thumbnailUrl: string | null;
    dayBucket: string;
    dayLabel: string;
  }>;
  startedItems: Array<{
    userItemId: string;
    itemId: string;
    title: string;
    creator: string;
    provider: string;
    contentType: string;
    lastTouchedAt: string;
    progressPercent: number | null;
    thumbnailUrl: string | null;
    dayBucket: string;
    dayLabel: string;
  }>;
};

export type WeeklyRecapTeaserResponse = {
  window: WeeklyRecapResponse['window'];
  headline: string;
  supportingLine: string;
  trendLabel: string | null;
  completedCount: number;
  startedCount: number;
  estimatedTotalMinutes: number;
  estimatedMinutesByMode: ModeMinutes;
  dominantMode: WeeklyRecapMode;
  completedDeltaPct: number | null;
  estimatedMinutesDeltaPct: number | null;
};

type QueryRow = Record<string, unknown>;

function isValidTimezone(timezone: string | undefined): timezone is string {
  if (!timezone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveWeeklyRecapTimezone(timezone: string | undefined): string {
  return isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

function parseFormatterPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((part) => part.type === type)?.value;
  return value ? Number.parseInt(value, 10) : 0;
}

function getLocalDateParts(date: Date, timezone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);

  return {
    year: parseFormatterPart(parts, 'year'),
    month: parseFormatterPart(parts, 'month'),
    day: parseFormatterPart(parts, 'day'),
  };
}

function getOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const asUtc = Date.UTC(
    parseFormatterPart(parts, 'year'),
    parseFormatterPart(parts, 'month') - 1,
    parseFormatterPart(parts, 'day'),
    parseFormatterPart(parts, 'hour'),
    parseFormatterPart(parts, 'minute'),
    parseFormatterPart(parts, 'second')
  );

  return asUtc - date.getTime();
}

function getStartOfDayUtc(localDate: LocalDateParts, timezone: string): Date {
  const baselineMs = Date.UTC(localDate.year, localDate.month - 1, localDate.day, 0, 0, 0);
  let resolvedMs = baselineMs - getOffsetMs(new Date(baselineMs), timezone);
  const adjustedMs = baselineMs - getOffsetMs(new Date(resolvedMs), timezone);

  if (adjustedMs !== resolvedMs) {
    resolvedMs = adjustedMs;
  }

  return new Date(resolvedMs);
}

function addDays(localDate: LocalDateParts, delta: number): LocalDateParts {
  const date = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));
  date.setUTCDate(date.getUTCDate() + delta);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function toLocalDateKey(localDate: LocalDateParts): string {
  return `${String(localDate.year).padStart(4, '0')}-${String(localDate.month).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;
}

function formatDayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getDayBucket(dateString: string, timezone: string): string {
  return toLocalDateKey(getLocalDateParts(new Date(dateString), timezone));
}

export function getWeeklyRecapWindow(timezone: string, now: Date = new Date()): WindowRange {
  const currentLocalDate = getLocalDateParts(now, timezone);
  const startLocalDate = addDays(currentLocalDate, -(CURRENT_WINDOW_DAYS - 1));
  const endLocalDate = addDays(currentLocalDate, 1);
  const comparisonStartLocalDate = addDays(startLocalDate, -CURRENT_WINDOW_DAYS);

  const startAtDate = getStartOfDayUtc(startLocalDate, timezone);
  const endAtDate = getStartOfDayUtc(endLocalDate, timezone);
  const comparisonStartAtDate = getStartOfDayUtc(comparisonStartLocalDate, timezone);

  return {
    timezone,
    label: RECAP_LABEL,
    startAt: startAtDate.toISOString(),
    endAt: endAtDate.toISOString(),
    comparisonStartAt: comparisonStartAtDate.toISOString(),
    comparisonEndAt: startAtDate.toISOString(),
    startAtMs: startAtDate.getTime(),
    endAtMs: endAtDate.getTime(),
    comparisonStartAtMs: comparisonStartAtDate.getTime(),
    comparisonEndAtMs: startAtDate.getTime(),
    startLocalDate,
    currentLocalDate,
  };
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toTransitionEventRow(row: QueryRow): TransitionEventRow {
  return {
    event_id: toStringValue(row.event_id),
    user_item_id: toStringValue(row.user_item_id),
    item_id: toStringValue(row.item_id),
    event_type: toStringValue(row.event_type) as TransitionEventRow['event_type'],
    occurred_at: toNullableNumber(row.occurred_at) ?? 0,
    bookmarked_at: toNullableString(row.bookmarked_at),
    ingested_at: toNullableString(row.ingested_at),
    title: toStringValue(row.title),
    thumbnail_url: toNullableString(row.thumbnail_url),
    content_type: toStringValue(row.content_type),
    provider: toStringValue(row.provider),
    duration: toNullableNumber(row.duration),
    reading_time_minutes: toNullableNumber(row.reading_time_minutes),
    word_count: toNullableNumber(row.word_count),
    creator_id: toNullableString(row.creator_id),
    creator_name: toNullableString(row.creator_name),
  };
}

function toLegacyCompletedRow(row: QueryRow): LegacyCompletedRow {
  return {
    user_item_id: toStringValue(row.user_item_id),
    item_id: toStringValue(row.item_id),
    finished_at: toStringValue(row.finished_at),
    bookmarked_at: toNullableString(row.bookmarked_at),
    ingested_at: toNullableString(row.ingested_at),
    title: toStringValue(row.title),
    thumbnail_url: toNullableString(row.thumbnail_url),
    content_type: toStringValue(row.content_type),
    provider: toStringValue(row.provider),
    duration: toNullableNumber(row.duration),
    reading_time_minutes: toNullableNumber(row.reading_time_minutes),
    word_count: toNullableNumber(row.word_count),
    creator_id: toNullableString(row.creator_id),
    creator_name: toNullableString(row.creator_name),
  };
}

function toStartedSnapshotRow(row: QueryRow): StartedSnapshotRow {
  return {
    user_item_id: toStringValue(row.user_item_id),
    item_id: toStringValue(row.item_id),
    title: toStringValue(row.title),
    thumbnail_url: toNullableString(row.thumbnail_url),
    content_type: toStringValue(row.content_type),
    provider: toStringValue(row.provider),
    creator_id: toNullableString(row.creator_id),
    creator_name: toNullableString(row.creator_name),
    last_opened_at: toNullableString(row.last_opened_at),
    progress_position: toNullableNumber(row.progress_position),
    progress_duration: toNullableNumber(row.progress_duration),
    progress_updated_at: toNullableString(row.progress_updated_at),
  };
}

async function queryAll<T>(
  d1: D1Database,
  sqlText: string,
  bindings: Array<string | number>
): Promise<T[]> {
  const statement = d1.prepare(sqlText).bind(...bindings);
  const result = await statement.all<T>();
  return Array.isArray(result.results) ? result.results : [];
}

async function queryCompletionTransitionRows(
  d1: D1Database,
  userId: string,
  comparisonStartAtMs: number,
  endAtMs: number
): Promise<TransitionEventRow[]> {
  const rows = await queryAll<QueryRow>(
    d1,
    `SELECT
      e.id AS event_id,
      e.user_item_id,
      e.item_id,
      e.event_type,
      e.occurred_at,
      ui.bookmarked_at,
      ui.ingested_at,
      i.title,
      i.thumbnail_url,
      i.content_type,
      i.provider,
      i.duration,
      i.reading_time_minutes,
      i.word_count,
      c.id AS creator_id,
      c.name AS creator_name
    FROM user_item_consumption_events e
    LEFT JOIN user_items ui ON ui.id = e.user_item_id
    INNER JOIN items i ON i.id = e.item_id
    LEFT JOIN creators c ON c.id = i.creator_id
    WHERE
      e.user_id = ?
      AND e.event_type IN ('FINISHED', 'UNFINISHED')
      AND e.occurred_at >= ?
      AND e.occurred_at < ?
    ORDER BY e.user_item_id ASC, e.occurred_at DESC, e.id DESC`,
    [userId, comparisonStartAtMs, endAtMs]
  );

  return rows.map(toTransitionEventRow);
}

async function queryLegacyCompletedRows(
  d1: D1Database,
  userId: string,
  comparisonStartAt: string,
  endAt: string
): Promise<LegacyCompletedRow[]> {
  const rows = await queryAll<QueryRow>(
    d1,
    `SELECT
      ui.id AS user_item_id,
      ui.item_id,
      ui.finished_at,
      ui.bookmarked_at,
      ui.ingested_at,
      i.title,
      i.thumbnail_url,
      i.content_type,
      i.provider,
      i.duration,
      i.reading_time_minutes,
      i.word_count,
      c.id AS creator_id,
      c.name AS creator_name
    FROM user_items ui
    INNER JOIN items i ON i.id = ui.item_id
    LEFT JOIN creators c ON c.id = i.creator_id
    WHERE
      ui.user_id = ?
      AND ui.is_finished = 1
      AND ui.finished_at IS NOT NULL
      AND ui.finished_at >= ?
      AND ui.finished_at < ?
    ORDER BY ui.finished_at DESC, ui.id DESC`,
    [userId, comparisonStartAt, endAt]
  );

  return rows.map(toLegacyCompletedRow);
}

async function queryStartedSnapshotRows(
  d1: D1Database,
  userId: string,
  startAt: string,
  endAt: string
): Promise<StartedSnapshotRow[]> {
  const rows = await queryAll<QueryRow>(
    d1,
    `SELECT
      ui.id AS user_item_id,
      ui.item_id,
      ui.last_opened_at,
      ui.progress_position,
      ui.progress_duration,
      ui.progress_updated_at,
      i.title,
      i.thumbnail_url,
      i.content_type,
      i.provider,
      c.id AS creator_id,
      c.name AS creator_name
    FROM user_items ui
    INNER JOIN items i ON i.id = ui.item_id
    LEFT JOIN creators c ON c.id = i.creator_id
    WHERE
      ui.user_id = ?
      AND ui.is_finished = 0
      AND ui.state != 'ARCHIVED'
      AND (
        (ui.last_opened_at IS NOT NULL AND ui.last_opened_at >= ? AND ui.last_opened_at < ?)
        OR
        (ui.progress_updated_at IS NOT NULL AND ui.progress_updated_at >= ? AND ui.progress_updated_at < ?)
      )
    ORDER BY COALESCE(ui.progress_updated_at, ui.last_opened_at) DESC, ui.id DESC`,
    [userId, startAt, endAt, startAt, endAt]
  );

  return rows.map(toStartedSnapshotRow);
}

function getModeForContentType(contentType: string): WeeklyRecapMode | null {
  switch (contentType) {
    case 'ARTICLE':
    case 'POST':
      return 'READING';
    case 'VIDEO':
      return 'WATCHING';
    case 'PODCAST':
      return 'LISTENING';
    default:
      return null;
  }
}

function estimateMinutesFromMetadata(params: {
  contentType: string;
  duration: number | null;
  readingTimeMinutes: number | null;
  wordCount: number | null;
}): number {
  const mode = getModeForContentType(params.contentType);

  if (mode === 'WATCHING' || mode === 'LISTENING') {
    if (params.duration && params.duration > 0) {
      return Math.max(1, Math.ceil(params.duration / SECONDS_PER_MINUTE));
    }
    return 0;
  }

  if (params.readingTimeMinutes && params.readingTimeMinutes > 0) {
    return Math.max(1, Math.ceil(params.readingTimeMinutes));
  }

  if (params.wordCount && params.wordCount > 0) {
    return Math.max(1, Math.ceil(params.wordCount / WORDS_PER_MINUTE));
  }

  return 0;
}

function buildCompletedEntryFromTransitionRow(
  row: TransitionEventRow,
  timezone: string
): CompletedEntry {
  const finishedAt = new Date(row.occurred_at).toISOString();
  const dayBucket = getDayBucket(finishedAt, timezone);

  return {
    userItemId: row.user_item_id,
    itemId: row.item_id,
    title: row.title,
    creatorId: row.creator_id,
    creator: row.creator_name ?? 'Unknown Creator',
    provider: row.provider,
    contentType: row.content_type,
    thumbnailUrl: row.thumbnail_url,
    finishedAt,
    dayBucket,
    dayLabel: formatDayLabel(dayBucket),
    estimatedMinutes: estimateMinutesFromMetadata({
      contentType: row.content_type,
      duration: row.duration,
      readingTimeMinutes: row.reading_time_minutes,
      wordCount: row.word_count,
    }),
    bookmarkedAt: row.bookmarked_at,
    ingestedAt: row.ingested_at,
  };
}

function buildCompletedEntryFromLegacyRow(
  row: LegacyCompletedRow,
  timezone: string
): CompletedEntry {
  const dayBucket = getDayBucket(row.finished_at, timezone);

  return {
    userItemId: row.user_item_id,
    itemId: row.item_id,
    title: row.title,
    creatorId: row.creator_id,
    creator: row.creator_name ?? 'Unknown Creator',
    provider: row.provider,
    contentType: row.content_type,
    thumbnailUrl: row.thumbnail_url,
    finishedAt: row.finished_at,
    dayBucket,
    dayLabel: formatDayLabel(dayBucket),
    estimatedMinutes: estimateMinutesFromMetadata({
      contentType: row.content_type,
      duration: row.duration,
      readingTimeMinutes: row.reading_time_minutes,
      wordCount: row.word_count,
    }),
    bookmarkedAt: row.bookmarked_at,
    ingestedAt: row.ingested_at,
  };
}

function buildStartedEntry(row: StartedSnapshotRow, timezone: string): StartedEntry | null {
  const lastTouchedAt = row.progress_updated_at ?? row.last_opened_at;
  if (!lastTouchedAt) {
    return null;
  }

  const dayBucket = getDayBucket(lastTouchedAt, timezone);
  const progressPercent =
    row.progress_position !== null &&
    row.progress_duration !== null &&
    row.progress_duration > 0 &&
    row.progress_position >= 0
      ? Math.min(100, Math.round((row.progress_position / row.progress_duration) * 100))
      : null;

  return {
    userItemId: row.user_item_id,
    itemId: row.item_id,
    title: row.title,
    creatorId: row.creator_id,
    creator: row.creator_name ?? 'Unknown Creator',
    provider: row.provider,
    contentType: row.content_type,
    thumbnailUrl: row.thumbnail_url,
    lastTouchedAt,
    dayBucket,
    dayLabel: formatDayLabel(dayBucket),
    progressPercent,
  };
}

function calculateDominantMode(minutesByMode: ModeMinutes): WeeklyRecapMode {
  const entries = [
    ['READING', minutesByMode.reading],
    ['WATCHING', minutesByMode.watching],
    ['LISTENING', minutesByMode.listening],
  ] as const;

  const maxValue = Math.max(...entries.map((entry) => entry[1]));
  if (maxValue <= 0) {
    return 'NONE';
  }

  const leaders = entries.filter((entry) => entry[1] === maxValue);
  if (leaders.length > 1) {
    return 'MIXED';
  }

  return leaders[0][0];
}

function calculateDeltaPct(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) {
    return 0;
  }

  if (previous <= 0) {
    return null;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function getHoursBetween(startAt: string | null, endAt: string): number | null {
  if (!startAt) {
    return null;
  }

  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  return (endMs - startMs) / (1000 * 60 * 60);
}

function calculateMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
  }

  return Number(sorted[middle].toFixed(1));
}

function createEmptyModeMinutes(): ModeMinutes {
  return {
    reading: 0,
    watching: 0,
    listening: 0,
  };
}

function createEmptyContentTypeCounts(): ContentTypeCounts {
  return {
    article: 0,
    post: 0,
    video: 0,
    podcast: 0,
  };
}

function addEntryToModeMinutes(minutesByMode: ModeMinutes, entry: CompletedEntry) {
  const mode = getModeForContentType(entry.contentType);

  if (mode === 'READING') {
    minutesByMode.reading += entry.estimatedMinutes;
  } else if (mode === 'WATCHING') {
    minutesByMode.watching += entry.estimatedMinutes;
  } else if (mode === 'LISTENING') {
    minutesByMode.listening += entry.estimatedMinutes;
  }
}

function addEntryToContentTypeCounts(counts: ContentTypeCounts, entry: CompletedEntry) {
  switch (entry.contentType) {
    case 'ARTICLE':
      counts.article += 1;
      break;
    case 'POST':
      counts.post += 1;
      break;
    case 'VIDEO':
      counts.video += 1;
      break;
    case 'PODCAST':
      counts.podcast += 1;
      break;
    default:
      break;
  }
}

function buildTrendBuckets(window: WindowRange): WeeklyRecapResponse['trend'] {
  const buckets: WeeklyRecapResponse['trend'] = [];

  for (let index = 0; index < CURRENT_WINDOW_DAYS; index += 1) {
    const localDate = addDays(window.startLocalDate, index);
    const dateKey = toLocalDateKey(localDate);
    buckets.push({
      date: dateKey,
      label: new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        weekday: 'short',
      }).format(new Date(`${dateKey}T12:00:00.000Z`)),
      completedCount: 0,
      estimatedMinutes: 0,
      readingMinutes: 0,
      watchingMinutes: 0,
      listeningMinutes: 0,
    });
  }

  return buckets;
}

function toHours(values: Array<number | null>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && value >= 0);
}

function formatMinutesSummary(minutesByMode: ModeMinutes): string {
  const parts: string[] = [];

  if (minutesByMode.reading > 0) {
    parts.push(`${formatMinutesCompact(minutesByMode.reading)} reading`);
  }
  if (minutesByMode.watching > 0) {
    parts.push(`${formatMinutesCompact(minutesByMode.watching)} watching`);
  }
  if (minutesByMode.listening > 0) {
    parts.push(`${formatMinutesCompact(minutesByMode.listening)} listening`);
  }

  return parts.length > 0 ? parts.join(', ') : 'No estimated time yet';
}

function formatMinutesCompact(totalMinutes: number): string {
  if (totalMinutes <= 0) {
    return '0m';
  }

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function formatTrendLabel(deltaPct: number | null): string | null {
  if (deltaPct === null) {
    return null;
  }

  if (deltaPct > 0) {
    return `Up ${deltaPct}% vs last week`;
  }
  if (deltaPct < 0) {
    return `Down ${Math.abs(deltaPct)}% vs last week`;
  }

  return 'No change vs last week';
}

export function buildWeeklyRecap(params: {
  timezone: string;
  now?: Date;
  completionTransitions: TransitionEventRow[];
  legacyCompletedRows: LegacyCompletedRow[];
  startedSnapshotRows: StartedSnapshotRow[];
}): WeeklyRecapResponse {
  const window = getWeeklyRecapWindow(params.timezone, params.now);

  const latestFinishedEventByWindowKey = new Map<string, TransitionEventRow>();
  const completedEventUserItemIds = new Set<string>();

  for (const row of params.completionTransitions) {
    if (row.event_type !== 'FINISHED') {
      continue;
    }

    const finishedAt = new Date(row.occurred_at).toISOString();
    const windowKey =
      finishedAt >= window.startAt && finishedAt < window.endAt
        ? 'current'
        : finishedAt >= window.comparisonStartAt && finishedAt < window.comparisonEndAt
          ? 'comparison'
          : null;

    if (!windowKey) {
      continue;
    }

    completedEventUserItemIds.add(row.user_item_id);

    const dedupeKey = `${windowKey}:${row.user_item_id}`;
    const existing = latestFinishedEventByWindowKey.get(dedupeKey);
    if (!existing || row.occurred_at > existing.occurred_at) {
      latestFinishedEventByWindowKey.set(dedupeKey, row);
    }
  }

  const completedEntriesFromEvents = Array.from(latestFinishedEventByWindowKey.values()).map(
    (row) => buildCompletedEntryFromTransitionRow(row, params.timezone)
  );

  const completedEntriesFromLegacy = params.legacyCompletedRows
    .filter((row) => !completedEventUserItemIds.has(row.user_item_id))
    .map((row) => buildCompletedEntryFromLegacyRow(row, params.timezone));

  const allCompletedEntries = [...completedEntriesFromEvents, ...completedEntriesFromLegacy].sort(
    (left, right) => right.finishedAt.localeCompare(left.finishedAt)
  );

  const currentCompletedEntries = allCompletedEntries.filter(
    (entry) => entry.finishedAt >= window.startAt && entry.finishedAt < window.endAt
  );
  const comparisonCompletedEntries = allCompletedEntries.filter(
    (entry) =>
      entry.finishedAt >= window.comparisonStartAt && entry.finishedAt < window.comparisonEndAt
  );

  const currentCompletedIds = new Set(currentCompletedEntries.map((entry) => entry.userItemId));
  const startedEntries = params.startedSnapshotRows
    .map((row) => buildStartedEntry(row, params.timezone))
    .filter((entry): entry is StartedEntry => entry !== null)
    .filter((entry) => !currentCompletedIds.has(entry.userItemId))
    .sort((left, right) => right.lastTouchedAt.localeCompare(left.lastTouchedAt));

  const currentModeMinutes = createEmptyModeMinutes();
  const comparisonModeMinutes = createEmptyModeMinutes();
  const currentContentTypeCounts = createEmptyContentTypeCounts();
  const trendBuckets = buildTrendBuckets(window);
  const trendIndexByDate = new Map(trendBuckets.map((bucket) => [bucket.date, bucket]));

  const creatorStats = new Map<
    string,
    { creatorId: string | null; creator: string; completedCount: number; estimatedMinutes: number }
  >();
  const providerStats = new Map<
    string,
    { provider: string; completedCount: number; estimatedMinutes: number }
  >();

  for (const entry of currentCompletedEntries) {
    addEntryToModeMinutes(currentModeMinutes, entry);
    addEntryToContentTypeCounts(currentContentTypeCounts, entry);

    const creatorKey = entry.creatorId ?? `name:${entry.creator.toLowerCase()}`;
    const creatorEntry = creatorStats.get(creatorKey) ?? {
      creatorId: entry.creatorId,
      creator: entry.creator,
      completedCount: 0,
      estimatedMinutes: 0,
    };
    creatorEntry.completedCount += 1;
    creatorEntry.estimatedMinutes += entry.estimatedMinutes;
    creatorStats.set(creatorKey, creatorEntry);

    const providerEntry = providerStats.get(entry.provider) ?? {
      provider: entry.provider,
      completedCount: 0,
      estimatedMinutes: 0,
    };
    providerEntry.completedCount += 1;
    providerEntry.estimatedMinutes += entry.estimatedMinutes;
    providerStats.set(entry.provider, providerEntry);

    const trendBucket = trendIndexByDate.get(entry.dayBucket);
    if (trendBucket) {
      trendBucket.completedCount += 1;
      trendBucket.estimatedMinutes += entry.estimatedMinutes;

      const mode = getModeForContentType(entry.contentType);
      if (mode === 'READING') {
        trendBucket.readingMinutes += entry.estimatedMinutes;
      } else if (mode === 'WATCHING') {
        trendBucket.watchingMinutes += entry.estimatedMinutes;
      } else if (mode === 'LISTENING') {
        trendBucket.listeningMinutes += entry.estimatedMinutes;
      }
    }
  }

  for (const entry of comparisonCompletedEntries) {
    addEntryToModeMinutes(comparisonModeMinutes, entry);
  }

  const currentEstimatedTotalMinutes =
    currentModeMinutes.reading + currentModeMinutes.watching + currentModeMinutes.listening;
  const comparisonEstimatedTotalMinutes =
    comparisonModeMinutes.reading +
    comparisonModeMinutes.watching +
    comparisonModeMinutes.listening;

  const longestCompletedItem = currentCompletedEntries.reduce<
    WeeklyRecapResponse['highlights']['longestCompletedItem']
  >((currentLongest, entry) => {
    if (!currentLongest || entry.estimatedMinutes > currentLongest.estimatedMinutes) {
      return {
        userItemId: entry.userItemId,
        title: entry.title,
        creator: entry.creator,
        estimatedMinutes: entry.estimatedMinutes,
        finishedAt: entry.finishedAt,
      };
    }
    return currentLongest;
  }, null);

  const medianBookmarkToFinishHours = calculateMedian(
    toHours(
      currentCompletedEntries.map((entry) => getHoursBetween(entry.bookmarkedAt, entry.finishedAt))
    )
  );

  return {
    window: {
      timezone: window.timezone,
      startAt: window.startAt,
      endAt: window.endAt,
      comparisonStartAt: window.comparisonStartAt,
      comparisonEndAt: window.comparisonEndAt,
      label: window.label,
    },
    headline: {
      completedCount: currentCompletedEntries.length,
      estimatedTotalMinutes: currentEstimatedTotalMinutes,
      dominantMode: calculateDominantMode(currentModeMinutes),
      completedDeltaPct: calculateDeltaPct(
        currentCompletedEntries.length,
        comparisonCompletedEntries.length
      ),
      estimatedMinutesDeltaPct: calculateDeltaPct(
        currentEstimatedTotalMinutes,
        comparisonEstimatedTotalMinutes
      ),
    },
    totals: {
      completedCount: currentCompletedEntries.length,
      startedCount: startedEntries.length,
      estimatedMinutesByMode: currentModeMinutes,
      contentTypeCounts: currentContentTypeCounts,
    },
    trend: trendBuckets,
    highlights: {
      topCreators: Array.from(creatorStats.values())
        .sort((left, right) =>
          right.completedCount !== left.completedCount
            ? right.completedCount - left.completedCount
            : right.estimatedMinutes - left.estimatedMinutes
        )
        .slice(0, TOP_GROUP_LIMIT),
      topProviders: Array.from(providerStats.values())
        .sort((left, right) =>
          right.completedCount !== left.completedCount
            ? right.completedCount - left.completedCount
            : right.estimatedMinutes - left.estimatedMinutes
        )
        .slice(0, TOP_GROUP_LIMIT),
      longestCompletedItem,
      medianBookmarkToFinishHours,
    },
    completedItems: currentCompletedEntries.map((entry) => ({
      userItemId: entry.userItemId,
      itemId: entry.itemId,
      title: entry.title,
      creator: entry.creator,
      provider: entry.provider,
      contentType: entry.contentType,
      finishedAt: entry.finishedAt,
      estimatedMinutes: entry.estimatedMinutes,
      thumbnailUrl: entry.thumbnailUrl,
      dayBucket: entry.dayBucket,
      dayLabel: entry.dayLabel,
    })),
    startedItems: startedEntries.map((entry) => ({
      userItemId: entry.userItemId,
      itemId: entry.itemId,
      title: entry.title,
      creator: entry.creator,
      provider: entry.provider,
      contentType: entry.contentType,
      lastTouchedAt: entry.lastTouchedAt,
      progressPercent: entry.progressPercent,
      thumbnailUrl: entry.thumbnailUrl,
      dayBucket: entry.dayBucket,
      dayLabel: entry.dayLabel,
    })),
  };
}

export function toWeeklyRecapTeaser(recap: WeeklyRecapResponse): WeeklyRecapTeaserResponse {
  const headline =
    recap.totals.completedCount > 0
      ? `You finished ${recap.totals.completedCount} ${recap.totals.completedCount === 1 ? 'thing' : 'things'} this week`
      : 'No completed items this week';

  return {
    window: recap.window,
    headline,
    supportingLine: formatMinutesSummary(recap.totals.estimatedMinutesByMode),
    trendLabel: formatTrendLabel(recap.headline.estimatedMinutesDeltaPct),
    completedCount: recap.totals.completedCount,
    startedCount: recap.totals.startedCount,
    estimatedTotalMinutes: recap.headline.estimatedTotalMinutes,
    estimatedMinutesByMode: recap.totals.estimatedMinutesByMode,
    dominantMode: recap.headline.dominantMode,
    completedDeltaPct: recap.headline.completedDeltaPct,
    estimatedMinutesDeltaPct: recap.headline.estimatedMinutesDeltaPct,
  };
}

export async function getWeeklyRecap(params: {
  d1: D1Database;
  userId: string;
  timezone?: string;
  now?: Date;
}): Promise<WeeklyRecapResponse> {
  const timezone = resolveWeeklyRecapTimezone(params.timezone);
  const window = getWeeklyRecapWindow(timezone, params.now);

  const [transitionRows, legacyCompletedRows, startedSnapshotRows] = await Promise.all([
    queryCompletionTransitionRows(
      params.d1,
      params.userId,
      window.comparisonStartAtMs,
      window.endAtMs
    ),
    queryLegacyCompletedRows(params.d1, params.userId, window.comparisonStartAt, window.endAt),
    queryStartedSnapshotRows(params.d1, params.userId, window.startAt, window.endAt),
  ]);

  return buildWeeklyRecap({
    timezone,
    now: params.now,
    completionTransitions: transitionRows,
    legacyCompletedRows,
    startedSnapshotRows,
  });
}
