#!/usr/bin/env bun

import {
  fetchHealthReport,
  parseCommandArgs,
  printJsonReport,
  resolveBaseUrl,
} from './lib/observability.ts';

const args = parseCommandArgs(process.argv.slice(2));
const baseUrl =
  typeof args.base === 'string'
    ? args.base
    : typeof args['base-url'] === 'string'
      ? args['base-url']
      : resolveBaseUrl();
const report = await fetchHealthReport(baseUrl);
const queues = report.results.queues;
const limit = typeof args.limit === 'string' ? Number.parseInt(args.limit, 10) : 5;
const body = queues.body && typeof queues.body === 'object' ? queues.body : null;
const queueData = body?.queues && typeof body.queues === 'object' ? body.queues : null;
const dlqData = queueData?.dlq && typeof queueData.dlq === 'object' ? queueData.dlq : null;

const queueReport = {
  collectedAt: report.collectedAt,
  baseUrl,
  ok: queues.ok,
  status: queues.status,
  dlq: body
    ? {
        status: body.status,
        summary: dlqData
          ? {
              ...dlqData,
              recent: Array.isArray(dlqData.recent) ? dlqData.recent.slice(0, limit) : [],
            }
          : undefined,
      }
    : undefined,
  error: queues.error,
};

printJsonReport(
  queueReport,
  `Summary: ${queues.ok ? 'OK' : 'ERROR'} base=${baseUrl} queues=${queues.status}`
);

if (!queues.ok) {
  process.exit(1);
}
