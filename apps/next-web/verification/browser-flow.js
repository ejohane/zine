async (page) => {
  const results = [];
  const errors = [];
  const origin = 'http://localhost:4194';
  page.on('pageerror', (error) => errors.push(error.message));
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const check = async (name, action) => {
    try {
      const details = await action();
      results.push({ name, passed: true, details: details ?? null });
    } catch (error) {
      console.log(JSON.stringify({ completed: results, failure: name, error: String(error) }));
      throw error;
    }
  };
  const done = () =>
    page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  const card = (title) => page.locator('.story-card').filter({ hasText: title });
  const openCapture = () => page.getByRole('button', { name: 'Save a link', exact: true }).click();
  await page.setViewportSize({ width: 951, height: 669 });
  await page.goto(origin);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await check('Production shell and complete bundled content are cached', async () => {
    const state = await page.evaluate(async () => ({
      controller: !!navigator.serviceWorker.controller,
      keys: await caches.keys(),
      entries: (
        await Promise.all(
          (await caches.keys()).map(async (key) =>
            (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname)
          )
        )
      ).flat(),
    }));
    assert(
      state.keys.some((k) => k.startsWith('zine-next-')),
      'Versioned offline cache missing'
    );
    assert(
      state.entries.filter((p) => p.startsWith('/artwork/')).length === 16,
      'All 16 artwork assets must be precached'
    );
    assert(
      state.entries.includes('/index.html') && state.entries.includes('/manifest.webmanifest'),
      'Shell or manifest missing'
    );
    return state;
  });
  await check('Native bento geometry and row-major keyboard order', async () => {
    const cards = await page.locator('.story-card').evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { kind: el.dataset.kind, x: r.x, y: r.y, width: r.width, height: r.height };
      })
    );
    assert(cards.length === 20, 'Saved default must exclude the two received items');
    assert(Math.abs(cards[1].width - cards[1].height) < 1, 'Podcast is not square');
    assert(Math.abs(cards[2].width - cards[2].height) < 1, 'Second podcast is not square');
    assert(
      Math.abs(cards[0].height - (cards[0].width * 1.5 + 7)) < 1,
      'Tall article does not match native 3-row proportion'
    );
    for (let a = 0; a < cards.length; a++)
      for (let b = a + 1; b < cards.length; b++) {
        const x = cards[a],
          y = cards[b];
        assert(
          !(
            x.x < y.x + y.width - 1 &&
            x.x + x.width > y.x + 1 &&
            x.y < y.y + y.height - 1 &&
            x.y + x.height > y.y + 1
          ),
          'Overlapping bento cards'
        );
      }
    for (let i = 1; i < cards.length; i++)
      assert(cards[i].y >= cards[i - 1].y - 1, 'DOM order differs from visual reading order');
    await page.screenshot({ path: 'output/playwright/home-light.png' });
    return { opening: cards.slice(0, 5), cards: cards.length };
  });
  await check('All five filters and native-style header scrubbing', async () => {
    for (const section of ['Podcasts', 'Articles', 'Videos', 'Posts']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      assert((await page.locator('.story-card').count()) > 0, 'Empty format filter');
      assert(
        (await page.locator(`.story-card:not([data-kind="${section}"])`).count()) === 0,
        'Wrong content type in filter'
      );
    }
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    const home = await page.getByRole('button', { name: 'Home', exact: true }).boundingBox();
    await page.mouse.move(home.x + home.width * 0.7, home.y + home.height / 2);
    await page.mouse.down();
    await page.mouse.move(home.x + home.width * 0.7 - 72, home.y + home.height / 2, { steps: 10 });
    await page.mouse.up();
    assert(
      (await page
        .getByRole('button', { name: 'Podcasts', exact: true })
        .getAttribute('aria-pressed')) === 'true',
      'Header scrub did not advance'
    );
    await page.getByRole('button', { name: 'Home', exact: true }).click();
  });
  await check(
    'Body sideways drag is inert; vertical scrolling preserves translucent pinned header',
    async () => {
      const first = await page.locator('.story-card').first().boundingBox();
      await page.mouse.move(first.x + first.width * 0.7, first.y + 70);
      await page.mouse.down();
      await page.mouse.move(first.x + first.width * 0.7 - 100, first.y + 70, { steps: 12 });
      await page.mouse.up();
      assert((await page.getByRole('dialog').count()) === 0, 'Body drag opened a detail');
      assert(
        (await page
          .getByRole('button', { name: 'Home', exact: true })
          .getAttribute('aria-pressed')) === 'true',
        'Body drag changed section'
      );
      const before = await page.locator('.floating-header').boundingBox();
      await page.mouse.wheel(0, 620);
      await page.waitForFunction(() => window.scrollY > 500);
      const after = await page.locator('.floating-header').boundingBox();
      assert(Math.abs(before.y - after.y) < 1, 'Header moved while scrolling');
      const glass = await page
        .locator('.filter')
        .first()
        .evaluate((el) => ({
          backdrop: getComputedStyle(el).backdropFilter,
          background: getComputedStyle(el).backgroundColor,
        }));
      assert(glass.backdrop.includes('blur'), 'No backdrop blur');
      await page.screenshot({ path: 'output/playwright/home-scrolled.png' });
      await page.evaluate(() => window.scrollTo(0, 0));
      return glass;
    }
  );
  await check('Modal keyboard trap, Escape and focus return', async () => {
    const trigger = page.getByRole('button', { name: 'Search your saves', exact: true });
    await trigger.focus();
    await trigger.click();
    await page.getByRole('searchbox').waitFor();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      assert(
        await page.evaluate(() => !!document.activeElement.closest('dialog')),
        'Tab escaped modal'
      );
    }
    await page.keyboard.press('Escape');
    assert((await page.getByRole('dialog').count()) === 0, 'Escape did not dismiss');
    assert(
      await trigger.evaluate((el) => document.activeElement === el),
      'Focus did not return to trigger'
    );
  });
  await check(
    'Save, deliberate re-save, notes, membership and independent progress/archive/completion',
    async () => {
      const fillCapture = async (context) => {
        await openCapture();
        const dialog = page.getByRole('dialog');
        await dialog
          .getByLabel('Link', { exact: true })
          .fill('https://example.com/zine-next-proof');
        await dialog.getByLabel('Give it a name', { exact: false }).fill('Browser proof story');
        await dialog.getByLabel('Why do you want to keep it?').fill(context);
        await dialog.getByLabel('Tags', { exact: false }).fill('proof, bento');
        await dialog
          .getByRole('combobox', { name: 'Collection', exact: true })
          .selectOption('craft');
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      };
      await fillCapture('Memory for offline proof');
      assert((await card('Browser proof story').count()) === 1, 'New save missing');
      await fillCapture('Second reason to keep it');
      assert((await card('Browser proof story').count()) === 1, 'Repeat save duplicated item');
      await card('Browser proof story').click();
      assert(
        await page.getByText('Memory for offline proof', { exact: true }).isVisible(),
        'Original context missing'
      );
      assert(
        await page.getByText('Second reason to keep it', { exact: true }).isVisible(),
        'Repeat context missing'
      );
      await page
        .getByRole('textbox', { name: 'Add a thought for later' })
        .fill('This note survives a cold offline opening.');
      await page.getByRole('button', { name: 'Keep this note', exact: true }).click();
      await page.getByText('Organize', { exact: true }).click();
      await page.getByRole('checkbox', { name: 'Designing with AI', exact: true }).check();
      const slider = page.getByRole('slider', { name: 'Saved position' });
      await slider.fill('0.43');
      await slider.press('Tab');
      assert(
        await page.getByRole('dialog').getByText('43% read', { exact: true }).isVisible(),
        'Position did not save'
      );
      assert(
        (await page.getByRole('button', { name: 'Mark finished', exact: true }).count()) === 1,
        'Position incorrectly completed item'
      );
      await page.getByRole('button', { name: 'Mark finished', exact: true }).click();
      await page.getByRole('button', { name: 'Archive', exact: true }).click();
      await done();
      await page.reload();
      await page.getByRole('combobox', { name: 'Library view' }).selectOption('archived');
      await card('Browser proof story').click();
      assert(
        await page
          .getByText('This note survives a cold offline opening.', { exact: true })
          .isVisible(),
        'Note lost after reload'
      );
      assert(
        (await page.getByRole('button', { name: 'Mark unfinished', exact: true }).count()) === 1,
        'Completion lost'
      );
      assert(
        (await page.getByRole('button', { name: 'Unarchive', exact: true }).count()) === 1,
        'Archive lost'
      );
      assert(
        await page.getByRole('dialog').getByText('43% read', { exact: true }).isVisible(),
        'Position lost'
      );
      await done();
      await page.getByRole('combobox', { name: 'Library view' }).selectOption('saved');
    }
  );
  await check('Keyword search evidence and explicitly scripted semantic search', async () => {
    await page.getByRole('button', { name: 'Search your saves', exact: true }).click();
    await page.getByRole('radio', { name: 'Words', exact: true }).check();
    await page.getByRole('searchbox').fill('offline proof');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Browser proof story/ })
      .waitFor();
    assert(
      (await page
        .getByRole('dialog')
        .getByRole('button', { name: /Browser proof story/ })
        .count()) === 1,
      'Context search did not find save'
    );
    assert(
      (await page.getByText('Matches a saved note', { exact: true }).count()) === 1,
      'Search evidence missing'
    );
    await page.getByRole('searchbox').fill('designing with AI');
    await page.getByRole('radio', { name: 'Meaning', exact: true }).check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Your coding agents made you a manager/ })
      .waitFor();
    assert(
      (await page
        .getByRole('dialog')
        .getByRole('button', { name: /Your coding agents made you a manager/ })
        .count()) === 1,
      'Scripted semantic match missing'
    );
    await page.screenshot({ path: 'output/playwright/search-evidence.png' });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Your coding agents made you a manager/ })
      .click();
    await page.goBack();
    assert(
      (await page.getByRole('searchbox').inputValue()) === 'designing with AI',
      'Back lost the search query'
    );
    await page.getByRole('searchbox').fill('unconfigured semantic query');
    assert(
      await page.getByRole('heading', { name: 'No matches yet' }).isVisible(),
      'Meaning silently fell back'
    );
    await done();
  });
  await check('Collection synthesis, supporting references, and filtered feed', async () => {
    await page.getByRole('button', { name: 'Collections', exact: true }).click();
    await page.getByRole('button', { name: /A little more intentional/ }).click();
    assert(
      await page.getByRole('heading', { name: 'Connections worth keeping' }).isVisible(),
      'Synthesis missing'
    );
    assert(
      (await page.getByRole('button', { name: 'The Running Novelist', exact: true }).count()) > 0,
      'Supporting reference missing'
    );
    await page.screenshot({ path: 'output/playwright/collection.png' });
    await page.getByRole('button', { name: 'Explore this collection' }).click();
    assert((await card('Browser proof story').count()) === 1, 'Membership lost in collection feed');
    await page.getByRole('button', { name: /Clear collection/ }).click();
  });
  await check('Received, dismissed and saved intake decisions persist', async () => {
    await page.getByRole('combobox', { name: 'Library view' }).selectOption('received');
    assert((await page.locator('.story-card').count()) === 2, 'Expected two received fixtures');
    await page.locator('.story-card').first().click();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await done();
    assert((await page.locator('.story-card').count()) === 1, 'Dismiss did not remove from inbox');
    await page.locator('.story-card').first().click();
    await page.getByRole('button', { name: 'Keep this', exact: true }).click();
    await done();
    assert(
      await page.getByRole('heading', { name: 'Room for something new' }).isVisible(),
      'Inbox decision failed'
    );
    await page.reload();
    await page.getByRole('combobox', { name: 'Library view' }).selectOption('dismissed');
    assert((await page.locator('.story-card').count()) === 1, 'Dismissed state not durable');
    await page.getByRole('combobox', { name: 'Library view' }).selectOption('saved');
  });
  await check('Following controls preserve existing library and show source cooldown', async () => {
    const count = await page.locator('.story-card').count();
    await page.getByRole('button', { name: 'Following', exact: true }).click();
    await page
      .getByRole('switch', { name: 'Save new arrivals automatically', exact: true })
      .first()
      .check();
    assert(
      await page.getByText('Waiting to check this source again', { exact: true }).isVisible(),
      'Source cooldown missing'
    );
    await page.getByRole('switch', { name: 'Following', exact: true }).first().uncheck();
    await done();
    assert(
      (await page.locator('.story-card').count()) === count,
      'Unfollowing removed existing saves'
    );
  });
  await check(
    'Retained text, provenance, annotations, related saves and browser back',
    async () => {
      await card('The Running Novelist').click();
      await page.getByText('Saved text · Partial preview', { exact: true }).click();
      assert(
        await page.getByText(/This is illustrative preview text, not a quotation/).isVisible(),
        'Retained material missing or not labeled'
      );
      assert(
        await page
          .getByText('Based on metadata only · Full source not analyzed', { exact: true })
          .isVisible(),
        'Coverage not disclosed'
      );
      await page.getByText('What’s available', { exact: true }).click();
      assert(
        (await page.getByText('Available in this preview', { exact: true }).count()) > 0,
        'Availability missing'
      );
      const before = page.url();
      await page.getByRole('button', { name: "Why books don't work", exact: true }).click();
      assert(page.url() !== before, 'Related save did not navigate');
      await page.goBack();
      assert(
        await page.getByRole('heading', { name: 'The Running Novelist', exact: true }).isVisible(),
        'Browser back did not restore detail'
      );
      await done();
    }
  );
  await check('Light/dark, phone/iPad/desktop, zoom and reduced motion layouts', async () => {
    for (const [name, width, height] of [
      ['phone', 390, 844],
      ['small-phone', 320, 780],
      ['ipad', 1024, 768],
      ['desktop', 1440, 1000],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'Outer horizontal overflow at ' + name
      );
      const rects = await page.locator('.story-card').evaluateAll((elements) =>
        elements.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, right: r.right, width: r.width };
        })
      );
      assert(
        rects.every((r) => r.x >= 0 && r.right <= width + 1 && r.width >= 44),
        'Cards overflow at ' + name
      );
      await page.screenshot({ path: `output/playwright/${name}-light.png` });
    }
    await page.setViewportSize({ width: 951, height: 669 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.screenshot({ path: 'output/playwright/home-dark.png' });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
      scrollTo(0, 0);
    });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      '200% text causes overflow'
    );
    await page.screenshot({ path: 'output/playwright/large-text.png' });
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  });
  await check('Cold offline opening, all artwork, saved notes, and offline edits', async () => {
    await page.context().setOffline(true);
    const cold = await page.context().newPage();
    await cold.goto(origin);
    assert(
      await cold.getByRole('heading', { name: 'Follow your curiosity' }).isVisible(),
      'Cold offline shell failed'
    );
    assert(
      await cold.getByRole('status').filter({ hasText: 'Offline' }).isVisible(),
      'Offline state not shown'
    );
    const images = await cold.locator('img').evaluateAll(async (elements) => {
      await Promise.all(elements.map((img) => img.decode()));
      return elements.map((img) => ({
        src: img.getAttribute('src'),
        loaded: img.naturalWidth > 0,
      }));
    });
    assert(
      images.every((i) => i.loaded),
      'An offline artwork image failed'
    );
    await cold.locator('.story-card').filter({ hasText: 'Browser proof story' }).click();
    assert(
      await cold
        .getByText('This note survives a cold offline opening.', { exact: true })
        .isVisible(),
      'Local data missing offline'
    );
    await cold
      .getByRole('textbox', { name: 'Add a thought for later' })
      .fill('Written while the network was offline.');
    await cold.getByRole('button', { name: 'Keep this note', exact: true }).click();
    await cold.reload();
    assert(
      await cold.getByText('Written while the network was offline.', { exact: true }).isVisible(),
      'Offline edit or deep-link reload failed'
    );
    await cold.screenshot({ path: 'output/playwright/offline-persistence.png' });
    await cold.close();
    await page.context().setOffline(false);
    return { offline: true, images: images.length, deepLinkReload: true, persistedNote: true };
  });
  assert(errors.length === 0, 'Runtime errors: ' + errors.join('; '));
  return {
    at: new Date().toISOString(),
    origin,
    browser: page.context().browser().version(),
    passed: results.length,
    checks: results,
    runtimeErrors: errors,
  };
};
