import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const stories = [
  'layout-web-app-states--auth-sign-in',
  'layout-web-app-states--bookmark-selection',
  'layout-web-app-states--bookmark-empty',
  'layout-web-app-states--settings',
] as const;

for (const storyId of stories) {
  test(`storybook ${storyId}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
    await page.waitForLoadState('networkidle');

    const storyRoot = page.locator('#storybook-root');
    await expect(storyRoot).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).include('#storybook-root').analyze();
    expect(accessibility.violations).toEqual([]);

    await expect(storyRoot).toHaveScreenshot(`${storyId}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });
  });
}
