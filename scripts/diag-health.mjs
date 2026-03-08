#!/usr/bin/env bun

import { fetchHealthReport, printJsonReport, resolveBaseUrl } from './lib/observability.ts';

const report = await fetchHealthReport(resolveBaseUrl());
const { health, deps, queues } = report.results;
const overallStatus = [health, deps, queues].every(
  (entry) => entry.ok && entry.body && typeof entry.body === 'object'
)
  ? 'ok'
  : 'error';
const dlqCount =
  queues.body && typeof queues.body === 'object' && queues.body.queues?.dlq?.count != null
    ? queues.body.queues.dlq.count
    : 'unknown';

printJsonReport(
  report,
  `Summary: ${overallStatus.toUpperCase()} base=${report.baseUrl} health=${health.status} deps=${deps.status} queues=${queues.status} dlq=${dlqCount}`
);

if (overallStatus !== 'ok') {
  process.exit(1);
}
