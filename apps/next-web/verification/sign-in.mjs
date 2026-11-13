// Only real Clerk form entry. Never log credentials, cookies or tokens.
export async function signIn(page) {
  await page.goto('https://api-next.myzine.app/next/');
  const feed = page.getByRole('heading', { name: 'Follow your curiosity', exact: true });
  const email = page.getByRole('textbox', { name: 'Email address', exact: true });
  await Promise.race([
    feed.waitFor({ timeout: 45000 }),
    email.waitFor({ timeout: 45000 }),
    page
      .locator('main > [role=alert]')
      .waitFor({ timeout: 45000 })
      .then(() => {
        throw Error('Application authentication error');
      }),
  ]);
  if (await feed.isVisible()) {
    await page.locator('.story-card').first().waitFor({ timeout: 45000 });
    await ready(page);
    return;
  }
  if (!process.env.ZINE_TEST_USER_EMAIL || !process.env.ZINE_TEST_USER_PASSWORD)
    throw Error('Use secretsctl run zine.test.');
  await email.fill(process.env.ZINE_TEST_USER_EMAIL);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('input[type=password]').waitFor({ timeout: 30000 });
  await page.locator('input[type=password]').fill(process.env.ZINE_TEST_USER_PASSWORD);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await Promise.race([
    feed.waitFor({ timeout: 45000 }),
    page
      .locator('main > [role=alert]')
      .waitFor({ timeout: 45000 })
      .then(() => {
        throw Error('Application authentication error');
      }),
  ]);
  await page.locator('.story-card').first().waitFor({ timeout: 45000 });
  await ready(page);
}

async function ready(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent === 'Refresh' && !button.disabled
    )
  );
}
