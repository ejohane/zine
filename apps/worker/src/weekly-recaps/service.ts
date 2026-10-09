import { ulid } from 'ulid';
import type {
  WeeklyRecap,
  WeeklyRecapCandidate,
  WeeklyRecapEvidence,
  WeeklyRecapPreferences,
} from '../../../../packages/shared/src/schemas/weekly-recaps';
import { WeeklyRecapSchema } from '../../../../packages/shared/src/schemas/weekly-recaps';
import { PublicationError } from '../publications/errors';
import {
  addLocalDays,
  latestClosedWeekStart,
  recapWindow,
  requireClosed,
  validTimezone,
} from './windows';

type Epoch = { timezone: string; effectiveAt: number };
type Preferences = {
  user_id: string;
  timezone: string;
  timezone_history: string;
  initialized_at: number;
  tracking_started_at: number;
  catchup_week_start: string;
};
type WindowRow = {
  id: string;
  week_start: string;
  timezone: string;
  start_at: number;
  end_at: number;
  generated_at: number;
  snapshot: string;
};
type EvidenceRow = {
  item_id: string;
  user_item_id: string | null;
  state: string | null;
  title: string | null;
  creator_name: string | null;
  content_type: string | null;
  provider: string | null;
  thumbnail_url: string | null;
  raw_metadata: string | null;
  event_type: string;
  occurred_at: number;
  source: string;
  metadata: string | null;
  legacy?: boolean;
};
const iso = (v: number) => new Date(v).toISOString();
const metadata = (v: string | null): Record<string, unknown> => {
  try {
    const o: unknown = JSON.parse(v || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export class WeeklyRecapService {
  constructor(
    readonly db: D1Database,
    readonly now = Date.now()
  ) {}

  async preferences(owner: string, initialTimezone = 'UTC'): Promise<Preferences> {
    validTimezone(initialTimezone);
    const current = await this.db
      .prepare('SELECT * FROM weekly_recap_preferences WHERE user_id=?')
      .bind(owner)
      .first<Preferences>();
    if (current) return current;
    // Clerk webhook normally creates this row; preserve API's authenticated race handling.
    await this.db
      .prepare('INSERT OR IGNORE INTO users(id,email,created_at,updated_at) VALUES(?,NULL,?,?)')
      .bind(owner, iso(this.now), iso(this.now))
      .run();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO weekly_recap_preferences
      (user_id,timezone,timezone_history,initialized_at,tracking_started_at,catchup_week_start) VALUES(?,?,?,?,?,?)`
      )
      .bind(
        owner,
        initialTimezone,
        JSON.stringify([{ timezone: initialTimezone, effectiveAt: 0 }]),
        this.now,
        this.now,
        latestClosedWeekStart(initialTimezone, new Date(this.now))
      )
      .run();
    return (await this.db
      .prepare('SELECT * FROM weekly_recap_preferences WHERE user_id=?')
      .bind(owner)
      .first<Preferences>())!;
  }
  epochs(p: Preferences): Epoch[] {
    return JSON.parse(p.timezone_history) as Epoch[];
  }
  activeEpoch(p: Preferences) {
    return this.epochs(p)
      .filter((e) => e.effectiveAt <= this.now)
      .at(-1)!;
  }
  projectPreferences(p: Preferences): WeeklyRecapPreferences {
    const pending = this.epochs(p).find((e) => e.effectiveAt > this.now);
    return {
      timezone: this.activeEpoch(p).timezone,
      pendingTimezone: pending?.timezone ?? null,
      pendingEffectiveAt: pending ? iso(pending.effectiveAt) : null,
      trackingStartedAt: iso(p.tracking_started_at),
    };
  }
  async getPreferences(owner: string) {
    return this.projectPreferences(await this.preferences(owner));
  }
  async setPreferences(owner: string, timezone: string) {
    validTimezone(timezone);
    const exists = await this.db
      .prepare('SELECT * FROM weekly_recap_preferences WHERE user_id=?')
      .bind(owner)
      .first<Preferences>();
    if (!exists) return this.projectPreferences(await this.preferences(owner, timezone));
    const epochs = this.epochs(exists).filter((e) => e.effectiveAt <= this.now),
      active = epochs.at(-1)!;
    if (active.timezone === timezone) {
      await this.db
        .prepare('UPDATE weekly_recap_preferences SET timezone_history=? WHERE user_id=?')
        .bind(JSON.stringify(epochs), owner)
        .run();
      return this.projectPreferences({ ...exists, timezone_history: JSON.stringify(epochs) });
    }
    // Never change an existing week's bounds. Switch at the first new-zone Sunday
    // at/after the old active week's end; a timezone shift can create a labeled gap.
    const oldNext = recapWindow(
      addLocalDays(latestClosedWeekStart(active.timezone, new Date(this.now)), 7),
      active.timezone
    ).endAtMs;
    let week = addLocalDays(latestClosedWeekStart(timezone, new Date(oldNext)), 7);
    while (recapWindow(week, timezone).startAtMs < oldNext) week = addLocalDays(week, 7);
    epochs.push({ timezone, effectiveAt: recapWindow(week, timezone).startAtMs });
    const history = JSON.stringify(epochs);
    await this.db
      .prepare('UPDATE weekly_recap_preferences SET timezone=?,timezone_history=? WHERE user_id=?')
      .bind(timezone, history, owner)
      .run();
    return this.projectPreferences({ ...exists, timezone, timezone_history: history });
  }
  async window(owner: string, weekStart: string) {
    const p = await this.preferences(owner);
    const existing = await this.db
      .prepare('SELECT * FROM weekly_recap_windows WHERE user_id=? AND week_start=?')
      .bind(owner, weekStart)
      .first<WindowRow>();
    if (existing)
      return { p, existing, window: recapWindow(existing.week_start, existing.timezone) };
    const epochs = this.epochs(p);
    for (let i = epochs.length - 1; i >= 0; i--) {
      const w = recapWindow(weekStart, epochs[i].timezone);
      if (
        w.startAtMs >= epochs[i].effectiveAt &&
        w.startAtMs < (epochs[i + 1]?.effectiveAt ?? Infinity)
      ) {
        requireClosed(w, this.now);
        return { p, existing: null, window: w };
      }
    }
    throw new PublicationError('INVALID_INPUT', 400, { reason: 'TIMEZONE_TRANSITION_WEEK' });
  }
  async get(owner: string, weekStart: string): Promise<WeeklyRecap> {
    const { p, existing, window: w } = await this.window(owner, weekStart);
    requireClosed(w, this.now);
    const prior = existing ? WeeklyRecapSchema.parse(JSON.parse(existing.snapshot)) : null;
    let evidenceStart = w.startAtMs;
    const epochs = this.epochs(p),
      epochIndex = epochs.findIndex(
        (e) => e.timezone === w.timezone && e.effectiveAt === w.startAtMs
      );
    if (epochIndex > 0) {
      const previous = epochs[epochIndex - 1];
      const priorWeek = addLocalDays(
        latestClosedWeekStart(previous.timezone, new Date(w.startAtMs - 1)),
        7
      );
      evidenceStart = Math.max(w.startAtMs, recapWindow(priorWeek, previous.timezone).endAtMs);
    }
    const evidenceStartAt = iso(evidenceStart);

    const rows = await this.db
      .prepare(
        `SELECT e.item_id,e.user_item_id,ui.state,i.title,c.name creator_name,i.content_type,i.provider,i.thumbnail_url,i.raw_metadata,
      e.event_type,e.occurred_at,e.source,e.metadata FROM user_item_consumption_events e
      LEFT JOIN user_items ui ON ui.id=e.user_item_id AND ui.user_id=e.user_id
      LEFT JOIN items i ON i.id=e.item_id LEFT JOIN creators c ON c.id=i.creator_id
      WHERE e.user_id=? AND e.occurred_at>=? AND e.occurred_at<?
        AND e.event_type IN ('SAVED','OPENED','FINISHED') ORDER BY e.occurred_at,e.id`
      )
      .bind(owner, evidenceStart, w.endAtMs)
      .all<EvidenceRow>();
    // Legacy snapshots describe only timestamps still present, never full historical activity.
    const legacy = await this.db
      .prepare(
        `SELECT ui.item_id,ui.id user_item_id,ui.state,i.title,c.name creator_name,i.content_type,i.provider,i.thumbnail_url,i.raw_metadata,
      ui.bookmarked_at,ui.last_opened_at,ui.finished_at FROM user_items ui JOIN items i ON i.id=ui.item_id LEFT JOIN creators c ON c.id=i.creator_id
      WHERE ui.user_id=? AND ((ui.bookmarked_at>=? AND ui.bookmarked_at<?) OR (ui.last_opened_at>=? AND ui.last_opened_at<?) OR (ui.finished_at>=? AND ui.finished_at<?))`
      )
      .bind(owner, evidenceStartAt, w.endAt, evidenceStartAt, w.endAt, evidenceStartAt, w.endAt)
      .all<
        EvidenceRow & {
          bookmarked_at: string | null;
          last_opened_at: string | null;
          finished_at: string | null;
        }
      >();
    const editorial = await this.db
      .prepare(
        `SELECT e.target_source_snapshot_json metadata,
      COALESCE(i.id,'editorial:'||e.target_id) item_id,ui.id user_item_id,ui.state,
      i.title,c.name creator_name,i.content_type,i.provider,i.thumbnail_url,i.raw_metadata,
      'OPENED' event_type,e.occurred_at,'TODAY_SOURCE_OPEN' source
      FROM editorial_feedback_events e
      LEFT JOIN items i ON i.canonical_url=json_extract(e.target_source_snapshot_json,'$.canonicalUrl')
      LEFT JOIN creators c ON c.id=i.creator_id
      LEFT JOIN user_items ui ON ui.item_id=i.id AND ui.user_id=e.user_id
      WHERE e.user_id=? AND e.event_type='OPENED' AND e.target_type='SOURCE'
        AND e.target_source_snapshot_json IS NOT NULL AND e.occurred_at>=? AND e.occurred_at<?`
      )
      .bind(owner, evidenceStart, w.endAtMs)
      .all<EvidenceRow>();
    const evidence = [...rows.results, ...editorial.results];
    for (const row of legacy.results)
      for (const [kind, stamp] of [
        ['SAVED', row.bookmarked_at],
        ['OPENED', row.last_opened_at],
        ['FINISHED', row.finished_at],
      ] as const) {
        const at = stamp ? Date.parse(stamp) : NaN;
        if (
          at >= evidenceStart &&
          at < w.endAtMs &&
          !evidence.some((e) => e.item_id === row.item_id && e.event_type === kind)
        )
          evidence.push({
            ...row,
            event_type: kind,
            occurred_at: at,
            source: 'LEGACY_SNAPSHOT',
            metadata: null,
            legacy: true,
          });
      }
    const byItem = new Map<string, WeeklyRecapCandidate>(
      (prior?.candidates ?? []).map((c) => [c.itemId, c])
    );
    for (const row of evidence) {
      const snapshot = metadata(row.metadata);
      let candidate = byItem.get(row.item_id);
      if (!candidate) {
        candidate = {
          id: row.item_id,
          itemId: row.item_id,
          savedBookmarkId: null,
          title:
            typeof snapshot.title === 'string'
              ? snapshot.title
              : (row.title ?? 'Unavailable content'),
          creatorName:
            typeof snapshot.creatorName === 'string'
              ? snapshot.creatorName
              : typeof snapshot.creator === 'string'
                ? snapshot.creator
                : row.creator_name,
          contentType:
            typeof snapshot.contentType === 'string'
              ? snapshot.contentType
              : (row.content_type ?? 'UNKNOWN'),
          provider:
            typeof snapshot.provider === 'string' ? snapshot.provider : (row.provider ?? 'WEB'),
          artworkUrl:
            typeof snapshot.artworkUrl === 'string' ? snapshot.artworkUrl : row.thumbnail_url,
          originalUrl: typeof snapshot.canonicalUrl === 'string' ? snapshot.canonicalUrl : null,
          evidence: [],
          publicationEligibility: 'UNAVAILABLE',
        };
        byItem.set(row.item_id, candidate);
      }
      const observed: WeeklyRecapEvidence = {
        kind: row.event_type as WeeklyRecapEvidence['kind'],
        source: row.source,
        observedAt: iso(row.occurred_at),
        legacy: row.legacy ?? false,
      };
      if (
        !candidate.evidence.some(
          (e) =>
            e.kind === observed.kind &&
            e.source === observed.source &&
            e.observedAt === observed.observedAt
        )
      )
        candidate.evidence.push(observed);
    }
    // Resolve today's saved state separately; historic evidence is never erased by it.
    const current = await this.db
      .prepare(
        `SELECT ui.id,ui.item_id,ui.state,i.provider,i.raw_metadata,i.canonical_url FROM user_items ui JOIN items i ON i.id=ui.item_id WHERE ui.user_id=?`
      )
      .bind(owner)
      .all<{
        id: string;
        item_id: string;
        state: string;
        provider: string;
        raw_metadata: string | null;
        canonical_url: string;
      }>();
    const owned = new Map(current.results.map((row) => [row.item_id, row]));
    const ownedUrls = new Map(current.results.map((row) => [row.canonical_url, row]));
    for (const candidate of byItem.values()) {
      const row =
          owned.get(candidate.itemId) ??
          (candidate.originalUrl ? ownedUrls.get(candidate.originalUrl) : undefined),
        raw = metadata(row?.raw_metadata ?? null);
      if (row) candidate.itemId = row.item_id;
      candidate.savedBookmarkId = row?.state === 'BOOKMARKED' ? row.id : null;
      candidate.publicationEligibility = !row
        ? candidate.originalUrl
          ? 'UNSAVED'
          : 'UNAVAILABLE'
        : !candidate.savedBookmarkId
          ? 'UNSAVED'
          : (row.provider === 'GMAIL' && typeof raw.publicWebUrl !== 'string') ||
              raw.isPrivate === true ||
              raw.isPrivateFeed === true
            ? 'PRIVATE_SOURCE'
            : 'CHECK_ON_SELECTION';
      candidate.evidence.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    }
    const merged = new Map<string, WeeklyRecapCandidate>();
    for (const candidate of byItem.values()) {
      const prior = merged.get(candidate.itemId);
      if (!prior) {
        merged.set(candidate.itemId, candidate);
        continue;
      }
      for (const e of candidate.evidence)
        if (
          !prior.evidence.some(
            (p) => p.kind === e.kind && p.source === e.source && p.observedAt === e.observedAt
          )
        )
          prior.evidence.push(e);
      prior.evidence.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    }
    const candidates = [...merged.values()].sort(
      (a, b) =>
        b.evidence.at(-1)!.observedAt.localeCompare(a.evidence.at(-1)!.observedAt) ||
        a.id.localeCompare(b.id)
    );
    const issue = await this.db
      .prepare('SELECT id FROM personal_issues WHERE weekly_window_id=? AND unavailable_at IS NULL')
      .bind(existing?.id ?? '')
      .first<{ id: string }>();
    const limitations = [
      'External playback completion is not observable.',
      'Older snapshot timestamps cannot prove complete activity history.',
      'Older Today opens without an exact source snapshot cannot be reconstructed.',
    ];
    if (evidenceStart > w.startAtMs)
      limitations.push('Timezone transition: overlapping hours remain in the preceding recap.');
    if (w.startAtMs < p.tracking_started_at)
      limitations.push('This week predates reliable save/open tracking for this account.');
    const recap: WeeklyRecap = {
      id: existing?.id ?? ulid(),
      weekStart,
      timezone: w.timezone,
      startAt: w.startAt,
      endAt: w.endAt,
      generatedAt: iso(this.now),
      coverage: {
        state:
          evidence.some((e) => !e.legacy) || prior?.coverage.state === 'PARTIAL'
            ? 'PARTIAL'
            : 'LEGACY_SNAPSHOT',
        reliableSince: iso(p.tracking_started_at),
        limitations,
      },
      candidates,
      highlights: ['SAVED', 'OPENED', 'FINISHED'].map((kind) => ({
        label: kind,
        count: candidates.filter((c) => c.evidence.some((e) => e.kind === kind)).length,
      })),
      selectedCandidateIds: [],
      issueId: issue?.id ?? null,
    };
    const valid = WeeklyRecapSchema.parse(recap);
    await this.db
      .prepare(
        `INSERT INTO weekly_recap_windows(id,user_id,week_start,timezone,start_at,end_at,generated_at,snapshot)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,week_start) DO UPDATE SET generated_at=excluded.generated_at,snapshot=excluded.snapshot`
      )
      .bind(
        valid.id,
        owner,
        weekStart,
        w.timezone,
        w.startAtMs,
        w.endAtMs,
        this.now,
        JSON.stringify(valid)
      )
      .run();
    // Concurrent first reads must return the winner's stable ID, never an unpersisted ID.
    const persisted = await this.db
      .prepare('SELECT id FROM weekly_recap_windows WHERE user_id=? AND week_start=?')
      .bind(owner, weekStart)
      .first<{ id: string }>();
    return { ...valid, id: persisted!.id };
  }
  async list(owner: string, limit = 20, cursor?: string) {
    const p = await this.preferences(owner),
      active = this.activeEpoch(p),
      latest = latestClosedWeekStart(active.timezone, new Date(this.now));
    let latestAvailable = latest;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.get(owner, latestAvailable);
        break;
      } catch (error) {
        if (
          error instanceof PublicationError &&
          ['WEEK_NOT_CLOSED', 'TIMEZONE_TRANSITION_WEEK'].includes(String(error.details?.reason))
        )
          latestAvailable = addLocalDays(latestAvailable, -7);
        else throw error;
      }
    }
    const rows = await this.db
      .prepare(
        `SELECT week_start FROM weekly_recap_windows WHERE user_id=? AND end_at<=? ${cursor ? 'AND week_start<?' : ''} ORDER BY week_start DESC LIMIT ?`
      )
      .bind(...(cursor ? [owner, this.now, cursor, limit + 1] : [owner, this.now, limit + 1]))
      .all<{ week_start: string }>();
    const selected = rows.results.slice(0, limit),
      recaps = [];
    for (const row of selected) recaps.push(await this.get(owner, row.week_start));
    return { recaps, nextCursor: rows.results.length > limit ? selected.at(-1)!.week_start : null };
  }
}

export async function cleanupWeeklyRecaps(db: D1Database, owner: string) {
  await db.batch([
    db.prepare('DELETE FROM weekly_recap_draft_requests WHERE user_id=?').bind(owner),
    db.prepare('DELETE FROM weekly_recap_windows WHERE user_id=?').bind(owner),
    db.prepare('DELETE FROM weekly_recap_preferences WHERE user_id=?').bind(owner),
  ]);
}
/** Bounded, resumable scan. Replays and missed cron runs preserve private snapshots. */
export async function processWeeklyRecapCatchup(db: D1Database, now = Date.now()) {
  const cursor =
    (
      await db
        .prepare("SELECT owner_cursor FROM weekly_recap_jobs WHERE id='catchup'")
        .first<{ owner_cursor: string }>()
    )?.owner_cursor ?? '';
  const users = await db
    .prepare('SELECT * FROM weekly_recap_preferences WHERE user_id>? ORDER BY user_id LIMIT 25')
    .bind(cursor)
    .all<Preferences>();
  let generated = 0;
  for (const p of users.results) {
    const service = new WeeklyRecapService(db, now),
      latest = latestClosedWeekStart(service.activeEpoch(p).timezone, new Date(now));
    let week = p.catchup_week_start;
    for (let count = 0; week <= latest && count < 8; count++, week = addLocalDays(week, 7)) {
      try {
        await service.get(p.user_id, week);
        generated++;
      } catch (error) {
        if (error instanceof PublicationError && error.details?.reason === 'WEEK_NOT_CLOSED') break;
        if (
          !(
            error instanceof PublicationError &&
            error.details?.reason === 'TIMEZONE_TRANSITION_WEEK'
          )
        )
          throw error;
      }
    }
    await db
      .prepare('UPDATE weekly_recap_preferences SET catchup_week_start=? WHERE user_id=?')
      .bind(week, p.user_id)
      .run();
  }
  await db
    .prepare(
      "INSERT INTO weekly_recap_jobs(id,owner_cursor) VALUES('catchup',?) ON CONFLICT(id) DO UPDATE SET owner_cursor=excluded.owner_cursor"
    )
    .bind(users.results.length === 25 ? users.results.at(-1)!.user_id : '')
    .run();
  return { generated, scanned: users.results.length };
}
