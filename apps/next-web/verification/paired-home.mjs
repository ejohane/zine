import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { signIn } from './sign-in.mjs';

const output = resolve('output/playwright/paired-home');
mkdirSync(output, { recursive: true });
const browser = await chromium.launchPersistentContext(
  resolve('../../.local-data/zine-next-paired-home-profile'),
  { channel: 'chrome', viewport: { width: 1024, height: 1250 }, colorScheme: 'dark' }
);
const ids = (page) =>
  page.locator('.story-card').evaluateAll((cards) => cards.map((card) => card.dataset.itemId));
try {
  const tablet = browser.pages()[0] || (await browser.newPage());
  await signIn(tablet);
  await tablet.locator('.home-feed').waitFor();
  const headings = await tablet.locator('.home-feed h2').allTextContents();
  assert.deepEqual(headings, [
    'Settle in',
    'A quick look',
    'Worth exploring',
    'Next up',
    'Worth your time',
    'The shortlist',
    'Take a closer look',
  ]);
  for (const width of [720, 1024, 1280]) {
    await tablet.setViewportSize({ width, height: 1250 });
    const pairs = await tablet
      .locator('.home-row-lead, .home-row-gallery, .home-row-digest')
      .evaluateAll((rows) =>
        rows.map((row) =>
          Array.from(row.children, (group) => {
            const rect = group.querySelector('.home-cards').getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
          })
        )
      );
    for (const [left, right] of pairs) {
      assert(left.right < right.left, `Groups overlap or stack at ${width}px`);
      assert(
        Math.abs(left.top - right.top) < 1 && Math.abs(left.bottom - right.bottom) < 1,
        `Groups misalign at ${width}px`
      );
    }
  }
  await tablet.setViewportSize({ width: 1024, height: 1250 });
  await tablet
    .locator('.home-row')
    .first()
    .locator('.story-card > img')
    .evaluateAll((images) => Promise.allSettled(images.map((image) => image.decode())));
  await tablet.screenshot({ path: resolve(output, 'tablet.png') });

  const before = await ids(tablet);
  const rowLayout = (page) =>
    page.locator('.home-row').evaluateAll((rows) =>
      rows.map((row) => ({
        layout: row.className,
        items: Array.from(row.querySelectorAll('.story-card'), (card) => [
          card.dataset.itemId,
          card.className,
        ]),
      }))
    );
  const opening = await rowLayout(tablet);
  const nextPage = tablet.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/v1/items' && url.searchParams.has('cursor') && response.ok();
  });
  await tablet.getByRole('button', { name: 'More saves', exact: true }).click();
  const next = (await (await nextPage).json()).items.map((item) => item.id);
  await tablet.waitForFunction(
    (count) => document.querySelectorAll('.story-card').length >= count,
    new Set([...before, ...next]).size
  );
  const after = await ids(tablet);
  assert.deepEqual((await rowLayout(tablet)).slice(0, opening.length), opening);
  assert.deepEqual(new Set(after), new Set([...before, ...next]));
  assert.equal(after.length, new Set(after).size);

  await tablet.locator('.home-card-tall').first().click();
  await tablet.getByRole('dialog').getByRole('heading', { name: 'Saved for you' }).waitFor();
  await tablet.getByRole('button', { name: 'Done', exact: true }).click();
  await tablet.getByRole('button', { name: 'Save a link', exact: true }).click();
  await tablet.getByRole('dialog').getByRole('heading', { name: 'Keep something good' }).waitFor();
  await tablet.getByRole('button', { name: 'Done', exact: true }).click();
  await tablet.getByRole('button', { name: 'Articles', exact: true }).click();
  await tablet.locator('[aria-label="Articles feed"] .story-card').first().waitFor();
  assert.equal(await tablet.locator('.home-row').count(), 0);

  const phoneContext = await browser.browser().newContext({
    storageState: await browser.storageState(),
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  await signIn(phone);
  const groups = phone.locator('.home-row-lead').first().locator('.home-group');
  const top = await groups.first().boundingBox();
  const bottom = await groups.last().boundingBox();
  assert(bottom.y >= top.y + top.height && Math.abs(top.x - bottom.x) < 2);
  assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone
    .locator('.home-row')
    .first()
    .locator('.story-card > img')
    .evaluateAll((images) => Promise.allSettled(images.map((image) => image.decode())));
  await phone.screenshot({ path: resolve(output, 'phone.png') });
  await phone.waitForFunction(() => !!navigator.serviceWorker.controller);
  await phoneContext.setOffline(true);
  await phone.reload();
  await phone.locator('.home-feed .story-card').first().waitFor();
  assert.equal((await ids(phone)).length, before.length);
  await phoneContext.close();
  console.log(
    JSON.stringify({
      headings,
      firstPage: before.length,
      afterPagination: after.length,
      tablet: true,
      phone: true,
      offline: true,
      filters: true,
      detail: true,
      saveForm: true,
    })
  );
} finally {
  await browser.close();
}
