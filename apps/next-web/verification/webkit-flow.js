async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const assert = (ok, message) => {
    if (!ok) throw Error(message);
  };
  await page.goto('http://localhost:4194/');
  await page.getByRole('heading', { name: 'Follow your curiosity' }).waitFor();
  const opening = await page.locator('.story-card').evaluateAll((elements) =>
    elements.slice(0, 3).map((e) => {
      const r = e.getBoundingClientRect();
      return { width: r.width, height: r.height };
    })
  );
  assert(Math.abs(opening[1].width - opening[1].height) < 1, 'Podcast not square in WebKit');
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'iPad overflow'
  );
  const header = page.getByRole('button', { name: 'Podcasts', exact: true });
  const r = await header.boundingBox();
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  await page.getByRole('heading', { name: 'Let a conversation unfold' }).waitFor();
  assert(
    (await page.locator('.story-card:not([data-kind="Podcasts"])').count()) === 0,
    'WebKit filter failed'
  );
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/webkit-ipad-light.png' });
  await page.getByRole('button', { name: 'Search your saves', exact: true }).click();
  await page.getByRole('button', { name: 'attention and craft', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /The Running Novelist/ })
    .waitFor();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /The Running Novelist/ })
    .click();
  await page
    .getByRole('textbox', { name: 'Add a thought for later' })
    .fill('A note from WebKit on the iPad-sized viewport.');
  await page.getByRole('button', { name: 'Keep this note', exact: true }).click();
  await page.getByText('A note from WebKit on the iPad-sized viewport.', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('A note from WebKit on the iPad-sized viewport.', { exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/webkit-detail.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/webkit-ipad-dark.png' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  let offlineError = null;
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } catch (error) {
    offlineError = error.message;
  }
  if (offlineError) {
    await page.context().setOffline(false);
    return {
      at: new Date().toISOString(),
      engine: page.context().browser().version(),
      touchFilter: true,
      geometry: opening,
      search: true,
      notePersistedThroughReload: true,
      offlineReload: false,
      offlineError,
      runtimeErrors: errors,
    };
  }
  await page.getByRole('heading', { name: 'Follow your curiosity' }).waitFor();
  const images = await page.locator('img').evaluateAll(async (imgs) => {
    await Promise.all(imgs.map((img) => img.decode()));
    return imgs.length;
  });
  await page.context().setOffline(false);
  assert(!errors.length, 'WebKit runtime errors: ' + errors.join(';'));
  return {
    at: new Date().toISOString(),
    engine: page.context().browser().version(),
    viewport: { width: 1024, height: 768 },
    touchFilter: true,
    geometry: opening,
    search: true,
    notePersistedThroughReload: true,
    offlineReload: true,
    offlineImages: images,
    runtimeErrors: errors,
  };
};
