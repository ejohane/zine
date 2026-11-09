import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';
const session = await realSession();
try {
  const headers = { authorization: `Bearer ${await session.getToken()}` };
  const r = await fetch(
    'https://api-next.myzine.app/v1/items/itm_8b9295d7a68225abfe7b803b7520aef6c494cd2b?include=transcript',
    { headers }
  );
  assert.ok(r.ok);
  const item = (await r.json()) as {
    content: {
      summary: string;
      topics: string[];
      transcript: { segments: { text: string; startSeconds?: number }[] };
    };
    enrichment: { fields: { summary: { provenance: unknown } } };
  };
  const sample = {
    summary: item.content.summary,
    topics: item.content.topics,
    provenance: item.enrichment.fields.summary.provenance,
    sourceExamples: item.content.transcript.segments
      .filter((s) => /charter|accountability|debt|boundar|Aerocore|Aerocore|Noblis/i.test(s.text))
      .slice(0, 12),
  };
  await writeFile(
    '.local-data/podcast-understanding-review.json',
    JSON.stringify(sample, null, 2),
    { mode: 0o600 }
  );
  console.log(JSON.stringify(sample));
} finally {
  await session.close();
}
