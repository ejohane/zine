import type { CardItem } from './types';

/** 13 -> "13 min", 87 -> "1 h 27 min", 120 -> "2 h". */
export function formatDuration(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const rest = whole % 60;
  return rest ? `${Math.floor(whole / 60)} h ${rest} min` : `${Math.floor(whole / 60)} h`;
}

/** "Saved 2d ago". Units: m, h, d, w, mo, y. */
export function formatSaved(savedAt: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(savedAt).getTime()) / 60_000));
  const steps: [number, string][] = [
    [60, 'm'],
    [24, 'h'],
    [7, 'd'],
    [4.35, 'w'],
    [12, 'mo'],
  ];
  let value = minutes;
  let unit = 'm';
  for (const [size, label] of steps) {
    unit = label;
    if (value < size) break;
    value = Math.floor(value / size);
    unit = 'y';
  }
  return value === 0 ? 'Saved just now' : `Saved ${value}${unit} ago`;
}

/** "8 min left" for something started and not finished; "In progress" when its length is unknown. */
export function progressLabel(item: CardItem): string | undefined {
  const done = item.progress;
  if (done === undefined || done <= 0 || done >= 1) return undefined;
  if (!item.durationMinutes) return 'In progress';
  return `${formatDuration(item.durationMinutes * (1 - done))} left`;
}

/** The left side of the footer: what is left or how long it is, then when it was saved. */
export function footerLabel(item: CardItem, now?: Date): string {
  const parts: string[] = [];
  const left = progressLabel(item);
  if (left) {
    parts.push(left);
  } else if (item.kind === 'post') {
    if (item.picture?.isVideo) parts.push('Video');
  } else if (item.durationMinutes) {
    const length = formatDuration(item.durationMinutes);
    parts.push(item.kind === 'article' ? `${length} read` : length);
  }
  if (item.savedAt) parts.push(formatSaved(item.savedAt, now));
  return parts.join(' · ');
}
