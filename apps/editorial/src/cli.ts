#!/usr/bin/env bun
import {
  DailyEditionSchema,
  EditorialCandidateArtifactSchema,
  EditorialSnapshotSchema,
  EditorialValidationReportSchema,
  PublishEditorialEditionSchema,
  finalizeDailyEdition,
} from '@zine/editorial-schema';
import { parseArgs, requiredArg } from './args';
import { renderEditionMarkdown } from './render';
import { buildEditorialSnapshot } from './snapshot';
import { buildEditorialCandidateArtifact } from './candidates';
import {
  editorialApiUrlFromArgs,
  failEditorialRunFromArgs,
  postEditorialRequest,
  startEditorialRunFromArgs,
} from './editorial-client';
import { EDITORIAL_HELP_TEXT } from './help';

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

function help(): never {
  console.error(EDITORIAL_HELP_TEXT);
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

  if (command === 'rank') {
    const file = requiredArg(args, 'file');
    const output = requiredArg(args, 'output');
    const artifact = buildEditorialCandidateArtifact(await readJson(file));
    await writeJson(output, artifact);
    console.log(
      JSON.stringify({
        output,
        artifactId: artifact.id,
        candidates: artifact.candidates.length,
        clusters: artifact.clusters.length,
      })
    );
    return;
  }

  if (command === 'run-start') {
    console.log(
      JSON.stringify(
        await startEditorialRunFromArgs(args, { token: process.env.ZINE_ACCESS_TOKEN })
      )
    );
    return;
  }

  if (command === 'run-fail') {
    console.log(
      JSON.stringify(await failEditorialRunFromArgs(args, { token: process.env.ZINE_ACCESS_TOKEN }))
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
    const candidateArtifact = EditorialCandidateArtifactSchema.parse(
      await readJson(requiredArg(args, 'candidates'))
    );
    const body = PublishEditorialEditionSchema.parse({
      edition,
      snapshot,
      validation,
      markdown,
      candidateArtifact,
    });
    console.log(
      JSON.stringify(
        await postEditorialRequest('/api/v1/editorial/editions', body, {
          token: process.env.ZINE_ACCESS_TOKEN,
          apiUrl: editorialApiUrlFromArgs(args),
        })
      )
    );
    return;
  }

  help();
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
