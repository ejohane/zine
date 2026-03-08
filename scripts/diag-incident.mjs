#!/usr/bin/env bun

import {
  buildIncidentReport,
  fetchHealthReport,
  parseCommandArgs,
  printJsonReport,
  resolveBaseUrl,
  runCloudflareLogQuery,
  writeJsonArtifact,
} from './lib/observability.ts';

const args = parseCommandArgs(process.argv.slice(2));

const query = {
  since: typeof args.since === 'string' ? args.since : '1h',
  from: typeof args.from === 'string' ? args.from : undefined,
  to: typeof args.to === 'string' ? args.to : undefined,
  limit: typeof args.limit === 'string' ? Number.parseInt(args.limit, 10) : 100,
  filters: {
    traceId: typeof args.trace === 'string' ? args.trace : undefined,
    requestId: typeof args.request === 'string' ? args.request : undefined,
    clientRequestId:
      typeof args['client-request'] === 'string' ? args['client-request'] : undefined,
    jobId: typeof args.job === 'string' ? args.job : undefined,
    release: typeof args.release === 'string' ? args.release : undefined,
    provider: typeof args.provider === 'string' ? args.provider : undefined,
    operation: typeof args.operation === 'string' ? args.operation : undefined,
  },
};

const baseUrl =
  typeof args.base === 'string'
    ? args.base
    : typeof args['base-url'] === 'string'
      ? args['base-url']
      : resolveBaseUrl();

const [health, logs] = await Promise.all([
  fetchHealthReport(baseUrl),
  Promise.resolve(runCloudflareLogQuery(process.cwd(), query)),
]);

const report = buildIncidentReport({
  baseUrl,
  query,
  health,
  logs: {
    available: logs.ok,
    error: logs.error,
    records: logs.records,
  },
});

const outPath = typeof args.out === 'string' ? args.out : undefined;
writeJsonArtifact(outPath, report);

printJsonReport(
  report,
  `Summary: ${report.verdict.toUpperCase()} confidence=${report.confidence.toFixed(2)} matched=${report.logs.matchedCount} base=${baseUrl}${outPath ? ` out=${outPath}` : ''}`
);

if (!logs.ok && !health.results.health.ok && !health.results.deps.ok && !health.results.queues.ok) {
  process.exit(1);
}
