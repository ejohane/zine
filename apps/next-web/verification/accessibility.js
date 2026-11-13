async (page) => {
  await page.goto('http://localhost:4194/');
  await page.addScriptTag({ path: '../../node_modules/axe-core/axe.min.js' });
  const run = () =>
    page.evaluate(async () => {
      const result = await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return {
        violations: result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        })),
        passes: result.passes.length,
        incomplete: result.incomplete.map((v) => v.id),
      };
    });
  const home = await run();
  await page.getByRole('button', { name: 'Save a link', exact: true }).click();
  const capture = await run();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('alert').waitFor();
  const invalidURL = await page.getByRole('alert').innerText();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.story-card').filter({ hasText: 'The Running Novelist' }).click();
  const detail = await run();
  const result = { at: new Date().toISOString(), home, capture, detail, invalidURL };
  if (home.violations.length || capture.violations.length || detail.violations.length)
    console.log('ACCESSIBILITY_FINDINGS');
  return result;
};
