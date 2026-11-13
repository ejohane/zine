// Fresh contexts avoid stale compositor tiles while resizing a fixed/glass header.
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, width, height, scheme, textSize] of [
    ['ipad-light', 1024, 768, 'light', '100%'],
    ['phone-light', 390, 844, 'light', '100%'],
    ['small-phone-light', 320, 740, 'light', '100%'],
    ['desktop-light', 1440, 960, 'light', '100%'],
    ['home-dark', 951, 669, 'dark', '100%'],
    ['large-text', 951, 900, 'light', '200%'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto('http://localhost:4194/');
    await page.getByRole('heading', { name: 'Follow your curiosity' }).waitFor();
    if (textSize !== '100%')
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), textSize);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)))
      throw Error(name + ' overflows');
    await page.screenshot({ path: `output/playwright/${name}.png`, animations: 'disabled' });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log('Six fresh-context responsive/color/text captures saved; no horizontal overflow.');
