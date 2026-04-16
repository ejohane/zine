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

  await expect(
    page.getByText('Pick something from the list and its detail view will open here.')
  ).toHaveCount(0);

  await page.getByRole('button', { name: /Design systems at scale/ }).click();

  await expect(page).toHaveURL(/\/bookmarks\/video-1$/);
  await expect(page.getByRole('heading', { name: 'Design systems at scale' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to bookmarks list' })).toBeVisible();
  await expect(page.getByText('Stable component APIs')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back to bookmarks list' }).click();

  await expect(page).toHaveURL(/\/bookmarks$/);
  await expect(page.getByText('Stable component APIs')).toBeVisible();

  await page.getByRole('button', { name: 'Add bookmark' }).click();
  await expect(page.getByRole('heading', { name: 'Add bookmark' })).toBeVisible();

  const dialogBox = await page.locator('.dialog-content').boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeLessThanOrEqual(8);
  expect(dialogBox!.width).toBeGreaterThan(360);

  await page.getByRole('button', { name: 'Close add bookmark dialog' }).click();
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

test('renders the error state when the bookmarks query fails', async ({ page }) => {
  await mockWebTrpc(page, 'error');

  await page.goto('/bookmarks');

  await expect(page.getByRole('heading', { name: 'Could not load bookmarks' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Could not load bookmarks from the mock API.')).toBeVisible();
});
