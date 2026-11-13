async (page) => {
  const origin = 'http://localhost:4194/';
  await page.goto(origin);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cdp = await page.context().newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  const installability = await cdp.send('Page.getInstallabilityErrors');
  if (manifest.errors.length || installability.installabilityErrors.length)
    throw new Error(JSON.stringify({ manifest, installability }));
  const browser = page.context().browser();
  const root = await browser.newBrowserCDPSession();
  let installed = false;
  try {
    await root.send('PWA.getOsAppState', { manifestId: origin });
    installed = true;
  } catch {}
  if (!installed)
    await root.send('PWA.install', { manifestId: origin, installUrlOrBundleUrl: origin });
  const osState = await root.send('PWA.getOsAppState', { manifestId: origin });
  await root.send('PWA.changeAppUserSettings', { manifestId: origin, displayMode: 'standalone' });
  const event = page.context().waitForEvent('page');
  const launched = await root.send('PWA.launch', { manifestId: origin });
  const app = await event;
  await app.waitForLoadState('domcontentloaded');
  await app.getByRole('heading', { name: 'Follow your curiosity' }).waitFor();
  const standalone = await app.evaluate(() => matchMedia('(display-mode: standalone)').matches);
  if (!standalone) {
    await app.screenshot({ path: 'output/playwright/install-debug.png' });
    throw new Error('Installed app not standalone: ' + app.url());
  }
  const bundle = await app.locator('script[type=module]').getAttribute('src');
  const caches = await app.evaluate(() => window.caches.keys());
  await app.screenshot({ path: 'output/playwright/installed-standalone.png' });
  await app.context().setOffline(true);
  await app.reload();
  if (!(await app.getByRole('heading', { name: 'Follow your curiosity' }).isVisible()))
    throw new Error('Installed offline reload failed');
  await app.screenshot({ path: 'output/playwright/installed-offline.png' });
  await app.context().setOffline(false);
  return {
    at: new Date().toISOString(),
    browser: browser.version(),
    manifestErrors: manifest.errors,
    installabilityErrors: installability.installabilityErrors,
    manifestId: origin,
    osState,
    targetId: launched.targetId,
    standalone,
    offlineReload: true,
    bundle,
    caches,
  };
};
