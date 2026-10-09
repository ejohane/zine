import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import catalogJson from '../../packages/shared/src/tag-classifier/catalog.json';
import { CatalogSchema, InputSchema } from '../../packages/shared/src/tag-classifier/core';
import { classify, hash } from './jev';

const cli = resolve(import.meta.dir, 'cli.ts');
function command(args: string[]) {
  return Bun.spawnSync(['bun', cli, ...args], {
    env: { PATH: process.env.PATH },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}
test('saved runs replay and evaluation resumes without an API key; unreviewed labels fail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zine-tag-cli-'));
  try {
    const catalog = CatalogSchema.parse(catalogJson);
    const input = InputSchema.parse({
      bookmarkId: 'bookmark',
      itemId: 'item',
      title: 'Planting a garden',
      description: null,
      text: 'Growing tomatoes in a garden.',
      contentType: 'ARTICLE',
      provider: 'WEB',
      publisher: null,
      creator: null,
      coverage: 'FULL_CONTENT',
      warnings: [],
    });
    const run = await classify(input, catalog, {
      apiKey: 'test',
      model: 'jev-1.13.0',
      price: 0.042,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: Object.fromEntries(
              catalog.tags.map((t) => [
                t.id,
                { type: 'noul', noul: t.id === 'gardening' ? 0.9 : 0.05 },
              ])
            ),
            usage: { input_tokens: 10000, output_tokens: 1000 },
          })
        ),
    });
    const runPath = join(directory, `${hash(input.bookmarkId)}.json`);
    await Bun.write(runPath, JSON.stringify(run));
    const replay = command(['replay', '--run', runPath, '--threshold', '0.95']);
    expect(replay.exitCode).toBe(0);
    expect(replay.stdout.toString()).toContain('below   0.9000 Gardening');
    const datasetPath = join(directory, 'dataset.json');
    const dataset = {
      version: 1,
      reviewed: true,
      cases: [{ input, expected: ['gardening'], acceptable: [] }],
    };
    await Bun.write(datasetPath, JSON.stringify(dataset));
    const evaluation = command(['eval', '--dataset', datasetPath, '--out', directory]);
    expect(evaluation.exitCode).toBe(0);
    const report = await Bun.file(join(directory, 'report-0.8.json')).json();
    expect(report.precision).toBe(1);
    expect(report.recall).toBe(1);
    expect(report.meetsInitialTarget).toBe(false);
    const changed = command([
      'report',
      '--dataset',
      datasetPath,
      '--runs',
      directory,
      '--threshold',
      '0.95',
    ]);
    expect(changed.exitCode).toBe(0);
    const strict = await Bun.file(join(directory, 'report-0.95.json')).json();
    expect(strict.precision).toBeNull();
    expect(strict.recall).toBe(0);
    await Bun.write(datasetPath, JSON.stringify({ ...dataset, reviewed: false }));
    expect(command(['eval', '--dataset', datasetPath, '--out', directory]).exitCode).toBe(1);
    await Bun.write(
      datasetPath,
      JSON.stringify({
        ...dataset,
        cases: [{ input: { ...input, text: 'Changed' }, expected: ['gardening'] }],
      })
    );
    expect(
      command(['report', '--dataset', datasetPath, '--runs', directory]).stderr.toString()
    ).toContain('differs from saved run');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
