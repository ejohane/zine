import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { signIn } from './sign-in.mjs';
const context = await chromium.launchPersistentContext(
  resolve('../../.local-data/zine-next-connected-profile'),
  { channel: 'chrome', headless: false, viewport: { width: 1024, height: 768 } }
);
const page = context.pages()[0] || (await context.newPage());
const manifestId = 'https://api-next.myzine.app/next/';
try {
  await signIn(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  const eligibility = await cdp.send('Page.getInstallabilityErrors');
  if (manifest.errors.length || eligibility.installabilityErrors.length)
    throw Error('PWA is not installable');
  const root = await context.browser().newBrowserCDPSession();
  let installed = false;
  try {
    await root.send('PWA.getOsAppState', { manifestId });
    installed = true;
  } catch {}
  if (!installed) await root.send('PWA.install', { manifestId, installUrlOrBundleUrl: manifestId });
  await root.send('PWA.changeAppUserSettings', { manifestId, displayMode: 'standalone' });
  const target = context.waitForEvent('page');
  await root.send('PWA.launch', { manifestId });
  const app = await target;
  await app.getByRole('heading', { name: 'Follow your curiosity', exact: true }).waitFor();
  await app.locator('.story-card').first().waitFor();
  const standalone = await app.evaluate(() => matchMedia('(display-mode: standalone)').matches);
  if (!standalone) throw Error('Not standalone');
  await app.screenshot({ path: 'output/playwright/connected/installed.png' });
  await app.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await app.reload();
  await app.locator('.story-card').first().waitFor();
  await app
    .getByText('Offline · Reading saved copies. Connect to make changes.', { exact: true })
    .waitFor();
  await app.screenshot({ path: 'output/playwright/connected/installed-offline.png' });
  await context.setOffline(false);
  writeFileSync(
    'output/playwright/connected/install.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        browser: context.browser().version(),
        manifestId,
        manifestErrors: manifest.errors,
        installabilityErrors: eligibility.installabilityErrors,
        standalone,
        offlineReload: true,
      },
      null,
      2
    )
  );
  console.log(
    'Production PWA installed, launched standalone and reloaded offline with real cached saves.'
  );
} finally {
  await context.close();
}
