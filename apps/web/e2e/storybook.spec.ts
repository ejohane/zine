import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const stories = [
  'foundations-tokens-reference--reference',
  'layout-web-app-states--auth-sign-in',
  'layout-web-app-states--bookmark-selection',
  'layout-web-app-states--bookmark-empty',
  'layout-web-app-states--settings',
] as const;

for (const storyId of stories) {
  test(`storybook ${storyId}`, async ({ page }) => {
    // Playwright owns the Axe scan here; keep the Storybook addon in manual mode.
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story&globals=a11y.manual:!true`);
    await page.waitForLoadState('networkidle');

    const storyRoot = page.locator('#storybook-root');
    await expect(storyRoot).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).include('#storybook-root').analyze();
    expect(accessibility.violations).toEqual([]);

    await expect(storyRoot).toHaveScreenshot(`${storyId}.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.015,
    });
  });
}

for (const storyId of [
  'publications-reader--independent-issue',
  'publications-reader--weekly-issue',
  'publications-reader--publication-archive',
  'publications-reader--unavailable',
  'publications-reader--temporary-failure',
]) {
  test(`public reader accessibility ${storyId}`, async ({ page }) => {
    // Playwright owns the Axe scan here; keep the Storybook addon in manual mode.
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story&globals=a11y.manual:!true`);
    await expect(page.locator('#storybook-root .publication-reader')).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).include('#storybook-root').analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
