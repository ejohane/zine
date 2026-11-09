import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
const session = await realSession();
const examples: {
  itemId: string;
  coverage: string;
  model: string;
  inputCount: number;
  sourceChunkCount: number;
  summarySha256: string;
  summaryLength: number;
  source: string;
}[] = [];
const privateExamples: unknown[] = [];
try {
  let cursor: string | null = null;
  do {
    const response = await fetch(
      `https://api-next.myzine.app/v1/items?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { headers: { authorization: `Bearer ${await session.getToken()}` } }
    );
    if (!response.ok) throw new Error(`Browse failed (${response.status})`);
    const page = JSON.parse(await response.text());
    for (const item of page.items) {
      const provenance = item.enrichment.fields.summary?.provenance;
      if (provenance?.method !== 'zine-understanding-v1') continue;
      const metadata = provenance.coverage ? provenance : JSON.parse(provenance.description);
      examples.push({
        itemId: item.id,
        coverage: metadata.coverage,
        model: metadata.model,
        inputCount: provenance.inputContributionIds.length,
        sourceChunkCount: metadata.sourceChunkCount,
        summarySha256: createHash('sha256').update(item.content.summary).digest('hex'),
        summaryLength: item.content.summary.length,
        source: item.content.platform,
      });
      if (privateExamples.length < 6)
        privateExamples.push({
          title: item.content.title,
          summary: item.content.summary,
          coverage: metadata.coverage,
          topics: item.content.topics,
        });
    }
    cursor = page.nextCursor;
  } while (cursor);
  await writeFile(
    '.local-data/generated-quality-samples.json',
    JSON.stringify(privateExamples, null, 2),
    { mode: 0o600 }
  );
  const report = {
    at: new Date().toISOString(),
    origin: 'https://api-next.myzine.app',
    modelExecution: 'actual Cloudflare Workers AI',
    count: examples.length,
    examples,
  };
  await writeFile('evidence/generated-understanding.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      count: examples.length,
      coverages: [...new Set(examples.map((value) => value.coverage))],
      allHaveInputReferences: examples.every((value) => value.inputCount > 0),
    })
  );
  if (!examples.length) process.exitCode = 1;
} finally {
  await session.close();
}
