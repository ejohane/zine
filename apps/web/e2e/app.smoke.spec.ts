import { expect, test } from '@playwright/test';

import { mockWebTrpc } from './trpc-mocks';

test('loads the mobile-parity app routes and opens canonical detail', async ({ page }) => {
  await mockWebTrpc(page);

  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Jump Back In' })).toBeVisible();
  await expect(page.getByText('Design systems at scale').first()).toBeVisible();

  await page.getByRole('link', { name: 'Inbox' }).first().click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole('button', { name: 'Save' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Search' }).first().click();
  await expect(page).toHaveURL(/\/search$/);
  await page.getByLabel('Search your library').fill('design');
  await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
  await page
    .getByRole('link', { name: /Design systems at scale/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/item\/video-1$/);
  await expect(page.getByRole('heading', { name: 'Design systems at scale' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in YouTube' })).toHaveAttribute(
    'href',
    'https://zine.example/watch/design-systems-at-scale'
  );

  await page.getByRole('link', { name: 'Library' }).first().click();
  await expect(page).toHaveURL(/\/library\/bookmarks$/);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

  await page.getByRole('button', { name: /Stable component APIs/ }).click();
  await expect(page).toHaveURL(/\/item\/article-1$/);
  await expect(page.getByText('About this article')).toBeVisible();
  await expect(
    page.getByText('Extracted article text begins here, in the same reading flow as Zine for iOS.')
  ).toBeVisible();

  const aboutBox = await page.locator('.new-page-bookmark-view__about').boundingBox();
  const actionsBox = await page.locator('.new-page-bookmark-view__actions').boundingBox();
  const articleBox = await page.locator('.new-page-bookmark-view__article').boundingBox();
  expect(aboutBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(articleBox).not.toBeNull();
  expect(aboutBox!.y).toBeLessThan(actionsBox!.y);
  expect(articleBox!.y).toBeGreaterThan(actionsBox!.y);

  const reader = page.locator('.new-page-bookmark-view');
  const readerScrollPosition = await reader.evaluate((element) => {
    element.scrollTop = Math.min(240, element.scrollHeight - element.clientHeight);
    return element.scrollTop;
  });
  expect(readerScrollPosition).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Open immersive reader' }).click();
  await expect(page.locator('.new-page-screen')).toHaveClass(/new-page-screen--reader-expanded/);
  await expect(page.locator('.new-page-sidebar')).toHaveCount(0);
  await expect(page.locator('.new-page-column-card__header--library')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exit immersive reader' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBe(readerScrollPosition);

  const readerToolbar = page.getByRole('toolbar', { name: 'Reader controls' });
  await reader.evaluate((element) => {
    element.scrollTop = Math.min(720, element.scrollHeight - element.clientHeight);
  });
  await expect(readerToolbar).toHaveClass(/workbench-readerbar--article-pinned/);
  await expect(readerToolbar.getByText('Stable component APIs')).toBeVisible();
  await expect(readerToolbar.getByText('Zine Editorial')).toBeVisible();
  await expect(readerToolbar.getByText('8 min read')).toBeVisible();
  await expect(readerToolbar.getByRole('group', { name: 'Pinned bookmark actions' })).toBeVisible();
  await expect(
    readerToolbar.getByRole('button', { name: 'Mark Stable component APIs as finished' })
  ).toBeVisible();
  await expect(readerToolbar.getByRole('link', { name: 'Open source' })).toBeVisible();
  await expect(
    page.locator('.new-page-bookmark-view__actions-left--reader-pinned')
  ).toHaveAttribute('aria-hidden', 'true');

  await reader.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(readerToolbar).not.toHaveClass(/workbench-readerbar--article-pinned/);
  await expect(readerToolbar.getByText('Reader')).toBeVisible();

  await reader.evaluate((element, scrollPosition) => {
    element.scrollTop = scrollPosition;
  }, readerScrollPosition);

  await page.keyboard.press('Escape');
  await expect(page.locator('.new-page-screen')).not.toHaveClass(
    /new-page-screen--reader-expanded/
  );
  await expect(page.locator('.new-page-sidebar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open immersive reader' })).toBeVisible();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBe(readerScrollPosition);

  await page.goto('/library/people');
  await expect(page.getByText('Alice Example')).toBeVisible();

  await page.goto('/library/sources');
  await expect(page.getByText('Zine Editorial')).toBeVisible();
  await expect(page.getByText('Interface Notes')).toBeVisible();

  await page.goto('/library/collections');
  await expect(page.locator('.web-collection-tile').getByText('Design systems')).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subscriptions' })).toBeVisible();
});

test('preserves legacy bookmark redirects', async ({ page }) => {
  await mockWebTrpc(page);

  await page.goto('/bookmarks?contentType=video');
  await expect(page).toHaveURL(/\/library\/bookmarks\?contentType=video$/);

  await page.goto('/bookmarks/video-1');
  await expect(page).toHaveURL(/\/item\/video-1$/);
  await expect(page.getByRole('heading', { name: 'Design systems at scale' })).toBeVisible();
});

test('uses a phone drill-in flow and bottom app tabs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWebTrpc(page);

  await page.goto('/library/bookmarks');
  await expect(page.getByRole('navigation', { name: 'Tab bar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.new-page-sidebar')).toBeHidden();

  await page.getByRole('button', { name: /Design systems at scale/ }).click();
  await expect(page).toHaveURL(/\/item\/video-1$/);
  await expect(page.getByRole('heading', { name: 'Design systems at scale' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to bookmarks list' })).toBeVisible();
  await expect(page.getByText('Stable component APIs')).toHaveCount(0);

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
});

test('renders post detail like the mobile app on phone viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWebTrpc(page);

  await page.goto('/item/post-1');

  await expect(page.locator('[aria-label="X post content"]')).toBeVisible();
  await expect(page.getByText('Notes on interface pace')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notes on interface pace' })).toHaveCount(0);
  await expect(page.locator('.new-page-bookmark-view__section')).toHaveCount(0);
  await expect(page.locator('.new-page-bookmark-view__hero')).toHaveCount(0);
});

test('renders the empty home state when no data exists', async ({ page }) => {
  await mockWebTrpc(page, 'empty');

  await page.goto('/home');

  await expect(page.getByRole('heading', { name: 'Your home is ready when you are' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('link', { name: 'Connect sources' })).toHaveAttribute(
    'href',
    '/welcome'
  );
});
