import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { realSession } from './clerk-session';
const session = await realSession();
const itemId = 'itm_8b9295d7a68225abfe7b803b7520aef6c494cd2b';
const observations: unknown[] = [];
async function call(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(`https://api-next.myzine.app${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await session.getToken()}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const value = await r.json();
  observations.push({
    path,
    method,
    status: r.status,
    requestId: r.headers.get('x-request-id'),
    responseSha256: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  });
  assert.ok(r.ok, `Transcript retrieval ${r.status}`);
  return value;
}
try {
  const transcript = (await call(`/v1/items/${itemId}/transcript`)) as {
    value: { segments: { text: string; startSeconds?: number }[] };
  };
  const segment = transcript.value.segments.find(
    (s) => s.startSeconds !== undefined && s.startSeconds > 300 && /[a-zA-Z]{13,}/.test(s.text)
  );
  assert.ok(segment);
  const query = segment.text.match(/[a-zA-Z]{13,}/)![0];
  const jobs = (await call(`/v1/items/${itemId}/jobs`)) as {
    jobs: { id: string; kind: string; status: string }[];
  };
  const pendingIndex = jobs.jobs.find((j) => j.kind === 'index' && j.status === 'pending');
  if (pendingIndex) await call(`/v1/jobs/${pendingIndex.id}/retry`, 'POST');
  const result = (await call('/v1/items/search', 'POST', {
    query,
    match: 'keyword',
    filters: { subscriptionIds: ['sub_f3a57d8b2bbc4e10bf7e88d2658a78ae'] },
    limit: 10,
  })) as { items: { id: string; matches: { field: string; startSeconds?: number }[] }[] };
  const item = result.items.find((i) => i.id === itemId);
  assert.ok(item);
  const matches = item.matches.filter(
    (m) => m.field === 'transcript' && typeof m.startSeconds === 'number'
  );
  assert.ok(matches.length);
  const details = (await call(`/v1/items/${itemId}`)) as {
    enrichment: {
      fields: { summary?: { provenance: { coverage?: string; inputContributionIds: string[] } } };
    };
  };
  assert.equal(details.enrichment.fields.summary?.provenance.coverage, 'transcript');
  assert.ok(details.enrichment.fields.summary.provenance.inputContributionIds.length > 0);
  const report = {
    at: new Date().toISOString(),
    origin: 'https://api-next.myzine.app',
    authentication: 'real Clerk session',
    scope:
      'Keyword retrieval within the actual podcast subscription; source transcript and generated summary provenance checked separately from broader corpus ranking',
    querySha256: createHash('sha256').update(query).digest('hex'),
    timestampedMatches: matches.map((m) => ({ field: m.field, startSeconds: m.startSeconds })),
    summaryCoverage: 'transcript',
    observations,
  };
  await writeFile('evidence/transcript-retrieval.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      timestampedMatches: matches.length,
      summaryCoverage: 'transcript',
      expeditedExistingIndexJob: !!pendingIndex,
    })
  );
} finally {
  await session.close();
}
