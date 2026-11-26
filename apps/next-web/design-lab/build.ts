import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the design lab into output/design-lab/index.html (ignored by git): one self-contained
 * page next to the data.json that `fetch-data.py` wrote. Serve that folder over a local web
 * server, or publish the two files together.
 *
 *   python3 design-lab/fetch-data.py && bun design-lab/build.ts
 */
const here = dirname(fileURLToPath(import.meta.url));
const packages = join(here, '../../../packages');
const out = join(here, '../output/design-lab');
mkdirSync(out, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(here, 'app.tsx')],
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (!result.success) {
  console.error(result.logs.join('\n'));
  process.exit(1);
}
const script = (await result.outputs[0]!.text()).replaceAll('</script', '<\\/script');
const css = [
  join(packages, 'next-design/generated/tokens.css'),
  join(packages, 'next-ui/src/cards.css'),
  join(here, 'lab.css'),
]
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

writeFileSync(
  join(out, 'index.html'),
  `<title>Zine Next App Directions</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${script}
</script>
`
);
console.log(`Built ${join(out, 'index.html')} (${Math.round(script.length / 1024)} KB of script)`);
