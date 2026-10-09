import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const issue = '/i/01J00000000000000000000002';
const publication = '/p/01J00000000000000000000001';
test('public issue hydrates without errors, reads at desktop and phone widths', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(issue);
  await expect(page.getByRole('heading', { name: 'Thinking about cities' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute(
    'href',
    'https://example.org/essay'
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Thinking about cities · Loose Threads'
  );
  expect(
    (await new AxeBuilder({ page }).include('.publication-reader').analyze()).violations
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('issue-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await expect(page.getByRole('button', { name: 'Save to Zine' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('issue-mobile.png'), fullPage: true });
  await page.getByRole('link', { name: 'Loose Threads', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Loose Threads', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Thinking about cities' }).click();
  await expect(page.getByRole('heading', { name: 'Thinking about cities' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('full issue, archive and source links remain readable without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:45273${issue}`);
    await expect(page.getByText('Worth your time.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open original' })).toBeVisible();
    await page.goto(`http://127.0.0.1:45273${publication}`);
    await expect(page.getByRole('link', { name: 'Thinking about cities' })).toBeVisible();
  } finally {
    await context.close();
  }
});
test('missing issue returns unavailable HTML with a real 404', async ({ page }) => {
  const response = await page.goto('/i/01J00000000000000000000009');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'This publication is unavailable.' })
  ).toBeVisible();
});
