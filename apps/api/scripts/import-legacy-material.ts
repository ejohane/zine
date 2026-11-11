/** Import verified legacy article material through the owner-authenticated Next API. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodeJwt } from 'jose';
import { parseHTML } from 'linkedom';
import { realSession } from './clerk-session';
import type { ContributionInput } from '../src/enrichment';

const owner = 'user_31ejjz59G6mTX1SIyErOi0fwu4A';
const [directory, planFile, mode, limitInput, ...extra] = process.argv.slice(2);
const limit = limitInput ? Number(limitInput) : 0;
assert.ok(directory && planFile && !extra.length);
assert.ok(
  (!mode && !limitInput) ||
    (['--apply', '--verify'].includes(mode) && Number.isSafeInteger(limit) && limit > 0)
);
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const [sourceManifestBytes, sourceItems, plan, material] = await Promise.all([
  readFile(resolve(directory, 'manifest.json')),
  readFile(resolve(directory, 'items.json')),
  readFile(planFile, 'utf8'),
  readFile(resolve(directory, 'material/manifest.json'), 'utf8'),
]);
const sourceManifest = JSON.parse(sourceManifestBytes.toString());
const capturePlan = JSON.parse(plan) as {
  owner: string;
  sourceManifestSha256: string;
  plan: { itemId: string; legacyIds: string[]; action: string }[];
};
type Material = {
  id: string;
  itemId: string;
  sourceHash: string | null;
  current: boolean;
  status: 'verified' | 'missing';
  file?: string;
  sha256?: string;
  bytes?: number;
};
const articles = JSON.parse(material) as { owner: string; results: Material[] };
assert.equal(sourceManifest.owner, owner);
assert.equal(capturePlan.owner, owner);
assert.equal(articles.owner, owner);
assert.equal(capturePlan.sourceManifestSha256, sha256(sourceManifestBytes));
assert.equal(sourceManifest.sections.items.sha256, sha256(sourceItems));
const items = JSON.parse(sourceItems.toString()) as {
  id: string;
  item_id: string;
  canonical_url: string;
}[];
const byLegacyId = new Map(items.map((item) => [item.id, item]));
const targetByContent = new Map<string, { itemId: string; url: string; priorImport: boolean }>();
for (const group of capturePlan.plan) {
  if (['review-identity', 'preserve-next-deletion'].includes(group.action)) continue;
  for (const id of group.legacyIds) {
    const row = byLegacyId.get(id);
    assert.ok(row);
    const existing = targetByContent.get(row.item_id);
    assert.ok(!existing || existing.itemId === group.itemId);
    targetByContent.set(row.item_id, {
      itemId: group.itemId,
      url: row.canonical_url,
      priorImport: group.action === 'attach-historical-records',
    });
  }
}
const targetHasCurrent = new Set(
  articles.results
    .filter((row) => row.current && row.status === 'verified')
    .map((row) => targetByContent.get(row.itemId)?.itemId)
);
const ordered = articles.results
  .filter((row) => row.status === 'verified')
  .sort(
    (a, b) =>
      Number(Boolean(targetByContent.get(b.itemId)?.priorImport)) -
        Number(Boolean(targetByContent.get(a.itemId)?.priorImport)) ||
      Number(b.current) - Number(a.current) ||
      Number(Boolean(b.sourceHash)) - Number(Boolean(a.sourceHash))
  );
if (!mode) {
  console.log(
    JSON.stringify({
      mode: 'dry-run',
      verifiedSourceObjects: ordered.length,
      missingSourceObjects: articles.results.length - ordered.length,
      mappedSourceObjects: ordered.filter((row) => targetByContent.has(row.itemId)).length,
    })
  );
} else {
  const session = await realSession();
  let imported = 0;
  let alreadyRetained = 0;
  let absentTarget = 0;
  const methods = [
    'legacy-library-article',
    'legacy-library-article-version',
    'legacy-library-html-version',
  ];
  try {
    assert.equal(decodeJwt(await session.getToken()).sub, owner);
    const origin = 'https://api-next.myzine.app';
    const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const call = async (path: string, body?: unknown): Promise<Response> => {
      for (let attempt = 0; ; attempt++) {
        let response: Response;
        try {
          response = await fetch(origin + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
              authorization: 'Bearer ' + (await session.getToken()),
              'content-type': 'application/json',
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
            redirect: 'error',
          });
        } catch (error) {
          if (body !== undefined || attempt >= 5) throw error;
          await wait(1000 * 2 ** attempt);
          continue;
        }
        if (attempt >= 5) return response;
        if (response.status === 429) {
          const retry = Number(response.headers.get('retry-after'));
          if (!Number.isFinite(retry) || retry < 1 || retry > 60) return response;
          await wait(retry * 1000);
        } else if (body === undefined && response.status >= 500) {
          await wait(1000 * 2 ** attempt);
        } else return response;
      }
    };
    const retained = async (path: string, digest: string, response?: Response) => {
      const found = response ?? (await call(path));
      assert.equal(found.status, 200);
      const { contributions } = (await found.json()) as {
        contributions: { id: string; provenance: { method: string; inputDigest?: string } }[];
      };
      return contributions.find(
        (entry) =>
          methods.includes(entry.provenance.method) && entry.provenance.inputDigest === digest
      );
    };
    for (const row of ordered) {
      if ((mode === '--verify' ? alreadyRetained : imported) >= limit) break;
      const target = targetByContent.get(row.itemId);
      if (!target) {
        absentTarget++;
        continue;
      }
      const path = '/v1/items/' + encodeURIComponent(target.itemId) + '/enrichment';
      const list = await call(path);
      if (list.status === 404) {
        absentTarget++;
        continue;
      }
      assert.equal(list.status, 200);
      assert.ok(row.file && /^(version|legacy)-[0-9A-HJKMNP-TV-Z]{26}$/i.test(row.file));
      const bytes = await readFile(resolve(directory, 'material', row.file));
      const digest = sha256(bytes);
      assert.equal(digest, row.sha256);
      const raw = bytes.toString();
      const artifact = row.sourceHash ? JSON.parse(raw) : null;
      if (artifact)
        assert.ok(artifact.itemId === row.itemId && artifact.contentHash === row.sourceHash);
      const preferred = row.current || (!row.sourceHash && !targetHasCurrent.has(target.itemId));
      const text =
        artifact?.plainText ??
        parseHTML('<html><body>' + raw + '</body></html>').document.body.textContent?.trim();
      const values = {
        article: { text, coverage: 'unknown' },
        structuredData: { legacyArticle: artifact ?? { html: raw } },
      };
      const prior = await retained(path, digest, list);
      let contributionId = prior?.id;
      if (!contributionId) {
        assert.equal(mode, '--apply', 'An expected retained artifact is missing');
        const field = preferred && text ? 'article' : 'structuredData';
        const method = field === 'article' ? methods[0] : row.sourceHash ? methods[1] : methods[2];
        const input: ContributionInput = {
          field,
          value: values[field],
          category: 'source',
          provenance: {
            method,
            inputDigest: digest,
            sourceUrl: target.url,
            coverage: 'article',
            sourceCoverage: 'unknown',
            inputContributionIds: [],
          },
        };
        for (let attempt = 0; attempt < 5 && !contributionId; attempt++) {
          const saved = await call(path, input).catch(() => undefined);
          if (saved?.status === 201) {
            contributionId = ((await saved.json()) as { id: string }).id;
          } else {
            if (saved && saved.status < 500) assert.equal(saved.status, 201);
            // A response may be lost after the contribution committed.
            await wait(1000 * 2 ** attempt);
            contributionId = (await retained(path, digest))?.id;
          }
        }
        assert.ok(contributionId, 'Retained material did not converge after retry');
        imported++;
      } else alreadyRetained++;
      const readback = await call(path + '/' + encodeURIComponent(contributionId));
      assert.equal(readback.status, 200);
      const found = (await readback.json()) as {
        provenance: { inputDigest: string };
        field: keyof typeof values;
        value: unknown;
      };
      assert.equal(found.provenance.inputDigest, digest);
      assert.ok(Object.hasOwn(values, found.field));
      assert.equal(
        sha256(Buffer.from(JSON.stringify(found.value))),
        sha256(Buffer.from(JSON.stringify(values[found.field])))
      );
      if (mode === '--apply') await wait(100);
    }
    console.log(
      JSON.stringify({
        mode: mode === '--verify' ? 'readback' : 'apply-and-readback',
        imported,
        alreadyRetained,
        absentTarget,
      })
    );
  } finally {
    await session.close();
  }
}
