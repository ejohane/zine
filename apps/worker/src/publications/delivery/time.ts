/** Calendar scheduling, including DST and non-hour offsets. */
export function localParts(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (name: string) => Number(parts.find((p) => p.type === name)!.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}
export function localDate(at: number, timezone: string) {
  const p = localParts(at, timezone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
function morning(year: number, month: number, day: number, timezone: string) {
  const target = Date.UTC(year, month - 1, day, 9);
  let utc = target;
  for (let i = 0; i < 6; i++) {
    const p = localParts(utc, timezone);
    const difference = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (!difference) break;
    utc += difference;
  }
  return utc;
}
export function nextMorning(after: number, timezone: string) {
  const p = localParts(after, timezone);
  const today = morning(p.year, p.month, p.day, timezone);
  if (today > after) return today;
  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return morning(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    timezone
  );
}
export function retryAt(now: number, attempts: number, retryAfterSeconds?: number) {
  return (
    now +
    Math.max(
      retryAfterSeconds ? retryAfterSeconds * 1000 : 0,
      Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(attempts, 10))
    )
  );
}
