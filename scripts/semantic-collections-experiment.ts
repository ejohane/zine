#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { z } from 'zod';

import {
  CollectionGenerationSchema,
  CollectionProposalModelOutputSchema,
  CollectionProposalSchema,
  SemanticCollectionCorpusSchema,
  ThemeDiscoverySchema,
  buildProductionCorpusQuery,
  buildSemanticCollectionCorpus,
  compactCorpusForModel,
  compareCollectionGenerations,
  renderSemanticCollectionReview,
  runWorkersAIStructured,
  validateCollectionProposal,
  validateCollectionProposalSet,
  validateDiscoveredThemes,
  validateProposalNovelty,
  type CollectionGeneration,
  type CollectionProposal,
  type CollectionProposalModelOutput,
  type DiscoveredTheme,
  type SemanticCollectionCorpus,
} from '../apps/worker/src/collections/semantic-experiment';

const DEFAULT_USER_ID = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DEFAULT_USER_LENS =
  'How engineers create meaningful organizational impact beyond writing code or completing assigned tickets.';
const DEFAULT_OUTPUT_ROOT = path.resolve('.local-data/semantic-collections');
const PRODUCTION_DATABASE = 'zine-db-production';
const PRODUCTION_ENVIRONMENT = 'production';
const PROMPT_VERSION = 'semantic-collections-v1';
const MAXIMUM_DISCOVERED_OVERLAP = 0.6;
const MINIMUM_CORE_RETENTION = 0.7;

interface ExperimentOptions {
  userId: string;
  userLens: string;
  model: string;
  outputRoot: string;
  corpusPath: string | null;
  themesPath: string | null;
  primaryPath: string | null;
}

function argumentValue(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

export function parseSemanticExperimentOptions(argv: string[]): ExperimentOptions {
  const supported = new Set([
    '--user-id',
    '--user-lens',
    '--model',
    '--output',
    '--corpus',
    '--themes',
    '--primary',
  ]);
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument?.startsWith('--')) continue;
    if (!supported.has(argument)) throw new Error(`Unknown argument: ${argument}`);
    if (!argv[index + 1] || argv[index + 1]?.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    index++;
  }

  return {
    userId: argumentValue(argv, '--user-id') ?? DEFAULT_USER_ID,
    userLens: argumentValue(argv, '--user-lens') ?? DEFAULT_USER_LENS,
    model:
      argumentValue(argv, '--model') ?? process.env.COLLECTION_GENERATION_MODEL ?? DEFAULT_MODEL,
    outputRoot: path.resolve(argumentValue(argv, '--output') ?? DEFAULT_OUTPUT_ROOT),
    corpusPath: argumentValue(argv, '--corpus')
      ? path.resolve(argumentValue(argv, '--corpus')!)
      : null,
    themesPath: argumentValue(argv, '--themes')
      ? path.resolve(argumentValue(argv, '--themes')!)
      : null,
    primaryPath: argumentValue(argv, '--primary')
      ? path.resolve(argumentValue(argv, '--primary')!)
      : null,
  };
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readProductionCorpusRows(userId: string): unknown[] {
  const query = buildProductionCorpusQuery(userId);
  const stdout = execFileSync(
    'bun',
    [
      'x',
      'wrangler',
      'd1',
      'execute',
      PRODUCTION_DATABASE,
      '--env',
      PRODUCTION_ENVIRONMENT,
      '--remote',
      '--command',
      query,
      '--json',
    ],
    {
      cwd: path.resolve('apps/worker'),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 50,
      stdio: ['ignore', 'pipe', 'inherit'],
    }
  );
  const batches = z
    .array(z.object({ results: z.array(z.unknown()), success: z.literal(true) }))
    .parse(JSON.parse(stdout));
  if (batches.length !== 1) throw new Error('Production corpus query returned multiple batches');
  return batches[0]?.results ?? [];
}

async function loadCorpus(options: ExperimentOptions): Promise<SemanticCollectionCorpus> {
  if (options.corpusPath) {
    return SemanticCollectionCorpusSchema.parse(await Bun.file(options.corpusPath).json());
  }
  return buildSemanticCollectionCorpus(options.userId, readProductionCorpusRows(options.userId));
}

function modelCorpusPayload(corpus: SemanticCollectionCorpus): string {
  return JSON.stringify({ corpusHash: corpus.corpusHash, articles: compactCorpusForModel(corpus) });
}

async function discoverThemes(input: {
  corpus: SemanticCollectionCorpus;
  accountId: string;
  apiToken: string;
  model: string;
}): Promise<DiscoveredTheme[]> {
  const result = await runWorkersAIStructured({
    accountId: input.accountId,
    apiToken: input.apiToken,
    model: input.model,
    seed: 1001,
    maxTokens: 2_400,
    schema: ThemeDiscoverySchema,
    operation: 'Collection theme discovery',
    repairPrompt:
      'Return exactly three distinct, narrow collection themes as valid JSON. Each theme must include exactly three exact seedItemIds. Keep rationales under 500 characters. Ensure seed portfolios have low pairwise overlap and collectively cover at least 70% of the corpus. Do not return generic subject categories or prose outside the object.',
    messages: [
      {
        role: 'system',
        content:
          'You are discovering durable semantic collection lenses for one reader. Use only the supplied evidence-backed semantic signals. A useful lens connects at least three articles through a specific tension, mechanism, argument, practice, or decision. Reject broad categories such as software development, AI, engineering, technology, career development, media studies, and entrepreneurship. Return only valid JSON. /no_think',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Discover exactly three distinct collection lenses grounded in this corpus.',
          constraints: [
            'Each lens must plausibly support at least three supplied articles.',
            'Prefer a recoverable thesis over a topical label.',
            'The three lenses should not describe substantially the same portfolio.',
            'Each theme must list exactly three exact seedItemIds that best demonstrate its lens.',
            'Seed portfolios must have pairwise Jaccard overlap no greater than 0.40.',
            'The union of all seed portfolios must cover at least 70% of supplied articles.',
            'Do not invent articles, claims, or reader interests.',
          ],
          corpus: JSON.parse(modelCorpusPayload(input.corpus)),
          outputContract: {
            themes: [
              {
                lens: 'specific one-sentence collection lens',
                rationale: 'why this lens emerges from several supplied articles',
                seedItemIds: ['exact supplied itemId'],
              },
            ],
          },
        }),
      },
    ],
    validate: (value) => validateDiscoveredThemes(value.themes, input.corpus),
  });
  return result.themes;
}

function proposalMessages(input: {
  corpus: SemanticCollectionCorpus;
  lens: string;
  origin: 'USER_DIRECTED' | 'AI_DISCOVERED';
  themeSeedItemIds: string[];
  priorProposals: CollectionProposal[];
}): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content:
        'You are assembling an explainable semantic collection from a personal article library. Judge article fit from the supplied evidence-backed signals, not from title, author, publisher, or broad category. Cite signal IDs exactly. Score every article, select only a coherent non-redundant portfolio, and return only valid JSON. /no_think',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Score the complete corpus and assemble one collection for the supplied lens.',
        origin: input.origin,
        lens: input.lens,
        themeSeedItemIds: input.themeSeedItemIds,
        constraints: [
          'candidateScores must contain every supplied itemId exactly once.',
          'Every selection and near miss must cite only signal IDs belonging to that same article.',
          'For a user-directed collection, select 3 to 6 articles whose arguments make distinct contributions to one precise collection thesis.',
          'For an AI-discovered collection, select exactly the three themeSeedItemIds plus at most one additional strongly fitting article.',
          'Rank the selected articles from strongest to weakest fit with consecutive ranks starting at 1.',
          'Return at most two near misses, and never also select a near miss.',
          'Use a distinctive editorial title, never a broad category such as Software Development, AI, Engineering, Technology, Career Development, Media Studies, or Entrepreneurship.',
          'Do not select an article merely because its title sounds related.',
          'Retain caveats from PARTIAL_CONTENT or quality warnings in scoring.',
          'All prose must be complete, concise, and untruncated.',
          'Avoid reproducing prior AI-discovered portfolios when the evidence supports a distinct selection.',
          'For an AI-discovered lens, treat themeSeedItemIds as the evidence-backed anchors discovered for this theme. Score every article independently, but do not replace the anchors with a prior collection merely because those articles are broadly about software.',
        ],
        priorAICollections: input.priorProposals
          .filter((proposal) => proposal.origin === 'AI_DISCOVERED')
          .map((proposal) => ({
            lens: proposal.lens,
            title: proposal.title,
            selectedItemIds: proposal.selectedItems.map((item) => item.itemId),
          })),
        corpus: JSON.parse(modelCorpusPayload(input.corpus)),
        outputContract: {
          title: 'distinctive editorial collection title',
          description: 'one-sentence reader-facing purpose',
          collectionRationale:
            'why these articles form a coherent collection rather than a topic bucket',
          candidateScores: [
            {
              itemId: 'exact supplied itemId',
              overallScore: 'number from 0 to 100',
              verdict: 'STRONG | MODERATE | WEAK',
            },
          ],
          selectedItems: [
            {
              itemId: 'exact supplied itemId',
              rank: 'consecutive integer starting at 1',
              reason: 'the distinct contribution this article makes to the collection',
              signalIds: ['exact signal ID from this article'],
            },
          ],
          nearMisses: [
            {
              itemId: 'exact supplied unselected itemId',
              reason: 'why it is adjacent but excluded',
              signalIds: ['exact signal ID from this article'],
            },
          ],
        },
      }),
    },
  ];
}

async function generateProposal(input: {
  corpus: SemanticCollectionCorpus;
  proposalId: string;
  origin: 'USER_DIRECTED' | 'AI_DISCOVERED';
  lens: string;
  discoveryRationale: string | null;
  themeSeedItemIds: string[];
  priorProposals: CollectionProposal[];
  accountId: string;
  apiToken: string;
  model: string;
  seed: number;
}): Promise<CollectionProposal> {
  const parsed = await runWorkersAIStructured<CollectionProposalModelOutput>({
    accountId: input.accountId,
    apiToken: input.apiToken,
    model: input.model,
    seed: input.seed,
    maxTokens: 6_000,
    schema: CollectionProposalModelOutputSchema,
    operation: `Collection proposal ${input.proposalId}`,
    repairPrompt:
      'Return the exact requested JSON object. Score every supplied article exactly once, cite only exact signal IDs belonging to every selected item and near miss, keep near misses unselected, and use complete non-truncated prose. For AI-discovered collections, retain all three exact themeSeedItemIds and select at most one additional article.',
    repairAttempts: 4,
    messages: proposalMessages({
      corpus: input.corpus,
      lens: input.lens,
      origin: input.origin,
      themeSeedItemIds: input.themeSeedItemIds,
      priorProposals: input.priorProposals,
    }),
    validate: (value) => {
      const candidate = CollectionProposalSchema.parse({
        ...value,
        proposalId: input.proposalId,
        origin: input.origin,
        lens: input.lens,
        discoveryRationale: input.discoveryRationale,
        themeSeedItemIds: input.themeSeedItemIds,
        model: input.model,
        promptVersion: PROMPT_VERSION,
        seed: input.seed,
      });
      return validateCollectionProposal(candidate, input.corpus).concat(
        validateProposalNovelty(candidate, input.priorProposals)
      );
    },
  });

  return CollectionProposalSchema.parse({
    ...parsed,
    proposalId: input.proposalId,
    origin: input.origin,
    lens: input.lens,
    discoveryRationale: input.discoveryRationale,
    themeSeedItemIds: input.themeSeedItemIds,
    model: input.model,
    promptVersion: PROMPT_VERSION,
    seed: input.seed,
  });
}

async function generateCollectionSet(input: {
  corpus: SemanticCollectionCorpus;
  userLens: string;
  themes: DiscoveredTheme[];
  accountId: string;
  apiToken: string;
  model: string;
  seedBase: number;
}): Promise<CollectionGeneration> {
  const proposals: CollectionProposal[] = [];
  proposals.push(
    await generateProposal({
      ...input,
      proposalId: 'user-directed',
      origin: 'USER_DIRECTED',
      lens: input.userLens,
      discoveryRationale: null,
      themeSeedItemIds: [],
      priorProposals: proposals,
      seed: input.seedBase + 1,
    })
  );

  for (let index = 0; index < input.themes.length; index++) {
    const theme = input.themes[index];
    if (!theme) continue;
    proposals.push(
      await generateProposal({
        ...input,
        proposalId: `ai-discovered-${index + 1}`,
        origin: 'AI_DISCOVERED',
        lens: theme.lens,
        discoveryRationale: theme.rationale,
        themeSeedItemIds: theme.seedItemIds,
        priorProposals: proposals,
        seed: input.seedBase + index + 2,
      })
    );
  }

  return CollectionGenerationSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    corpusHash: input.corpus.corpusHash,
    model: input.model,
    promptVersion: PROMPT_VERSION,
    proposals,
  });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await Bun.write(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function loadRetainedThemes(
  filePath: string | null,
  corpus: SemanticCollectionCorpus
): Promise<DiscoveredTheme[] | null> {
  if (!filePath) return null;
  const result = ThemeDiscoverySchema.parse(await Bun.file(filePath).json());
  const issues = validateDiscoveredThemes(result.themes, corpus);
  if (issues.length > 0) {
    throw new Error(`Retained themes failed current validation: ${issues.join('; ')}`);
  }
  return result.themes;
}

async function loadRetainedPrimary(
  filePath: string | null,
  corpus: SemanticCollectionCorpus,
  model: string
): Promise<CollectionGeneration | null> {
  if (!filePath) return null;
  const generation = CollectionGenerationSchema.parse(await Bun.file(filePath).json());
  if (generation.corpusHash !== corpus.corpusHash) {
    throw new Error('Retained primary generation uses a different corpus hash');
  }
  if (generation.model !== model || generation.promptVersion !== PROMPT_VERSION) {
    throw new Error('Retained primary generation uses a different model or prompt version');
  }
  const issues = validateCollectionProposalSet(generation, corpus, MAXIMUM_DISCOVERED_OVERLAP);
  if (issues.length > 0) {
    throw new Error(`Retained primary generation failed current validation: ${issues.join('; ')}`);
  }
  return generation;
}

export async function runSemanticCollectionExperiment(options: ExperimentOptions): Promise<{
  outputDirectory: string;
  corpus: SemanticCollectionCorpus;
  primary: CollectionGeneration;
  replay: CollectionGeneration;
  validationIssues: string[];
  stability: ReturnType<typeof compareCollectionGenerations>;
}> {
  const accountId = requireEnvironment('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = requireEnvironment('CLOUDFLARE_API_TOKEN');
  const corpus = await loadCorpus(options);
  const outputDirectory = path.join(options.outputRoot, timestampId());
  await Bun.write(path.join(outputDirectory, '.keep'), '');
  await writeJson(path.join(outputDirectory, 'corpus.json'), corpus);

  console.error(`Corpus snapshot: ${corpus.items.length} articles · ${corpus.corpusHash}`);
  const themes =
    (await loadRetainedThemes(options.themesPath, corpus)) ??
    (await discoverThemes({ corpus, accountId, apiToken, model: options.model }));
  await writeJson(path.join(outputDirectory, 'themes.json'), { themes });

  const primary =
    (await loadRetainedPrimary(options.primaryPath, corpus, options.model)) ??
    (await generateCollectionSet({
      corpus,
      userLens: options.userLens,
      themes,
      accountId,
      apiToken,
      model: options.model,
      seedBase: 1_100,
    }));
  await writeJson(path.join(outputDirectory, 'proposals.json'), primary);

  const replay = await generateCollectionSet({
    corpus,
    userLens: options.userLens,
    themes,
    accountId,
    apiToken,
    model: options.model,
    seedBase: 2_100,
  });
  await writeJson(path.join(outputDirectory, 'replay-proposals.json'), replay);

  const validationIssues = [
    ...validateCollectionProposalSet(primary, corpus, MAXIMUM_DISCOVERED_OVERLAP),
    ...validateCollectionProposalSet(replay, corpus, MAXIMUM_DISCOVERED_OVERLAP).map(
      (issue) => `replay: ${issue}`
    ),
  ];
  const stability = compareCollectionGenerations(primary, replay, MINIMUM_CORE_RETENTION);
  await writeJson(path.join(outputDirectory, 'validation.json'), {
    schemaVersion: 1,
    corpusHash: corpus.corpusHash,
    maximumDiscoveredOverlap: MAXIMUM_DISCOVERED_OVERLAP,
    issues: validationIssues,
    passes: validationIssues.length === 0,
  });
  await writeJson(path.join(outputDirectory, 'stability.json'), stability);
  await Bun.write(
    path.join(outputDirectory, 'review.md'),
    renderSemanticCollectionReview({ corpus, primary, replay, stability, validationIssues })
  );

  const summary = {
    outputDirectory,
    corpusHash: corpus.corpusHash,
    articleCount: corpus.items.length,
    proposalCount: primary.proposals.length,
    validationPasses: validationIssues.length === 0,
    stabilityPasses: stability.passes,
    proposals: primary.proposals.map((proposal) => ({
      proposalId: proposal.proposalId,
      origin: proposal.origin,
      title: proposal.title,
      selectedCount: proposal.selectedItems.length,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (validationIssues.length > 0 || !stability.passes) process.exitCode = 1;
  return { outputDirectory, corpus, primary, replay, validationIssues, stability };
}

if (import.meta.main) {
  await runSemanticCollectionExperiment(parseSemanticExperimentOptions(process.argv.slice(2)));
}
