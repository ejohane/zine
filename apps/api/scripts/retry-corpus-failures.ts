import { readFile, writeFile } from 'node:fs/promises';
import { realSession } from './clerk-session';
const mapping = JSON.parse(await readFile('.local-data/remote-library-mapping.json', 'utf8')) as {
  itemId: string;
  provider: string;
}[];
const session = await realSession();
const retries: { provider: string; httpStatus: number; requestId: string | null; jobId: string }[] =
  [];
try {
  for (const item of mapping) {
    const response = await fetch(`https://api-next.myzine.app/v1/items/${item.itemId}/jobs`, {
      headers: { authorization: `Bearer ${await session.getToken()}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Job inspection failed (${response.status})`);
    const value = JSON.parse(await response.text());
    for (const job of value.jobs.filter(
      (job: { kind: string; status: string; errorCode: string }) =>
        job.kind === 'enrich' &&
        job.status === 'failed' &&
        ['provider_http_500', 'rate_limited', 'youtube_metadata_unavailable'].includes(
          job.errorCode
        )
    )) {
      const retry = await fetch(`https://api-next.myzine.app/v1/jobs/${job.id}/retry`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await session.getToken()}` },
        signal: AbortSignal.timeout(30000),
      });
      retries.push({
        provider: item.provider,
        httpStatus: retry.status,
        requestId: retry.headers.get('x-request-id'),
        jobId: job.id,
      });
      if (retry.status !== 202) throw new Error(`Job retry failed (${retry.status})`);
    }
  }
  await writeFile(
    'evidence/corpus-recovery.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        origin: 'https://api-next.myzine.app',
        scope:
          'Real Clerk-authenticated retries of transient original-corpus failures; completion must be checked separately',
        retries,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    JSON.stringify({
      retried: retries.length,
      byProvider: Object.fromEntries(
        [...new Set(retries.map((row) => row.provider))].map((provider) => [
          provider,
          retries.filter((row) => row.provider === provider).length,
        ])
      ),
    })
  );
} finally {
  await session.close();
}
