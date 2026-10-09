import { getWeeklyRecapWindow } from '../lib/weekly-recap';
import { PublicationError } from '../publications/errors';

export function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    throw new PublicationError('INVALID_INPUT', 400, { field: 'timezone' });
  }
}
export function addLocalDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function requireSunday(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== weekStart ||
    date.getUTCDay() !== 0
  )
    throw new PublicationError('INVALID_INPUT', 400, { field: 'weekStart' });
}
export function recapWindow(weekStart: string, timezone: string) {
  requireSunday(weekStart);
  validTimezone(timezone);
  const result = getWeeklyRecapWindow(timezone, new Date(), addLocalDays(weekStart, 7));
  return {
    weekStart,
    timezone,
    startAt: result.startAt,
    endAt: result.endAt,
    startAtMs: result.startAtMs,
    endAtMs: result.endAtMs,
  };
}
export function latestClosedWeek(timezone: string, now = new Date()) {
  validTimezone(timezone);
  return getWeeklyRecapWindow(timezone, now).startLocalDate;
}
export function latestClosedWeekStart(timezone: string, now = new Date()) {
  const d = latestClosedWeek(timezone, now);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}
export function requireClosed(window: { endAtMs: number }, now: number) {
  if (window.endAtMs > now)
    throw new PublicationError('INVALID_INPUT', 400, { reason: 'WEEK_NOT_CLOSED' });
}
