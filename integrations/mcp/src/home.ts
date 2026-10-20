import {
  HOME_NATIVE_COMPONENTS,
  HomeCompositionSchema,
} from '../../../packages/shared/src/home-composition';
import {
  getHomeCandidates,
  getHomeComposition,
  prepareHomeComposition,
  publishHomeComposition,
} from '../../../apps/worker/src/lib/home-composition';
import { z } from 'zod';
import {
  DailyEditionSchema,
  EditorialSnapshotSchema,
  EditorialCandidateArtifactSchema,
  PublishEditorialEditionSchema,
  StartEditorialRunSchema,
  FailEditorialRunSchema,
  finalizeDailyEdition,
} from '@zine/editorial-schema';
import { renderEditionMarkdown } from '../../../apps/editorial/src/render';
import { getEditorialToday } from '../../../apps/worker/src/lib/editorial-today';
import {
  getEditorialEdition,
  storeEditorialEdition,
  EditorialValidationError,
} from '../../../apps/worker/src/lib/editorial-storage';
import { startEditorialRun, failEditorialRun } from '../../../apps/worker/src/lib/editorial-runs';
import type { Bindings } from '../../../apps/worker/src/types';

export const composeHomeSchema = z.object({ composition: HomeCompositionSchema }).strict();

export const getHomeSchema = z.object({}).strict();
export const startHomeSchema = StartEditorialRunSchema;
export const failHomeSchema = z
  .object({
    runId: StartEditorialRunSchema.shape.id,
    ...FailEditorialRunSchema.shape,
  })
  .strict();
export const createHomeSchema = z
  .object({
    edition: DailyEditionSchema.describe(
      'A grounded draft using the registered run metadata. userId is replaced by the linked account.'
    ),
    snapshot: EditorialSnapshotSchema.describe(
      'The actual captured source corpus and coverage provenance. Never fabricate sources or collection status.'
    ),
    candidateArtifact: EditorialCandidateArtifactSchema.optional(),
  })
  .strict();
export const publishHomeSchema = z.object({ bundle: PublishEditorialEditionSchema }).strict();

export class McpHome {
  constructor(
    private env: Bindings,
    private userId: string
  ) {}

  components() {
    return HOME_NATIVE_COMPONENTS;
  }

  candidates() {
    return getHomeCandidates(this.env, this.userId);
  }
  composition() {
    return getHomeComposition(this.env, this.userId);
  }
  prepareComposition(input: z.infer<typeof composeHomeSchema>) {
    return prepareHomeComposition(this.env, this.userId, input.composition);
  }
  publishComposition(input: z.infer<typeof composeHomeSchema>) {
    return publishHomeComposition(this.env, this.userId, input.composition);
  }

  async get() {
    const today = await getEditorialToday(this.env.DB, this.env.ARTICLE_CONTENT, this.userId);
    const warnings = [
      ...new Set([today.generation.message, ...today.freshness.warnings].filter(Boolean)),
    ];
    const notice = warnings.map((warning) => `> ${warning}`).join('\n');
    return {
      ...today,
      markdown: today.issue
        ? [notice, renderEditionMarkdown(today.issue)].filter(Boolean).join('\n\n')
        : null,
    };
  }

  start(input: z.infer<typeof startHomeSchema>) {
    return startEditorialRun(this.env.DB, this.userId, input);
  }

  fail(input: z.infer<typeof failHomeSchema>) {
    const { runId, ...failure } = input;
    return failEditorialRun(this.env.DB, this.userId, runId, failure);
  }

  create(input: z.infer<typeof createHomeSchema>) {
    if (
      input.edition.generation.workflowVersion === 'editorial-v2' &&
      input.candidateArtifact?.schemaVersion !== 2
    ) {
      throw new EditorialValidationError(
        'New v2 editions require their ranked v2 candidate artifact'
      );
    }
    if (
      JSON.stringify(input.edition.window) !== JSON.stringify(input.snapshot.window) ||
      JSON.stringify(input.edition.provenance) !== JSON.stringify(input.snapshot.provenance)
    ) {
      throw new EditorialValidationError(
        'Edition window and provenance must match the captured snapshot'
      );
    }
    const sourceIds = new Set(input.snapshot.documents.map((document) => document.source.id));
    if (input.edition.sources.some((source) => !sourceIds.has(source.id))) {
      throw new EditorialValidationError(
        'Every edition source must exist in the captured snapshot'
      );
    }
    const { edition, report } = finalizeDailyEdition({ ...input.edition, userId: this.userId });
    if (!edition) return { published: false, bundle: null, validation: report };
    const bundle = PublishEditorialEditionSchema.parse({
      edition,
      snapshot: input.snapshot,
      candidateArtifact: input.candidateArtifact,
      validation: report,
      markdown: renderEditionMarkdown(edition),
    });
    return { published: false, bundle, validation: report };
  }

  async publish(input: z.infer<typeof publishHomeSchema>) {
    // Recompute validation, quality and reader-facing Markdown at the write boundary.
    // A caller-supplied validation.valid flag is never proof of a valid edition.
    const prepared = this.create(input.bundle);
    if (!prepared.bundle)
      throw new EditorialValidationError('Edition failed server-side validation');
    const result = await storeEditorialEdition(
      this.env.DB,
      this.env.ARTICLE_CONTENT,
      this.userId,
      prepared.bundle
    );
    try {
      const stored = await getEditorialEdition(
        this.env.DB,
        this.env.ARTICLE_CONTENT,
        this.userId,
        prepared.bundle.edition.id
      );
      if (
        !stored ||
        JSON.stringify(stored.edition) !==
          JSON.stringify({
            ...prepared.bundle.edition,
            status: 'PUBLISHED',
          })
      ) {
        throw new Error('Readback mismatch');
      }
      const today = await this.get();
      return {
        published: true,
        verified: true,
        editionId: stored.edition.id,
        visibleInEditorialFeed: today.issue?.id === stored.edition.id,
        result,
        today,
      };
    } catch {
      // A failed readback must not imply that the completed write was rolled back.
      return {
        published: true,
        verified: false,
        editionId: prepared.bundle.edition.id,
        message:
          'Publication completed but readback could not be verified. Retry get_home_edition; reuse the same edition ID.',
        result,
      };
    }
  }
}
