// A deliberately paced recording of real production UI, with no edited frames.
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    colorScheme: 'light',
    recordVideo: { dir: 'output/playwright/video', size: { width: 1024, height: 768 } },
  });
  const page = await context.newPage();
  const pause = () => page.waitForTimeout(1400);
  await page.goto('http://localhost:4194/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await pause();
  await page.getByRole('button', { name: 'Podcasts', exact: true }).click();
  await pause();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.mouse.wheel(0, 600);
  await pause();
  await page.evaluate(() => scrollTo(0, 0));
  await pause();
  await page.getByRole('button', { name: 'Search your saves', exact: true }).click();
  await pause();
  await page.getByRole('button', { name: 'attention and craft', exact: true }).click();
  await pause();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /The Running Novelist/ })
    .click();
  await pause();
  await page
    .getByRole('textbox', { name: 'Add a thought for later' })
    .fill('Keep this for a quieter Sunday morning.');
  await page.getByRole('button', { name: 'Keep this note', exact: true }).click();
  await pause();
  await page.reload();
  await page.getByText('Keep this for a quieter Sunday morning.', { exact: true }).waitFor();
  await pause();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('status').filter({ hasText: 'Offline' }).waitFor();
  await pause();
  await page
    .getByRole('button', {
      name: 'Articles, The Running Novelist, Haruki Murakami, 23 min read',
      exact: true,
    })
    .click();
  await page.getByText('Keep this for a quieter Sunday morning.', { exact: true }).waitFor();
  await pause();
  const video = page.video();
  await context.close();
  await video.saveAs('output/playwright/browser-walkthrough.webm');
  console.log('Recorded live filters, scrolling, search, notes, reload and offline persistence.');
} finally {
  await browser.close();
}
