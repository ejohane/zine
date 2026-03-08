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
const release =
  typeof args.release === 'string'
    ? args.release
    : typeof positional[0] === 'string'
      ? positional[0]
      : undefined;

if (!release) {
  const errorReport = {
    ok: false,
    error: 'Provide a release identifier via `bun run diag:release -- <gitSha|version>`.',
  };
  printJsonReport(errorReport, 'Summary: ERROR missing release identifier');
  process.exit(1);
}

const query = {
  since: typeof args.since === 'string' ? args.since : '24h',
  from: typeof args.from === 'string' ? args.from : undefined,
  to: typeof args.to === 'string' ? args.to : undefined,
  limit: typeof args.limit === 'string' ? Number.parseInt(args.limit, 10) : 200,
  filters: {
    release,
    provider: typeof args.provider === 'string' ? args.provider : undefined,
    operation: typeof args.operation === 'string' ? args.operation : undefined,
  },
};

const result = runCloudflareLogQuery(process.cwd(), query);

const report = {
  collectedAt: new Date().toISOString(),
  query,
  ok: result.ok,
  error: result.error,
  summary: summarizeDiagnosticRecords(result.records),
  matchedCount: result.records.length,
  records: result.records.map((record) => redactDiagnosticValue(record)),
};

printJsonReport(
  report,
  `Summary: ${result.ok ? 'OK' : 'ERROR'} release=${release} matched=${result.records.length} window=${query.since ?? `${query.from}..${query.to}`}`
);

if (!result.ok) {
  process.exit(1);
}
