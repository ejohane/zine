import { chromium } from 'playwright';
import { mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { signIn } from './sign-in.mjs';
const profile = resolve('../../.local-data/zine-next-connected-profile');
mkdirSync(profile, { recursive: true });
chmodSync(profile, 0o700);
const browser = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1024, height: 768 },
});
const page = browser.pages()[0] || (await browser.newPage());
try {
  await signIn(page);
  await page.screenshot({ path: 'output/playwright/connected-home.png' });
  writeFileSync(
    'output/playwright/connected-auth.json',
    JSON.stringify({
      at: new Date().toISOString(),
      realClerkSession: true,
      authenticatedFeed: true,
      cards: await page.locator('.story-card').count(),
    })
  );
  console.log('Real Clerk sign-in and populated production feed passed.');
  if (process.env.ZINE_KEEP_BROWSER_OPEN === '1') {
    await page.bringToFront();
    await new Promise((resolve) => process.once('SIGTERM', resolve));
  }
} catch (error) {
  const diagnostic = await page.evaluate(() => ({
    headings: [...document.querySelectorAll('h1,h2')].map((e) => e.textContent),
    alerts: [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent),
    fields: [...document.querySelectorAll('input')].map((e) => ({
      name: e.name,
      type: e.type,
      filled: !!e.value,
    })),
    appStatus: document.querySelector('main')?.innerText.includes('Opening your Zine'),
  }));
  console.log(
    JSON.stringify(diagnostic).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
  );
  console.log('Browser sign-in failed at ' + (error.message?.split('\n')[0] || 'unknown step'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
