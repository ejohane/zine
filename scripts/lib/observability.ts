import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

export interface DiagnosticFilters {
  traceId?: string;
  requestId?: string;
  clientRequestId?: string;
  jobId?: string;
  release?: string;
  provider?: string;
  operation?: string;
}

export interface CloudflareLogQuery {
  since?: string;
  from?: string;
  to?: string;
  limit?: number;
  filters?: DiagnosticFilters;
}

export interface HealthCheckResult {
  ok: boolean;
  status: number;
  url: string;
  body?: unknown;
  error?: string;
}

export interface HealthReport {
  collectedAt: string;
  baseUrl: string;
  results: {
    health: HealthCheckResult;
    deps: HealthCheckResult;
    queues: HealthCheckResult;
  };
}

export interface DiagnosticEvidence {
  source: string;
  detail: string;
}

export interface DiagnosticRecommendation {
  action: string;
  reason: string;
}

export interface IncidentReport {
  collectedAt: string;
  baseUrl: string;
  query: CloudflareLogQuery;
  health: HealthReport['results'];
  logs: {
    available: boolean;
    error?: string;
    matchedCount: number;
    summary: ReturnType<typeof summarizeDiagnosticRecords>;
    records: JsonRecord[];
  };
  verdict: string;
  confidence: number;
  evidence: DiagnosticEvidence[];
  candidateFixes: DiagnosticRecommendation[];
  nextQueries: string[];
}

type ScalarField = {
  path: string;
  value: string;
};

type ScanViolation = {
  file: string;
  line: number;
  content: string;
};

export interface CloudflareLogResult {
  ok: boolean;
  command: string[];
  records: JsonRecord[];
  error?: string;
  stderr?: string;
}

const COMMENT_ONLY_PATTERN = /^\s*(?:\/\/|\*|\/\*|\*\/)/;
const WORKER_CONSOLE_PATTERN = /console\.(?:log|warn|error|info|debug)\s*\(/;

const FILTER_FIELD_ALIASES: Record<keyof DiagnosticFilters, string[]> = {
  traceId: ['traceId', 'trace_id', 'x-trace-id'],
  requestId: ['requestId', 'request_id', 'x-request-id', 'rayid', 'ray_id'],
  clientRequestId: ['clientRequestId', 'client_request_id', 'x-client-request-id'],
  jobId: ['jobId', 'job_id'],
  release: [
    'release',
    'release.version',
    'release.gitSha',
    'release.buildId',
    'release.channel',
    'gitSha',
    'buildId',
  ],
  provider: ['provider'],
  operation: ['operation', 'event'],
};

const SUMMARY_FIELD_ALIASES = {
  traceId: FILTER_FIELD_ALIASES.traceId,
  requestId: FILTER_FIELD_ALIASES.requestId,
  clientRequestId: FILTER_FIELD_ALIASES.clientRequestId,
  jobId: FILTER_FIELD_ALIASES.jobId,
  provider: FILTER_FIELD_ALIASES.provider,
  operation: FILTER_FIELD_ALIASES.operation,
  level: ['level', 'severity'],
  release: FILTER_FIELD_ALIASES.release,
};

function normalizePath(path: string): string {
  return path.replace(/\[\d+\]/g, '').toLowerCase();
}

function flattenScalarFields(value: unknown, prefix: string = ''): ScalarField[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [
      {
        path: prefix || 'value',
        value: String(value),
      },
    ];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenScalarFields(entry, `${prefix}[${index}]`));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      flattenScalarFields(entry, prefix ? `${prefix}.${key}` : key)
    );
  }

  return [];
}

function hasFieldMatch(record: JsonRecord, aliases: string[], needle: string): boolean {
  const normalizedNeedle = needle.toLowerCase();
  const fields = flattenScalarFields(record);

  return fields.some((field) => {
    const fieldPath = normalizePath(field.path);
    const pathMatches = aliases.some((alias) => {
      const normalizedAlias = alias.toLowerCase();
      return fieldPath === normalizedAlias || fieldPath.endsWith(`.${normalizedAlias}`);
    });

    if (!pathMatches) {
      return false;
    }

    return field.value.toLowerCase().includes(normalizedNeedle);
  });
}

function collectFieldValues(record: JsonRecord, aliases: string[]): string[] {
  const values = flattenScalarFields(record)
    .filter((field) => {
      const fieldPath = normalizePath(field.path);
      return aliases.some((alias) => {
        const normalizedAlias = alias.toLowerCase();
        return fieldPath === normalizedAlias || fieldPath.endsWith(`.${normalizedAlias}`);
      });
    })
    .map((field) => field.value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

function updateCount(counter: Record<string, number>, key: string | undefined): void {
  if (!key) {
    return;
  }

  counter[key] = (counter[key] ?? 0) + 1;
}

function sortCounts(counter: Record<string, number>): Array<{ value: string; count: number }> {
  return Object.entries(counter)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
}

function sanitizeUrlString(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    if (value.includes('?')) {
      return value.split('?')[0] ?? value;
    }
    if (value.includes('#')) {
      return value.split('#')[0] ?? value;
    }
    return value;
  }
}

function redactString(value: string, path: string): string {
  if (/authorization|cookie|token|secret|password/i.test(path)) {
    return '[REDACTED]';
  }

  if (/bearer\s+[A-Za-z0-9._-]+/i.test(value)) {
    return value.replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  }

  if (/https?:\/\//i.test(value)) {
    return sanitizeUrlString(value);
  }

  return value;
}

export function redactDiagnosticValue(value: unknown, path: string = ''): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value, path);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => redactDiagnosticValue(entry, `${path}[${index}]`));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        redactDiagnosticValue(entry, path ? `${path}.${key}` : key),
      ])
    );
  }

  return String(value);
}

export function parseJsonLines(payload: string): JsonRecord[] {
  const trimmed = payload.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (entry): entry is JsonRecord => typeof entry === 'object' && entry !== null
      );
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return [parsed as JsonRecord];
    }
  } catch {
    // Fall through to line-oriented parsing.
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return typeof parsed === 'object' && parsed !== null ? [parsed as JsonRecord] : [];
      } catch {
        return [];
      }
    });
}

export function filterDiagnosticRecords(
  records: JsonRecord[],
  filters: DiagnosticFilters = {}
): JsonRecord[] {
  return records.filter((record) =>
    Object.entries(filters).every(([key, value]) => {
      if (!value) {
        return true;
      }

      const aliases = FILTER_FIELD_ALIASES[key as keyof DiagnosticFilters];
      return hasFieldMatch(record, aliases, value);
    })
  );
}

export function summarizeDiagnosticRecords(records: JsonRecord[]) {
  const levels: Record<string, number> = {};
  const operations: Record<string, number> = {};
  const providers: Record<string, number> = {};
  const releases: Record<string, number> = {};

  const traceIds = new Set<string>();
  const requestIds = new Set<string>();
  const clientRequestIds = new Set<string>();
  const jobIds = new Set<string>();

  for (const record of records) {
    updateCount(levels, collectFieldValues(record, SUMMARY_FIELD_ALIASES.level)[0]);
    updateCount(operations, collectFieldValues(record, SUMMARY_FIELD_ALIASES.operation)[0]);
    updateCount(providers, collectFieldValues(record, SUMMARY_FIELD_ALIASES.provider)[0]);

    for (const value of collectFieldValues(record, SUMMARY_FIELD_ALIASES.release)) {
      updateCount(releases, value);
    }
    for (const value of collectFieldValues(record, SUMMARY_FIELD_ALIASES.traceId)) {
      traceIds.add(value);
    }
    for (const value of collectFieldValues(record, SUMMARY_FIELD_ALIASES.requestId)) {
      requestIds.add(value);
    }
    for (const value of collectFieldValues(record, SUMMARY_FIELD_ALIASES.clientRequestId)) {
      clientRequestIds.add(value);
    }
    for (const value of collectFieldValues(record, SUMMARY_FIELD_ALIASES.jobId)) {
      jobIds.add(value);
    }
  }

  return {
    levels: sortCounts(levels),
    operations: sortCounts(operations),
    providers: sortCounts(providers),
    releases: sortCounts(releases),
    traceIds: [...traceIds].slice(0, 10),
    requestIds: [...requestIds].slice(0, 10),
    clientRequestIds: [...clientRequestIds].slice(0, 10),
    jobIds: [...jobIds].slice(0, 10),
  };
}

export function runCloudflareLogQuery(
  repoRoot: string,
  query: CloudflareLogQuery
): CloudflareLogResult {
  const command = ['python3', '.opencode/skill/cloudflare-logpull/logpull-logs.py'];

  if (query.since) {
    command.push('--since', query.since);
  } else if (query.from && query.to) {
    command.push('--from', query.from, '--to', query.to);
  } else {
    command.push('--since', '1h');
  }

  command.push('--limit', String(query.limit ?? 200));

  const process = Bun.spawnSync(command, {
    cwd: repoRoot,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });

  const stdout = process.stdout.toString();
  const stderr = process.stderr.toString().trim();

  if (process.exitCode !== 0) {
    return {
      ok: false,
      command,
      records: [],
      error: stderr || stdout.trim() || `Cloudflare log query exited with code ${process.exitCode}`,
      stderr,
    };
  }

  const parsedRecords = parseJsonLines(stdout);
  const filteredRecords = filterDiagnosticRecords(parsedRecords, query.filters);

  return {
    ok: true,
    command,
    records: filteredRecords,
    stderr,
  };
}

export async function fetchHealthReport(baseUrl: string): Promise<HealthReport> {
  const endpoints = {
    health: '/health',
    deps: '/health/deps',
    queues: '/health/queues',
  };

  async function fetchJson(path: string): Promise<HealthCheckResult> {
    const url = `${baseUrl}${path}`;

    try {
      const response = await fetch(url);
      const text = await response.text();

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }

      return {
        ok: response.ok,
        status: response.status,
        url,
        body: redactDiagnosticValue(body),
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        url,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const [health, deps, queues] = await Promise.all(
    Object.values(endpoints).map((path) => fetchJson(path))
  );

  return {
    collectedAt: new Date().toISOString(),
    baseUrl,
    results: {
      health,
      deps,
      queues,
    },
  };
}

export function buildIncidentReport(input: {
  baseUrl: string;
  query: CloudflareLogQuery;
  health: HealthReport;
  logs: {
    available: boolean;
    error?: string;
    records: JsonRecord[];
  };
}): IncidentReport {
  const records = input.logs.records.map((record) => redactDiagnosticValue(record) as JsonRecord);
  const summary = summarizeDiagnosticRecords(records);
  const evidence: DiagnosticEvidence[] = [];
  const candidateFixes: DiagnosticRecommendation[] = [];
  const nextQueries: string[] = [];

  const healthStatus = input.health.results.health.body as Record<string, unknown> | undefined;
  const depsStatus = input.health.results.deps.body as Record<string, unknown> | undefined;
  const queuesStatus = input.health.results.queues.body as Record<string, unknown> | undefined;
  const queueDlq =
    queuesStatus?.queues && typeof queuesStatus.queues === 'object'
      ? (queuesStatus.queues as Record<string, unknown>).dlq
      : undefined;
  const dlqCount =
    queueDlq &&
    typeof queueDlq === 'object' &&
    typeof (queueDlq as Record<string, unknown>).count === 'number'
      ? ((queueDlq as Record<string, unknown>).count as number)
      : 0;
  const errorLogCount = (summary.levels.find((entry) => entry.value === 'error')?.count ??
    0) as number;
  const degradedDependency =
    depsStatus && typeof depsStatus === 'object' && depsStatus.status === 'degraded';

  let verdict = 'no_obvious_worker_fault';
  let confidence = 0.42;

  if (!input.logs.available) {
    verdict = 'cloudflare_log_query_unavailable';
    confidence = 0.58;
    evidence.push({
      source: 'cloudflare',
      detail: input.logs.error ?? 'Cloudflare log query failed before records were collected.',
    });
    candidateFixes.push({
      action:
        'Verify CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are set with logs read access.',
      reason: 'Historical worker logs are unavailable until the query wrapper can authenticate.',
    });
  }

  if (!input.health.results.health.ok || !healthStatus || healthStatus.status === 'error') {
    verdict = 'worker_health_check_failed';
    confidence = 0.86;
    evidence.push({
      source: 'health',
      detail: `Worker /health returned status ${input.health.results.health.status}.`,
    });
    candidateFixes.push({
      action: 'Stabilize the worker before chasing request-level traces.',
      reason: 'The base health probe is already failing, so request diagnostics are secondary.',
    });
  } else if (degradedDependency) {
    verdict = 'dependency_health_degraded';
    confidence = 0.82;
    evidence.push({
      source: 'deps',
      detail: 'At least one dependency health probe reported degraded status.',
    });
    candidateFixes.push({
      action: 'Check D1/KV availability and latency using /health/deps before replaying traffic.',
      reason: 'Dependency failures will skew every trace reconstruction attempt.',
    });
  } else if (dlqCount > 0) {
    verdict = 'queue_dlq_backlog';
    confidence = 0.78;
    evidence.push({
      source: 'queues',
      detail: `DLQ backlog is non-zero (${dlqCount}).`,
    });
    candidateFixes.push({
      action: 'Inspect DLQ message metadata and the latest matching Cloudflare error events.',
      reason: 'Dead-lettered queue traffic is the strongest signal of where async sync is failing.',
    });
    nextQueries.push('bun run diag:queue:dlq');
  } else if (errorLogCount > 0) {
    verdict = 'worker_error_events_detected';
    confidence = 0.73;
    evidence.push({
      source: 'logs',
      detail: `Matched ${errorLogCount} error-level Cloudflare log entries in the requested window.`,
    });
    candidateFixes.push({
      action:
        'Filter the matched logs by operation/provider and compare against the first failing release.',
      reason: 'The worker emitted explicit error events for the same incident window.',
    });
  } else if (records.length === 0) {
    verdict = 'no_matching_worker_logs';
    confidence = 0.64;
    evidence.push({
      source: 'logs',
      detail: 'No matching worker log records were found for the supplied filters.',
    });
    candidateFixes.push({
      action: 'Verify the correlation ID and widen the time window or release filter.',
      reason: 'The failure may not have reached the worker or the query was too narrow.',
    });
  } else {
    evidence.push({
      source: 'logs',
      detail: `Matched ${records.length} worker log records with no error-level or DLQ signal.`,
    });
    candidateFixes.push({
      action:
        'Compare the matched request timeline against the mobile diagnostic bundle or client trace store.',
      reason:
        'The worker looks healthy, so the gap may be client-side or in an upstream provider response.',
    });
  }

  if (input.query.filters?.traceId) {
    nextQueries.push(`bun run diag:cf:logs -- --trace ${input.query.filters.traceId}`);
  }
  if (input.query.filters?.release) {
    nextQueries.push(`bun run diag:release -- ${input.query.filters.release}`);
  }
  if (input.query.filters?.provider) {
    nextQueries.push(
      `bun run diag:cf:logs -- --provider ${input.query.filters.provider} --since ${input.query.since ?? '1h'}`
    );
  }

  return {
    collectedAt: new Date().toISOString(),
    baseUrl: input.baseUrl,
    query: input.query,
    health: input.health.results,
    logs: {
      available: input.logs.available,
      error: input.logs.error,
      matchedCount: records.length,
      summary,
      records,
    },
    verdict,
    confidence,
    evidence,
    candidateFixes,
    nextQueries: [...new Set(nextQueries)],
  };
}

export function resolveBaseUrl(): string {
  const workerPort = process.env.ZINE_WORKER_PORT ?? '8787';
  return (
    process.env.ZINE_DIAG_BASE_URL ??
    process.env.EXPO_PUBLIC_API_URL ??
    `http://localhost:${workerPort}`
  );
}

export function parseCommandArgs(argv: string[]): Record<string, string | boolean | string[]> {
  const parsed: Record<string, string | boolean | string[]> = {
    _: [],
  };

  const appendValue = (key: string, value: string | boolean): void => {
    const existing = parsed[key];

    if (existing === undefined) {
      parsed[key] = value;
      return;
    }

    if (Array.isArray(existing)) {
      parsed[key] = [...existing, String(value)];
      return;
    }

    parsed[key] = [String(existing), String(value)];
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') {
      (parsed._ as string[]).push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith('--')) {
      (parsed._ as string[]).push(token);
      continue;
    }

    const assignment = token.slice(2);
    const equalsIndex = assignment.indexOf('=');

    if (equalsIndex > -1) {
      const key = assignment.slice(0, equalsIndex);
      const value = assignment.slice(equalsIndex + 1);
      appendValue(key, value);
      continue;
    }

    const key = assignment;
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      appendValue(key, true);
      continue;
    }

    appendValue(key, next);
    index += 1;
  }

  return parsed;
}

export function printJsonReport(report: unknown, summary: string): void {
  console.log(JSON.stringify(report, null, 2));
  console.log('');
  console.log(summary);
}

export function writeJsonArtifact(path: string | undefined, data: unknown): void {
  if (!path) {
    return;
  }

  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function scanWorkerRuntimeConsoleUsage(rootDir: string): ScanViolation[] {
  const violations: ScanViolation[] = [];
  const workerRoot = resolve(rootDir);

  function walk(currentDir: string): void {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry);
      const stats = statSync(fullPath);

      if (stats.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) {
        continue;
      }

      if (fullPath.endsWith('lib/logger.ts')) {
        continue;
      }

      const contents = readFileSync(fullPath, 'utf8').split('\n');
      contents.forEach((line, index) => {
        if (COMMENT_ONLY_PATTERN.test(line)) {
          return;
        }

        if (WORKER_CONSOLE_PATTERN.test(line)) {
          violations.push({
            file: relative(rootDir, fullPath),
            line: index + 1,
            content: line.trim(),
          });
        }
      });
    }
  }

  walk(workerRoot);

  return violations;
}

export function assertRequiredFiles(rootDir: string, paths: string[]): string[] {
  return paths.filter((path) => !existsSync(resolve(rootDir, path)));
}
