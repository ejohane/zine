import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  POLICY_VERSION,
  CatalogSchema,
  DatasetSchema,
  RunSchema,
  evaluateCase,
  selectTags,
  type ClassificationRun,
} from '../../packages/shared/src/tag-classifier/core';
import { classify, hash } from './jev';
import { openLocal } from './local';

const HELP = `Read-only local bookmark topic classification
bun run tags:cli -- list
bun run tags:cli -- inspect --bookmark ID [--out FILE]
bun run tags:cli -- classify --bookmark ID [--out FILE]
bun run tags:cli -- replay --run FILE [--threshold 0.8]
bun run tags:cli -- dataset --bookmarks ID,ID,... --out FILE
bun run tags:cli -- eval --dataset FILE --out DIRECTORY
bun run tags:cli -- report --dataset FILE --runs DIRECTORY [--threshold 0.8]
Options: --state DIRECTORY --user USER_ID --catalog FILE --model jev-1.13.0
         --price 0.042 --threshold 0.8
classify/eval send content to TypeSafe using TYPESAFE_API_KEY. No database writes.
Dataset export creates unlabeled cases; fill expected/acceptable before eval.
Local outputs contain bookmark text: keep them under gitignored .local-data.`;
async function save(path: string, value: unknown) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await Bun.write(path, JSON.stringify(value, null, 2) + '\n');
}
function display(run: ClassificationRun, threshold: number) {
  const selected = new Set(selectTags(run.probabilities, threshold));
  console.log(
    `${run.input.title}\nEvidence: ${run.input.coverage}; warnings: ${run.input.warnings.join(', ') || 'none'}\nModel: ${run.model}; catalog: ${run.catalog.version}; policy: ${run.policyVersion}; threshold: ${threshold}\nLatency: ${run.latencyMs}ms; tokens: ${run.usage.input_tokens} in / ${run.usage.output_tokens} out; estimated cost: $${run.estimatedCostUsd.toFixed(6)}`
  );
  for (const tag of [...run.catalog.tags].sort(
    (a, b) => run.probabilities[b.id] - run.probabilities[a.id] || a.id.localeCompare(b.id)
  ))
    console.log(
      `${selected.has(tag.id) ? 'suggest' : 'below  '} ${run.probabilities[tag.id].toFixed(4)} ${tag.name} (${tag.id})`
    );
}
export async function main(args: string[]) {
  const command = args.shift();
  if (!command || command === 'help' || command === '--help') {
    console.log(HELP);
    return;
  }
  const flags = new Map<string, string>();
  const allowed = new Set([
    '--bookmark',
    '--bookmarks',
    '--out',
    '--run',
    '--runs',
    '--dataset',
    '--threshold',
    '--state',
    '--user',
    '--catalog',
    '--model',
    '--price',
  ]);
  while (args.length) {
    const key = args.shift()!;
    const value = args.shift();
    if (!allowed.has(key) || !value || value.startsWith('--') || flags.has(key))
      throw new Error(`Invalid option ${key}. Use help.`);
    flags.set(key, value);
  }
  const required = (key: string) => {
    const value = flags.get(key);
    if (!value) throw new Error(`Missing ${key}. Use help.`);
    return value;
  };
  const threshold = Number(flags.get('--threshold') ?? '0.8');
  selectTags({}, threshold);
  const catalog = CatalogSchema.parse(
    await Bun.file(
      flags.get('--catalog') ??
        resolve(import.meta.dir, '../../packages/shared/src/tag-classifier/catalog.json')
    ).json()
  );
  const options = {
    apiKey: process.env.TYPESAFE_API_KEY,
    model: flags.get('--model') ?? 'jev-1.13.0',
    price: Number(flags.get('--price') ?? '0.042'),
  };
  if (!Number.isFinite(options.price) || options.price < 0)
    throw new Error('Price must be a nonnegative number.');
  if (command === 'replay') {
    display(RunSchema.parse(await Bun.file(required('--run')).json()), threshold);
    return;
  }
  if (command === 'eval' || command === 'report') {
    const dataset = DatasetSchema.parse(await Bun.file(required('--dataset')).json());
    const ids = new Set(catalog.tags.map((t) => t.id));
    if (new Set(dataset.cases.map((c) => c.input.bookmarkId)).size !== dataset.cases.length)
      throw new Error('Dataset has duplicate bookmarks.');
    for (const c of dataset.cases)
      for (const id of [...c.expected, ...c.acceptable])
        if (!ids.has(id)) throw new Error(`Unknown labeled tag ${id}.`);
    const directory = command === 'eval' ? required('--out') : required('--runs');
    let reportPolicy: number | undefined;
    const rows: Array<{ bookmarkId: string; title: string } & ReturnType<typeof evaluateCase>> = [];
    for (const c of dataset.cases) {
      const path = join(directory, `${hash(c.input.bookmarkId)}.json`);
      let run: ClassificationRun;
      if (command === 'eval' && !existsSync(path)) {
        run = await classify(c.input, catalog, options);
        await save(path, run);
      } else {
        run = RunSchema.parse(await Bun.file(path).json());
      }
      if (
        run.inputHash !== hash(c.input) ||
        run.inputHash !== hash(run.input) ||
        run.catalogHash !== hash(catalog) ||
        run.catalogHash !== hash(run.catalog) ||
        (command === 'eval' && run.policyVersion !== POLICY_VERSION) ||
        (command === 'eval' && run.requestedModel !== options.model)
      )
        throw new Error('Dataset input or catalog differs from saved run; classify again.');
      if (reportPolicy !== undefined && reportPolicy !== run.policyVersion)
        throw new Error('Saved runs mix classification policies; use separate run directories.');
      reportPolicy = run.policyVersion;
      rows.push({
        bookmarkId: c.input.bookmarkId,
        title: c.input.title,
        ...evaluateCase(selectTags(run.probabilities, threshold), c.expected, c.acceptable),
      });
    }
    const sum = (key: 'suggested' | 'useful' | 'expected' | 'recovered') =>
      rows.reduce((n, r) => n + r[key], 0);
    const precision = sum('suggested') ? sum('useful') / sum('suggested') : null;
    const recall = sum('expected') ? sum('recovered') / sum('expected') : null;
    const report = {
      version: 1,
      policyVersion: reportPolicy,
      datasetHash: hash(dataset),
      catalogHash: hash(catalog),
      threshold,
      cases: rows.length,
      precision,
      recall,
      meetsInitialTarget:
        rows.length >= 20 &&
        precision !== null &&
        recall !== null &&
        precision >= 0.9 &&
        recall >= 0.8,
      rows,
    };
    await save(join(directory, `report-${threshold}.json`), report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (!['list', 'inspect', 'classify', 'dataset'].includes(command))
    throw new Error('Unknown command. Use help.');
  const local = await openLocal(
    flags.get('--state') ?? resolve(import.meta.dir, '../../apps/worker/.wrangler/state'),
    flags.get('--user')
  );
  try {
    if (command === 'list') {
      console.log(JSON.stringify(local.list(), null, 2));
      return;
    }
    if (command === 'dataset') {
      const cases = [];
      for (const id of required('--bookmarks').split(','))
        cases.push({ input: await local.load(id), expected: [], acceptable: [] });
      await save(required('--out'), { version: 1, reviewed: false, cases });
      console.log(
        'Dataset exported. Label expected and acceptable tags, then set reviewed=true before calling eval.'
      );
      return;
    }
    const input = await local.load(required('--bookmark'));
    if (command === 'inspect') {
      console.log(JSON.stringify(input, null, 2));
      if (flags.has('--out')) await save(required('--out'), input);
      return;
    }
    const run = await classify(input, catalog, options);
    const path =
      flags.get('--out') ??
      resolve(
        import.meta.dir,
        `../../.local-data/tag-classifier/${hash(input.bookmarkId)}-${Date.now()}.json`
      );
    await save(path, run);
    display(run, threshold);
    console.log(`Saved: ${path}`);
  } finally {
    await local.close();
  }
}
if (import.meta.main)
  main(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'))).catch(
    (error) => {
      console.error(error instanceof Error ? error.message : 'CLI failed.');
      process.exitCode = 1;
    }
  );
