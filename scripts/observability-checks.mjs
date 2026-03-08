#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertRequiredFiles,
  parseCommandArgs,
  printJsonReport,
  scanWorkerRuntimeConsoleUsage,
  writeJsonArtifact,
} from './lib/observability.ts';

const args = parseCommandArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const scripts = packageJson.scripts ?? {};

const requiredFiles = [
  'docs/observability/agent-diagnostics.md',
  'docs/observability/event-taxonomy.md',
  '.codex/skills/zine-observability/SKILL.md',
  'scripts/diag-health.mjs',
  'scripts/diag-cf-logs.mjs',
  'scripts/diag-release.mjs',
  'scripts/diag-queue-dlq.mjs',
  'scripts/diag-incident.mjs',
];

const requiredScripts = [
  'diag:health',
  'diag:cf:logs',
  'diag:release',
  'diag:queue:dlq',
  'diag:incident',
  'observability:check',
  'test:observability',
];

const missingFiles = assertRequiredFiles(repoRoot, requiredFiles);
const missingScripts = requiredScripts.filter((scriptName) => !scripts[scriptName]);
const consoleViolations = scanWorkerRuntimeConsoleUsage(resolve(repoRoot, 'apps/worker/src'));

const checks = [
  {
    name: 'required-files',
    ok: missingFiles.length === 0,
    missing: missingFiles,
  },
  {
    name: 'package-scripts',
    ok: missingScripts.length === 0,
    missing: missingScripts,
  },
  {
    name: 'worker-runtime-console',
    ok: consoleViolations.length === 0,
    violations: consoleViolations,
  },
];

const ok = checks.every((check) => check.ok);
const report = {
  collectedAt: new Date().toISOString(),
  ok,
  checks,
};

const outPath =
  typeof args.out === 'string'
    ? args.out
    : (process.env.ZINE_OBSERVABILITY_SUMMARY_PATH ?? undefined);
writeJsonArtifact(outPath, report);

printJsonReport(
  report,
  `Summary: ${ok ? 'OK' : 'ERROR'} checks=${checks.length} consoleViolations=${consoleViolations.length}${outPath ? ` out=${outPath}` : ''}`
);

if (!ok) {
  process.exit(1);
}
