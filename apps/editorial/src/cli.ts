#!/usr/bin/env bun
import {
  DailyEditionSchema,
  EditorialSnapshotSchema,
  EditorialValidationReportSchema,
  PublishEditorialEditionSchema,
  finalizeDailyEdition,
} from '@zine/editorial-schema';
import { parseArgs, requiredArg } from './args';
import { renderEditionMarkdown } from './render';
import { buildEditorialSnapshot } from './snapshot';

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

function help(): never {
  console.error(`Usage:
  editorial snapshot --output <snapshot.json> [--date YYYY-MM-DD] [--timezone America/Chicago]
  editorial validate --file <draft.json> --output <edition.json> --report <validation.json>
  editorial render --file <edition.json> --output <edition.md>
  editorial publish --edition <edition.json> --snapshot <snapshot.json> --validation <validation.json> --markdown <edition.md>

Environment:
  ZINE_ACCESS_TOKEN       PAT used for Zine reads and editorial persistence
  ZINE_X_ARCHIVE_TOKEN    optional PAT override for X archive reads`);
  process.exit(1);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text()) as unknown;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  if (command === 'snapshot') {
    const output = requiredArg(args, 'output');
    const token = process.env.ZINE_ACCESS_TOKEN;
    if (!token) throw new Error('ZINE_ACCESS_TOKEN is required');
    const timezone = typeof args.timezone === 'string' ? args.timezone : 'America/Chicago';
    const now = new Date();
    const editionDate =
      typeof args.date === 'string'
        ? args.date
        : new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
    const snapshot = await buildEditorialSnapshot({
      token,
      archiveToken: process.env.ZINE_X_ARCHIVE_TOKEN ?? token,
      apiUrl: typeof args['api-url'] === 'string' ? args['api-url'] : 'https://api.myzine.app',
      xApiUrl:
        typeof args['x-api-url'] === 'string'
          ? args['x-api-url']
          : 'https://x-archive-api.myzine.app',
      now,
      timezone,
      editionDate,
      snapshotKey: output,
    });
    await writeJson(output, snapshot);
    console.log(
      JSON.stringify({
        snapshotId: snapshot.id,
        output,
        documents: snapshot.documents.length,
        counts: snapshot.provenance.inputCounts,
        warnings: snapshot.provenance.warnings.length,
      })
    );
    return;
  }

  if (command === 'validate') {
    const file = requiredArg(args, 'file');
    const output = requiredArg(args, 'output');
    const reportPath = requiredArg(args, 'report');
    const result = finalizeDailyEdition(await readJson(file));
    await writeJson(reportPath, result.report);
    if (!result.edition) {
      console.error(JSON.stringify(result.report));
      process.exit(1);
    }
    await writeJson(output, result.edition);
    console.log(
      JSON.stringify({ valid: true, score: result.report.overallScore, output, reportPath })
    );
    return;
  }

  if (command === 'render') {
    const file = requiredArg(args, 'file');
    const output = requiredArg(args, 'output');
    const edition = DailyEditionSchema.parse(await readJson(file));
    await Bun.write(output, renderEditionMarkdown(edition));
    console.log(
      JSON.stringify({ output, stories: edition.stories.length, sources: edition.sources.length })
    );
    return;
  }

  if (command === 'publish') {
    const edition = DailyEditionSchema.parse(await readJson(requiredArg(args, 'edition')));
    const snapshot = EditorialSnapshotSchema.parse(await readJson(requiredArg(args, 'snapshot')));
    const validation = EditorialValidationReportSchema.parse(
      await readJson(requiredArg(args, 'validation'))
    );
    const markdown = await Bun.file(requiredArg(args, 'markdown')).text();
    const body = PublishEditorialEditionSchema.parse({ edition, snapshot, validation, markdown });
    const token = process.env.ZINE_ACCESS_TOKEN;
    if (!token) throw new Error('ZINE_ACCESS_TOKEN is required');
    const apiUrl = typeof args['api-url'] === 'string' ? args['api-url'] : 'https://api.myzine.app';
    const response = await fetch(`${apiUrl}/api/v1/editorial/editions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(`Editorial publish failed (${response.status}): ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
    return;
  }

  help();
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
