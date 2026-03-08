#!/usr/bin/env bun

import {
  parseCommandArgs,
  printJsonReport,
  redactDiagnosticValue,
  runCloudflareLogQuery,
  summarizeDiagnosticRecords,
} from './lib/observability.ts';

const args = parseCommandArgs(process.argv.slice(2));
const positional = Array.isArray(args._) ? args._ : [];

const query = {
  since: typeof args.since === 'string' ? args.since : undefined,
  from: typeof args.from === 'string' ? args.from : undefined,
  to: typeof args.to === 'string' ? args.to : undefined,
  limit: typeof args.limit === 'string' ? Number.parseInt(args.limit, 10) : 200,
  filters: {
    traceId: typeof args.trace === 'string' ? args.trace : undefined,
    requestId: typeof args.request === 'string' ? args.request : undefined,
    clientRequestId:
      typeof args['client-request'] === 'string' ? args['client-request'] : undefined,
    jobId: typeof args.job === 'string' ? args.job : undefined,
    release:
      typeof args.release === 'string'
        ? args.release
        : typeof positional[0] === 'string'
          ? positional[0]
          : undefined,
    provider: typeof args.provider === 'string' ? args.provider : undefined,
    operation: typeof args.operation === 'string' ? args.operation : undefined,
  },
};

const result = runCloudflareLogQuery(process.cwd(), query);

const report = {
  collectedAt: new Date().toISOString(),
  source: 'cloudflare-logpull',
  query,
  command: result.command,
  ok: result.ok,
  error: result.error,
  summary: summarizeDiagnosticRecords(result.records),
  matchedCount: result.records.length,
  records: result.records.map((record) => redactDiagnosticValue(record)),
};

const windowLabel = query.since ?? `${query.from ?? 'unknown'}..${query.to ?? 'unknown'}`;
printJsonReport(
  report,
  `Summary: ${result.ok ? 'OK' : 'ERROR'} source=cloudflare-logpull window=${windowLabel} matched=${result.records.length}`
);

if (!result.ok) {
  process.exit(1);
}
