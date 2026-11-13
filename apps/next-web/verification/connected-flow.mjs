// Production acceptance: real UI + real Clerk + independent REST readback.
// No traces/HARs/authentication recordings: those can contain bearer credentials.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { signIn } from './sign-in.mjs';
const out = 'output/playwright/connected';
mkdirSync(out, { recursive: true });
const checks = [];
const requests = [];
const runtimeErrors = [];
const assert = (value, label) => {
  if (!value) throw Error(label);
};
const profile = resolve('../../.local-data/zine-next-connected-profile');
let context = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1024, height: 768 },
});
let page = context.pages()[0] || (await context.newPage());
let testId;
const unique = randomUUID();
const input = {
  url: `https://example.com/zine-web-proof/${unique}`,
  reason: 'Connected browser acceptance ' + unique,
  secondReason: 'A deliberate second save ' + unique,
  note: 'A durable note from the connected web app ' + unique,
};
async function call(path, method = 'GET', body) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const token = await window.Clerk.session.getToken();
      const response = await fetch(path, {
        method,
        headers: {
          authorization: 'Bearer ' + token,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        requestId: response.headers.get('x-request-id'),
        value: response.status === 204 ? null : await response.json(),
      };
    },
    { path, method, body }
  );
}
const done = () =>
  page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
async function checkpoint(name, run) {
  const details = await run();
  checks.push({ name, passed: true, details: details ?? null });
  console.log('Passed: ' + name);
}
function observe() {
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('response', (response) => {
    const u = new URL(response.url());
    if (u.origin === 'https://api-next.myzine.app' && u.pathname.startsWith('/v1/'))
      requests.push({
        method: response.request().method(),
        path: u.pathname.replace(/\/itm_[^/]+/g, '/:itemId'),
        status: response.status(),
        requestId: response.headers()['x-request-id'],
      });
  });
}
try {
  await signIn(page);
  observe();
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('zine-next-connected-v1', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('data', 'readwrite');
          const store = tx.objectStore('data');
          const key = localStorage.getItem('zine-next-connected-owner') + ':pending-save';
          const pending = store.get(key);
          pending.onsuccess = () => {
            if (pending.result?.body?.url?.startsWith('https://example.com/zine-web-proof/'))
              store.delete(key);
          };
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = reject;
        };
        request.onerror = reject;
      })
  );
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await checkpoint('Verified session owner and real populated feed', async () => {
    const me = await call('/v1/me');
    assert(me.status === 200, 'me failed');
    const owner = await page.evaluate(() => window.Clerk.user.id);
    assert(me.value.id === owner, 'Owner mismatch');
    assert((await page.locator('.story-card').count()) > 0, 'No production cards');
    await page.screenshot({ path: out + '/home.png' });
    return {
      ownerHash: createHash('sha256').update(owner).digest('hex'),
      initialCards: await page.locator('.story-card').count(),
    };
  });
  await checkpoint('Real cursor pagination appends unique saves', async () => {
    const before = await page.locator('.story-card').count();
    await page.getByRole('button', { name: 'More saves', exact: true }).click();
    await page.waitForFunction(
      (count) => document.querySelectorAll('.story-card').length > count,
      before
    );
    const ids = await page
      .locator('.story-card')
      .evaluateAll((elements) => elements.map((el) => el.dataset.itemId));
    assert(new Set(ids).size === ids.length, 'Duplicate cards');
    return { before, after: ids.length };
  });
  await checkpoint('Format filters query real API content', async () => {
    for (const section of ['Podcasts', 'Articles', 'Videos', 'Posts']) {
      const type = {
        Podcasts: 'podcast_episode',
        Articles: 'article',
        Videos: 'video',
        Posts: 'post,thread',
      }[section];
      const response = page.waitForResponse((r) => {
        const u = new URL(r.url());
        return u.pathname === '/v1/items' && u.searchParams.get('type') === type;
      });
      await page.getByRole('button', { name: section, exact: true }).click();
      assert((await response).status() === 200, 'Filter request failed');
      await page.waitForFunction(
        (section) =>
          !document.querySelector(`[data-kind]:not([data-kind="${section}"])`) &&
          !document.querySelector('main')?.textContent.includes('Opening your saves…'),
        section
      );
    }
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.locator('.story-card').first().waitFor();
    await page.evaluate(() => scrollTo(0, 0));
  });
  const capture = async (reason) => {
    await page.getByRole('button', { name: 'Save a link', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Link', { exact: true }).fill(input.url);
    await dialog.getByLabel('Why do you want to keep it?').fill(reason);
    if (reason === input.reason) {
      await dialog.getByLabel('Tags', { exact: false }).fill('x'.repeat(101));
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await dialog.getByRole('alert').waitFor();
    }
    await dialog.getByLabel('Tags', { exact: false }).fill('zine-web-verification');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL((url) => new URLSearchParams(url.hash.slice(1)).has('item'), {
      timeout: 45000,
    });
    await dialog.getByText(reason, { exact: true }).waitFor({ timeout: 45000 });
    return new URLSearchParams(new URL(page.url()).hash.slice(1)).get('item');
  };
  await checkpoint('Save is durable and a deliberate repeat keeps one reference', async () => {
    let lostAcknowledgement;
    let intercepted = false;
    await page.route('**/v1/saves', async (route) => {
      if (
        intercepted ||
        route
          .request()
          .postDataJSON()
          ?.tags?.some((tag) => tag.length > 100)
      )
        return route.continue();
      intercepted = true;
      const response = await route.fetch();
      lostAcknowledgement = {
        upstreamStatus: response.status(),
        requestId: response.headers()['x-request-id'],
      };
      await route.abort('connectionreset');
    });
    testId = await capture(input.reason);
    await page.unroute('**/v1/saves');
    assert(
      lostAcknowledgement.upstreamStatus === 201 || lostAcknowledgement.upstreamStatus === 200,
      'Controlled upstream save failed'
    );
    assert(testId, 'No saved item ID');
    assert(
      await page.evaluate(() => document.documentElement.classList.contains('modal-open')),
      'Body scroll unlocked during capture-to-detail navigation'
    );
    await done();
    const repeated = await capture(input.secondReason);
    assert(testId === repeated, 'Repeated save duplicated reference');
    assert(
      await page.getByText(input.reason, { exact: true }).isVisible(),
      'Original context lost'
    );
    return {
      itemId: testId,
      deliberateRepeatSameId: true,
      invalidInputCorrected: true,
      lostAcknowledgement,
    };
  });
  await checkpoint('Note, position, completion and archive persist through reload', async () => {
    await page.getByRole('textbox', { name: 'Add a thought for later' }).fill(input.note);
    await page.getByRole('button', { name: 'Keep this note', exact: true }).click();
    await page.getByText(input.note, { exact: true }).waitFor();
    const slider = page.getByRole('slider', { name: 'Saved position' });
    await page.waitForFunction(
      () => !document.querySelector('input[aria-label="Saved position"]').disabled
    );
    await slider.focus();
    await slider.press('ArrowRight');
    await page.waitForFunction(
      () =>
        document.querySelector('[role=dialog]')?.textContent?.includes('1% read') ||
        document.querySelector('dialog')?.textContent?.includes('1% read')
    );
    await page.getByRole('button', { name: 'Mark finished', exact: true }).click();
    await page.getByRole('button', { name: 'Mark unfinished', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: 'Unarchive', exact: true }).waitFor();
    await page.reload();
    await page.getByText(input.note, { exact: true }).waitFor({ timeout: 45000 });
    await page.getByRole('button', { name: 'Unarchive', exact: true }).waitFor();
    await page.screenshot({ path: out + '/saved-note.png' });
    const independent = spawnSync('bun', ['run', 'verification/check-live.ts'], {
      input: JSON.stringify({
        ...input,
        id: testId,
        position: 0.01,
        completed: true,
        archived: true,
      }),
      encoding: 'utf8',
      env: process.env,
    });
    assert(
      independent.status === 0,
      'Independent server readback failed: ' + independent.stderr.split('\n')[0]
    );
    return JSON.parse(independent.stdout.trim());
  });
  await checkpoint('Cold offline shell, account cache and saved note', async () => {
    await context.setOffline(true);
    const cold = await context.newPage();
    await cold.goto('https://api-next.myzine.app/next/#item=' + testId);
    await cold.getByText(input.note, { exact: true }).waitFor();
    assert(
      await cold.getByRole('button', { name: 'Keep this note', exact: true }).isDisabled(),
      'Offline writes enabled'
    );
    await cold.screenshot({ path: out + '/offline.png' });
    await cold.close();
    await context.setOffline(false);
    return { coldPage: true, cachedNote: true, offlineWritesDisabled: true };
  });
  await checkpoint('Production shell cache excludes APIs, credentials and mock data', async () => {
    const entries = await page.evaluate(async () => {
      const all = [];
      for (const key of await caches.keys()) {
        if (key.startsWith('zine-next-connected-'))
          for (const request of await (await caches.open(key)).keys())
            all.push(new URL(request.url).pathname);
      }
      return all;
    });
    assert(
      entries.length > 0 &&
        entries.every((path) => path.startsWith('/next/') && !path.includes('/artwork/')),
      'Unsafe cache entry'
    );
    return { shellAssets: entries.length };
  });
  await done();
  await page.evaluate(() => scrollTo(0, 0));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: out + '/home-dark.png' });
  assert(!runtimeErrors.length, 'Runtime errors: ' + runtimeErrors.join('; '));
  // Cleanup only the uniquely created controlled reference, never an existing save.
  const created = await call('/v1/items/' + testId);
  assert(created.value.content.url === input.url, 'Cleanup identity mismatch');
  const cleanup = await call('/v1/items/' + testId, 'DELETE');
  assert(cleanup.status === 204, 'Cleanup failed');
  const erased = await call('/v1/items/' + testId);
  assert(erased.status === 404 || erased.status === 410, 'Deleted test reference still readable');
  await checkpoint('Controlled verification save cleaned up', async () => ({
    deleted: true,
    readStatus: erased.status,
  }));
  await checkpoint('Known deletion removes cached private copies', async () => {
    await page.goto('https://api-next.myzine.app/next/#item=' + testId);
    await page.waitForFunction(
      () =>
        !!document.querySelector('dialog [role=alert]') &&
        !document.querySelector('dialog textarea')
    );
    const remains = await page.evaluate(
      (id) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('zine-next-connected-v1', 1);
          open.onsuccess = () => {
            const db = open.result;
            const request = db.transaction('data').objectStore('data').getAll();
            request.onsuccess = () => {
              const found = request.result.some(
                (value) => value?.id === id || value?.items?.some((item) => item.id === id)
              );
              db.close();
              resolve(found);
            };
            request.onerror = reject;
          };
          open.onerror = reject;
        }),
      testId
    );
    assert(!remains, 'Deleted item remains in offline cache');
    await done();
    return { deniedItemHidden: true, offlineCopiesPurged: true };
  });
  testId = undefined;
  await checkpoint('Sign-out clears private cache and hides account data', async () => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'A place for your curiosity.', exact: true }).waitFor();
    await page.waitForFunction(() => !localStorage.getItem('zine-next-connected-owner'));
    const count = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('zine-next-connected-v1', 1);
          open.onsuccess = () => {
            const db = open.result;
            const req = db.transaction('data').objectStore('data').count();
            req.onsuccess = () => {
              db.close();
              resolve(req.result);
            };
            req.onerror = reject;
          };
          open.onerror = reject;
        })
    );
    assert(count === 0, 'Private cache remains after sign-out');
    return { privateCacheEntries: count };
  });
  writeFileSync(
    out + '/receipt.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        origin: 'https://api-next.myzine.app/next/',
        browser: context.browser().version(),
        checks,
        runtimeErrors,
        requests,
      },
      null,
      2
    )
  );
  console.log('Connected production acceptance passed: ' + checks.length + ' journeys.');
} catch (error) {
  writeFileSync(
    out + '/failure.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        controlledInput: input,
        controlledItemId: testId,
        completed: checks,
        lastError: error.message.split('\n')[0],
        runtimeErrors,
        requests,
      },
      null,
      2
    )
  );
  console.log('Acceptance stopped: ' + error.message.split('\n')[0]);
  if (testId) {
    try {
      const item = await call('/v1/items/' + testId);
      if (item.value?.content.url === input.url) await call('/v1/items/' + testId, 'DELETE');
      console.log('Controlled test item cleanup attempted.');
    } catch {
      console.log('Controlled cleanup needs follow-up; ID retained in private failure receipt.');
    }
  }
  process.exitCode = 1;
} finally {
  await context.close();
}
