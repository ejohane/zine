import { expect, test } from '@playwright/test';

import { mockWebTrpc } from './trpc-mocks';

test('loads the bookmarks desk, filters content, opens detail, and navigates to settings', async ({
  page,
}) => {
  await mockWebTrpc(page);

  await page.goto('/bookmarks');

  await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
  await expect(page.getByText('Stable component APIs')).toBeVisible();
  await expect(page.getByText('Design systems at scale')).toBeVisible();
  await expect(page.getByText('Product taste and pacing')).toBeVisible();

  await page.getByRole('button', { name: 'Videos' }).click();
  await expect(page.getByText('Stable component APIs')).toHaveCount(0);
  await expect(page.getByText('Design systems at scale')).toBeVisible();

  await page.getByRole('button', { name: /Design systems at scale/ }).click();
  await expect(page).toHaveURL(/\/bookmarks\/video-1\?contentType=video$/);
  await expect(page.getByRole('heading', { name: 'Design systems at scale' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in YouTube' })).toHaveAttribute(
    'href',
    'https://zine.example/watch/design-systems-at-scale'
  );

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subscriptions' })).toBeVisible();
});

test('renders the empty state when no bookmarks exist', async ({ page }) => {
  await mockWebTrpc(page, 'empty');

  await page.goto('/bookmarks');

  await expect(
    page.getByRole('heading', { name: /No bookmarks yet|Add your first bookmark/ })
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(
      /Save a few items first, then this desk becomes the main web surface for browsing them\.|Add a bookmark to start building your library\./
    )
  ).toBeVisible();
});

test('uses a phone drill-in flow and keeps mobile chrome usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWebTrpc(page);

  await page.goto('/bookmarks');

  const listPane = page.locator('.new-page-column-card').first();

  await expect(
    page.getByText('Pick something from the list and its detail view will open here.')
  ).toHaveCount(0);
  await expect(listPane).toBeVisible();

  const listPaneBorderRadius = await listPane.evaluate((element) => {
    return window.getComputedStyle(element).borderRadius;
  });
  expect(listPaneBorderRadius).toBe('0px');

  const listPaneRect = await listPane.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      height: rect.height,
    };
  });
  expect(listPaneRect.x).toBeLessThanOrEqual(1);
  expect(listPaneRect.y).toBeLessThanOrEqual(1);

  const pageFitsViewport = await page.evaluate(() => {
    return document.documentElement.scrollHeight <= window.innerHeight + 1;
  });
  expect(pageFitsViewport).toBe(true);

  await page.getByRole('button', { name: /Design systems at scale/ }).click();

  await expect(page).toHaveURL(/\/bookmarks\/video-1$/);
  await expect(page.getByRole('heading', { name: 'Design systems at scale' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to bookmarks list' })).toBeVisible();
  await expect(page.getByText('Stable component APIs')).toHaveCount(0);

  const detailActionsLayout = await page
    .locator('.new-page-bookmark-view__actions')
    .evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        flexDirection: styles.flexDirection,
        alignItems: styles.alignItems,
      };
    });
  expect(detailActionsLayout.flexDirection).toBe('row');
  expect(detailActionsLayout.alignItems).toBe('center');

  const providerFab = await page.locator('.new-page-bookmark-view__fab').evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      width: styles.width,
      height: styles.height,
      borderRadius: styles.borderRadius,
    };
  });
  expect(providerFab.width).toBe(providerFab.height);
  expect(parseFloat(providerFab.borderRadius)).toBeGreaterThanOrEqual(999);

  const descriptionSection = await page
    .locator('.new-page-bookmark-view__section')
    .evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        paddingLeft: styles.paddingLeft,
      };
    });
  expect(descriptionSection.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(parseFloat(descriptionSection.paddingLeft)).toBeGreaterThanOrEqual(0);

  await page.getByRole('button', { name: 'Back to bookmarks list' }).click();

  await expect(page).toHaveURL(/\/bookmarks$/);
  await expect(page.getByText('Stable component APIs')).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole('heading', { name: 'Settings are pared back in this web pass.' })
  ).toBeVisible();
});

test('shows a bottom tab bar on phone viewports and hides the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWebTrpc(page);

  await page.goto('/bookmarks');
  await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();

  const tabBar = page.getByRole('navigation', { name: 'Tab bar' });
  await expect(tabBar).toBeVisible();

  const sidebar = page.locator('.new-page-sidebar');
  await expect(sidebar).toBeHidden();

  const bookmarksTab = page.getByRole('link', { name: 'Bookmarks' }).locator('visible=true');
  await expect(bookmarksTab).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('renders post detail like the mobile app on phone viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWebTrpc(page);

  await page.goto('/bookmarks');
  await page.getByRole('button', { name: /Notes on interface pace/ }).click();

  await expect(page).toHaveURL(/\/bookmarks\/post-1$/);
  await expect(page.locator('[aria-label="X post content"]')).toBeVisible();
  await expect(page.getByText('Notes on interface pace')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notes on interface pace' })).toHaveCount(0);
  await expect(page.locator('.new-page-bookmark-view__section')).toHaveCount(0);
  await expect(page.locator('.new-page-bookmark-view__hero')).toHaveCount(0);

  const postRowDisplay = await page
    .locator('.new-page-bookmark-view__post-row')
    .evaluate((element) => {
      return window.getComputedStyle(element).display;
    });
  expect(postRowDisplay).toBe('flex');
});

test('renders the error state when the bookmarks query fails', async ({ page }) => {
  await mockWebTrpc(page, 'error');

  await page.goto('/bookmarks');

  await expect(page.getByRole('heading', { name: 'Could not load bookmarks' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Could not load bookmarks from the mock API.')).toBeVisible();
});
