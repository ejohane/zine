import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { signIn } from './sign-in.mjs';
const context = await chromium.launchPersistentContext(
  resolve('../../.local-data/zine-next-connected-profile'),
  { channel: 'chrome', headless: false, viewport: { width: 1024, height: 768 } }
);
const page = context.pages()[0] || (await context.newPage());
try {
  await signIn(page);
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/v1/items' &&
      new URL(r.url()).searchParams.get('type') === 'article'
  );
  await page.getByRole('button', { name: 'Articles', exact: true }).click();
  await response;
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent === 'Refresh' && !b.disabled)
  );
  const candidates = await page.evaluate(async () => {
    const response = await fetch('/v1/items?type=article&limit=30', {
      headers: { authorization: 'Bearer ' + (await window.Clerk.session.getToken()) },
    });
    const value = await response.json();
    return value.items.filter((i) => i.enrichment.fields.article).map((i) => i.id);
  });
  if (!candidates.length)
    throw Error('No retained article available in the first real article page');
  await page.locator(`[data-item-id="${candidates[0]}"]`).click();
  await page.getByRole('button', { name: 'Read saved text', exact: true }).click();
  await page.locator('.retained-copy').waitFor();
  const text = await page.locator('.retained-copy').textContent();
  if (text.length < 50) throw Error('Retained article text missing');
  await page.screenshot({ path: 'output/playwright/connected/reader.png' });
  await context.setOffline(true);
  const cold = await context.newPage();
  await cold.goto('https://api-next.myzine.app/next/#item=' + candidates[0]);
  await cold.getByRole('button', { name: 'Read saved text', exact: true }).click();
  await cold.locator('.retained-copy').waitFor();
  if ((await cold.locator('.retained-copy').textContent()) !== text)
    throw Error('Offline retained text differs');
  await cold.screenshot({ path: 'output/playwright/connected/reader-offline.png' });
  await context.setOffline(false);
  writeFileSync(
    'output/playwright/connected/reading.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        realRetainedArticle: true,
        characters: text.length,
        sha256: createHash('sha256').update(text).digest('hex'),
        coldOfflineTextMatches: true,
        mutatedExistingItem: false,
      },
      null,
      2
    )
  );
  console.log('Real retained article and identical cold-offline text verified.');
} finally {
  await context.close();
}
