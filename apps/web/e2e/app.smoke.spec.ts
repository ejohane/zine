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
  await expect(
    page.getByRole('heading', { name: 'Settings are pared back in this web pass.' })
  ).toBeVisible();
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

test('renders the error state when the bookmarks query fails', async ({ page }) => {
  await mockWebTrpc(page, 'error');

  await page.goto('/bookmarks');

  await expect(page.getByRole('heading', { name: 'Could not load bookmarks' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Could not load bookmarks from the mock API.')).toBeVisible();
});
