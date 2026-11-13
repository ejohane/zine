// Matching local Playwright/WebKit fallback: latest CLI and cached WebKit have
// incompatible protocols on this host. These are browser journeys, not test specs.
import { chromium, webkit } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const engine = process.argv[2] || 'chromium';
const browser = await (engine === 'webkit'
  ? webkit.launch()
  : chromium.launch({ channel: 'chrome' }));
mkdirSync('output/playwright/video', { recursive: true });
try {
  const context = await browser.newContext(
    engine === 'webkit'
      ? { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true }
      : {
          viewport: { width: 951, height: 669 },
          recordVideo: { dir: 'output/playwright/video', size: { width: 1280, height: 900 } },
        }
  );
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const source = readFileSync(
    `verification/${engine === 'webkit' ? 'webkit-flow' : 'browser-flow'}.js`,
    'utf8'
  );
  const flow = (0, eval)(`(${source})`);
  const result = await flow(page);
  writeFileSync(`output/playwright/${engine}-result.json`, JSON.stringify(result, null, 2));
  await context.tracing.stop({ path: `output/playwright/${engine}-trace.zip` });
  const video = page.video();
  await context.close();
  if (video) await video.saveAs('output/playwright/browser-walkthrough.webm');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
