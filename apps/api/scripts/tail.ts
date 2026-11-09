import { spawn } from 'node:child_process';

// Raw records stay in memory. Emit only our structured diagnostics, never raw
// Cloudflare request headers, cookies, bodies, or exception messages.
const child = spawn('bunx', ['wrangler@4.158.0', 'tail', 'zine-api-next', '--format', 'json'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let buffer = '';
function emit(record: Record<string, unknown>) {
  const event = record.event as { request?: { method?: string; url?: string } } | undefined;
  const logs = Array.isArray(record.logs) ? record.logs : [];
  const safe = [];
  for (const entry of logs) {
    for (const message of (entry as { message?: unknown[] }).message ?? []) {
      if (typeof message !== 'string') continue;
      try {
        const parsed = JSON.parse(message);
        if (
          typeof parsed.event === 'string' &&
          (parsed.event !== 'job_attempt_failed' || parsed.diagnostic)
        )
          safe.push(parsed);
      } catch {
        /* Ignore unstructured private data. */
      }
    }
  }
  if (safe.length || record.outcome !== 'ok')
    console.log(
      JSON.stringify({
        outcome: record.outcome,
        method: event?.request?.method,
        path: event?.request?.url ? new URL(event.request.url).pathname : undefined,
        logs: safe,
        exceptionCount: Array.isArray(record.exceptions) ? record.exceptions.length : 0,
      })
    );
}
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  while (true) {
    const start = buffer.indexOf('{');
    if (start < 0) {
      buffer = '';
      break;
    }
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < buffer.length; i++) {
      const char = buffer[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === '{') depth++;
      if (char === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) break;
    const json = buffer.slice(start, end);
    buffer = buffer.slice(end);
    try {
      emit(JSON.parse(json));
    } catch {
      /* CLI banners are not events. */
    }
  }
});
child.stderr.on('data', () => {
  /* Never forward unfiltered output. */
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
console.log(JSON.stringify({ tailing: 'zine-api-next', rawHeadersAndBodiesSuppressed: true }));
