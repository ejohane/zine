#!/usr/bin/env bun
import {
  AbandonEditorialExperimentSchema,
  CreateEditorialExperimentSchema,
  DailyEditionSchema,
  EditorialCandidateArtifactSchema,
  EditorialExternalDiscoveryArtifactSchema,
  EditorialSnapshotSchema,
  EditorialValidationReportSchema,
  FailEditorialExperimentSchema,
  PublishEditorialEditionSchema,
  PublishEditorialExperimentVariantSchema,
  PromoteEditorialExperimentSchema,
  ReviewEditorialExperimentSchema,
  UpdateEditorialExperimentSchema,
  finalizeDailyEdition,
} from '@zine/editorial-schema';
import { parseArgs, requiredArg } from './args';
import { renderEditionMarkdown } from './render';
import { buildEditorialSnapshot } from './snapshot';
import { buildEditorialCandidateArtifact } from './candidates';
import {
  editorialApiUrlFromArgs,
  failEditorialRunFromArgs,
  getEditorialRequest,
  patchEditorialRequest,
  postEditorialRequest,
  startEditorialRunFromArgs,
} from './editorial-client';
import { EDITORIAL_HELP_TEXT } from './help';
import { replayEditorialDirectory } from './replay';

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
  if (command === 'experiment-create') {
    const body = CreateEditorialExperimentSchema.parse(await readJson(requiredArg(args, 'file')));
    console.log(
      JSON.stringify(
        await postEditorialRequest('/api/v1/editorial/experiments', body, {
          token: process.env.ZINE_ACCESS_TOKEN,
          apiUrl: editorialApiUrlFromArgs(args),
        })
      )
    );
    return;
  }

  if (command === 'experiment-update') {
    const experimentId = requiredArg(args, 'experiment-id');
    const body = UpdateEditorialExperimentSchema.parse(await readJson(requiredArg(args, 'file')));
    console.log(
      JSON.stringify(
        await patchEditorialRequest(
          `/api/v1/editorial/experiments/${encodeURIComponent(experimentId)}`,
          body,
          {
            token: process.env.ZINE_ACCESS_TOKEN,
            apiUrl: editorialApiUrlFromArgs(args),
          }
        )
      )
    );
    return;
  }

  if (command === 'experiment-status') {
    const path =
      typeof args['experiment-id'] === 'string'
        ? `/api/v1/editorial/experiments/${encodeURIComponent(args['experiment-id'])}`
        : '/api/v1/editorial/experiments';
    console.log(
      JSON.stringify(
        await getEditorialRequest(path, {
          token: process.env.ZINE_ACCESS_TOKEN,
          apiUrl: editorialApiUrlFromArgs(args),
        })
      )
    );
    return;
  }

  if (command === 'experiment-lock') {
    const experimentId = requiredArg(args, 'experiment-id');
    console.log(
      JSON.stringify(
        await postEditorialRequest(
          `/api/v1/editorial/experiments/${encodeURIComponent(experimentId)}/lock`,
          {},
          {
            token: process.env.ZINE_ACCESS_TOKEN,
            apiUrl: editorialApiUrlFromArgs(args),
          }
        )
      )
    );
    return;
  }

  if (command === 'experiment-fail') {
    const experimentId = requiredArg(args, 'experiment-id');
    const body = FailEditorialExperimentSchema.parse({ message: requiredArg(args, 'message') });
    console.log(
      JSON.stringify(
        await postEditorialRequest(
          `/api/v1/editorial/experiments/${encodeURIComponent(experimentId)}/failure`,
          body,
          {
            token: process.env.ZINE_ACCESS_TOKEN,
            apiUrl: editorialApiUrlFromArgs(args),
          }
        )
      )
    );
    return;
  }

  if (command === 'experiment-abandon') {
    const experimentId = requiredArg(args, 'experiment-id');
    const body = AbandonEditorialExperimentSchema.parse({
      reason: typeof args.reason === 'string' ? args.reason : '',
    });
    console.log(
      JSON.stringify(
        await postEditorialRequest(
          `/api/v1/editorial/experiments/${encodeURIComponent(experimentId)}/abandon`,
          body,
          {
            token: process.env.ZINE_ACCESS_TOKEN,
            apiUrl: editorialApiUrlFromArgs(args),
          }
        )
      )
    );
    return;
  }

  if (command === 'experiment-variant-publish') {
    const experimentId = requiredArg(args, 'experiment-id');
    const edition = DailyEditionSchema.parse(await readJson(requiredArg(args, 'edition')));
    const snapshot = EditorialSnapshotSchema.parse(await readJson(requiredArg(args, 'snapshot')));
    const validation = EditorialValidationReportSchema.parse(
      await readJson(requiredArg(args, 'validation'))
    );
    const markdown = await Bun.file(requiredArg(args, 'markdown')).text();
    const candidateArtifact = EditorialCandidateArtifactSchema.parse(
      await readJson(requiredArg(args, 'candidates'))
    );
    const bundle = PublishEditorialEditionSchema.parse({
      edition,
      snapshot,
      validation,
      markdown,
      candidateArtifact,
    });
    const body = PublishEditorialExperimentVariantSchema.parse({
      id: requiredArg(args, 'variant-id'),
      label: requiredArg(args, 'label').toLocaleUpperCase(),
      name: requiredArg(args, 'name'),
      description: requiredArg(args, 'description'),
      bundle,
    });
    console.log(
      JSON.stringify(
        await postEditorialRequest(
          `/api/v1/editorial/experiments/${encodeURIComponent(experimentId)}/variants`,
          body,
          {
            token: process.env.ZINE_ACCESS_TOKEN,
            apiUrl: editorialApiUrlFromArgs(args),
          }
        )
      )
    );
    return;
  }

  if (command === 'experiment-decide') {
    const experimentId = requiredArg(args, 'experiment-id');
    const body = ReviewEditorialExperimentSchema.parse({
      clientEventId:
        typeof args['client-event-id'] === 'string' ? args['client-event-id'] : crypto.randomUUID(),
      preference: requiredArg(args, 'preference').toLocaleUpperCase(),
      notes: typeof args.notes === 'string' ? args.notes : '',
    });
    console.log(
      JSON.stringify(
        await postEditorialRequest(
          `/api/v1/editorial/experiments/${encodeURIComponent(experimentId)}/decision`,
          body,
          {
            token: process.env.ZINE_ACCESS_TOKEN,
            apiUrl: editorialApiUrlFromArgs(args),
          }
        )
      )
    );
    return;
  }

  if (command === 'experiment-promote') {
    const experimentId = requiredArg(args, 'experiment-id');
    const body = PromoteEditorialExperimentSchema.parse({
      variantId: requiredArg(args, 'variant-id'),
    });
    console.log(
      JSON.stringify(
        await postEditorialRequest(
          `/api/v1/editorial/experiments/${encodeURIComponent(experimentId)}/promote`,
          body,
          {
            token: process.env.ZINE_ACCESS_TOKEN,
            apiUrl: editorialApiUrlFromArgs(args),
          }
        )
      )
    );
    return;
  }

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
      ...(typeof args.discovery === 'string'
        ? {
            externalDiscovery: EditorialExternalDiscoveryArtifactSchema.parse(
              await readJson(args.discovery)
            ),
          }
        : {}),
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
        selected:
          artifact.strategy === 'EDITORIAL_V2'
            ? artifact.portfolio.selectedCandidateIds.length
            : undefined,
      })
    );
    return;
  }

  if (command === 'replay') {
    const directory = requiredArg(args, 'directory');
    const output = requiredArg(args, 'output');
    const report = await replayEditorialDirectory(directory);
    await writeJson(output, report);
    console.log(
      JSON.stringify({ output, snapshots: report.snapshots, aggregate: report.aggregate })
    );
    return;
  }

  if (command === 'portfolio-override') {
    const file = requiredArg(args, 'file');
    const output = requiredArg(args, 'output');
    const candidateId = requiredArg(args, 'candidate-id');
    const action = requiredArg(args, 'action').toLocaleUpperCase();
    const reason = requiredArg(args, 'reason').trim();
    if (action !== 'INCLUDE' && action !== 'EXCLUDE') {
      throw new Error('--action must be INCLUDE or EXCLUDE');
    }
    const artifact = EditorialCandidateArtifactSchema.parse(await readJson(file));
    if (artifact.strategy !== 'EDITORIAL_V2') {
      throw new Error('Portfolio overrides require an EDITORIAL_V2 candidate artifact');
    }
    if (!artifact.candidates.some((candidate) => candidate.id === candidateId)) {
      throw new Error(`Unknown candidate: ${candidateId}`);
    }
    const updated = EditorialCandidateArtifactSchema.parse({
      ...artifact,
      portfolio: {
        ...artifact.portfolio,
        editorialOverrides: [
          ...artifact.portfolio.editorialOverrides.filter(
            (override) => override.candidateId !== candidateId
          ),
          { candidateId, action, reason },
        ],
      },
    });
    await writeJson(output, updated);
    console.log(JSON.stringify({ output, candidateId, action }));
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
