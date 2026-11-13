// Fresh contexts keep glass/compositor captures accurate when switching themes.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { signIn } from './sign-in.mjs';
const session = await chromium.launchPersistentContext(
  resolve('../../.local-data/zine-next-connected-profile'),
  { channel: 'chrome', headless: false, viewport: { width: 1024, height: 768 } }
);
try {
  const initial = session.pages()[0] || (await session.newPage());
  await signIn(initial);
  const state = await session.storageState();
  const results = [];
  const errors = [];
  const violations = [];
  const incomplete = new Set();
  for (const [name, width, height, theme] of [
    ['tablet', 1024, 768, 'dark'],
    ['phone', 390, 844, 'light'],
  ]) {
    const context = await session
      .browser()
      .newContext({ storageState: state, viewport: { width, height }, colorScheme: theme });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)))
      throw Error('Overflow: ' + name);
    await page.screenshot({ path: `output/playwright/connected/${name}.png` });
    results.push({ name, width, height, theme, noOverflow: true });
    await page.evaluate(readFileSync('../../node_modules/axe-core/axe.min.js', 'utf8'));
    const axe = await page.evaluate(() =>
      window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })
    );
    violations.push(
      ...axe.violations.map((v) => ({
        viewport: name,
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
      }))
    );
    axe.incomplete.forEach((v) => incomplete.add(v.id));
    await context.close();
  }
  writeFileSync(
    'output/playwright/connected/layouts.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        axe: { violations, incomplete: [...incomplete] },
        runtimeErrors: errors,
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ responsive: results, axeViolations: violations, runtimeErrors: errors })
  );
  if (violations.length || errors.length) process.exitCode = 1;
} finally {
  await session.close();
}
