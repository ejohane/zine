import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import {
  buildIncidentReport,
  filterDiagnosticRecords,
  redactDiagnosticValue,
  scanWorkerRuntimeConsoleUsage,
  summarizeDiagnosticRecords,
} from './observability';

describe('redactDiagnosticValue', () => {
  it('redacts secrets and strips URL query strings', () => {
    const redacted = redactDiagnosticValue({
      headers: {
        Authorization: 'Bearer secret-token',
      },
      url: 'https://api.myzine.app/trpc?input=secret#hash',
      nested: {
        accessToken: 'abc123',
      },
    }) as Record<string, unknown>;

    expect(redacted).toEqual({
      headers: {
        Authorization: '[REDACTED]',
      },
      url: 'https://api.myzine.app/trpc',
      nested: {
        accessToken: '[REDACTED]',
      },
    });
  });
});

describe('filterDiagnosticRecords', () => {
  const records = [
    {
      traceId: 'trc_123',
      requestId: 'req_123',
      jobId: 'job_123',
      provider: 'YOUTUBE',
      operation: 'subscriptions.sync.failed',
      release: { gitSha: 'abc123', version: '0.0.1' },
    },
    {
      traceId: 'trc_999',
      requestId: 'req_999',
      jobId: 'job_999',
      provider: 'SPOTIFY',
      operation: 'subscriptions.sync.completed',
      release: { gitSha: 'def456', version: '0.0.2' },
    },
  ];

  it('matches correlation and release filters across nested fields', () => {
    const matched = filterDiagnosticRecords(records, {
      traceId: 'trc_123',
      release: 'abc123',
      provider: 'youtube',
    });

    expect(matched).toHaveLength(1);
    expect(matched[0]?.traceId).toBe('trc_123');
  });
});

describe('summarizeDiagnosticRecords', () => {
  it('collects levels, operations, releases, and correlation IDs', () => {
    const summary = summarizeDiagnosticRecords([
      {
        level: 'error',
        operation: 'subscriptions.sync.failed',
        traceId: 'trc_123',
        requestId: 'req_123',
        clientRequestId: 'crq_123',
        jobId: 'job_123',
        provider: 'YOUTUBE',
        release: { gitSha: 'abc123' },
      },
      {
        level: 'warn',
        event: 'subscriptions.sync.retry',
        traceId: 'trc_123',
        provider: 'YOUTUBE',
        release: { version: '0.0.1' },
      },
    ]);

    expect(summary.levels).toEqual([
      { value: 'error', count: 1 },
      { value: 'warn', count: 1 },
    ]);
    expect(summary.operations[0]).toEqual({ value: 'subscriptions.sync.failed', count: 1 });
    expect(summary.traceIds).toContain('trc_123');
    expect(summary.requestIds).toContain('req_123');
    expect(summary.clientRequestIds).toContain('crq_123');
    expect(summary.jobIds).toContain('job_123');
    expect(summary.providers[0]).toEqual({ value: 'YOUTUBE', count: 2 });
  });
});

describe('buildIncidentReport', () => {
  it('detects DLQ backlog as the primary verdict', () => {
    const report = buildIncidentReport({
      baseUrl: 'http://localhost:8787',
      query: {
        since: '1h',
        filters: {
          traceId: 'trc_123',
        },
      },
      health: {
        collectedAt: new Date().toISOString(),
        baseUrl: 'http://localhost:8787',
        results: {
          health: {
            ok: true,
            status: 200,
            url: 'http://localhost:8787/health',
            body: { status: 'ok' },
          },
          deps: {
            ok: true,
            status: 200,
            url: 'http://localhost:8787/health/deps',
            body: { status: 'ok' },
          },
          queues: {
            ok: true,
            status: 200,
            url: 'http://localhost:8787/health/queues',
            body: {
              status: 'degraded',
              queues: {
                dlq: {
                  count: 2,
                },
              },
            },
          },
        },
      },
      logs: {
        available: true,
        records: [
          {
            level: 'error',
            traceId: 'trc_123',
            operation: 'subscriptions.sync.failed',
          },
        ],
      },
    });

    expect(report.verdict).toBe('queue_dlq_backlog');
    expect(report.nextQueries).toContain('bun run diag:queue:dlq');
    expect(report.candidateFixes[0]?.action).toContain('Inspect DLQ message metadata');
  });
});

describe('scanWorkerRuntimeConsoleUsage', () => {
  it('finds no remaining worker runtime console calls', () => {
    const violations = scanWorkerRuntimeConsoleUsage(join(process.cwd(), 'apps/worker/src'));

    expect(violations).toEqual([]);
  });
});
