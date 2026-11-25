import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Builds a static page of every card from the repo's sample saves into .gallery/ (ignored by git). */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.gallery');
mkdirSync(out, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(root, 'gallery/app.tsx')],
  outdir: out,
  naming: 'app.js',
  minify: false,
});
if (!result.success) {
  console.error(result.logs.join('\n'));
  process.exit(1);
}
cpSync(join(root, '../next-design/generated/tokens.css'), join(out, 'tokens.css'));
cpSync(join(root, 'src/cards.css'), join(out, 'cards.css'));
cpSync(join(root, '../../apps/next-web/public/artwork'), join(out, 'artwork'), { recursive: true });

writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zine Next item cards</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="cards.css">
<style>
body { margin: 0; font-family: var(--zn-font); }
.mode { padding: 32px; background: var(--zn-color-canvas); color: var(--zn-color-ink); }
h1 { margin: 0 0 24px; font: 700 32px/1 var(--zn-font); letter-spacing: -0.04em; }
h2 { margin: 40px 0 8px; font: 700 21px/1.1 var(--zn-font); letter-spacing: -0.03em; }
h3 { margin: 28px 0 12px; font: 500 13px/1.4 var(--zn-font); color: var(--zn-color-muted); }
.row { display: flex; flex-wrap: wrap; gap: 24px 16px; align-items: flex-start; }
.row.split { gap: 40px; }
.list { display: flex; flex-direction: column; gap: 24px; }
.bento { display: grid; grid-template-columns: repeat(4, 188px); grid-template-rows: repeat(2, 258px); gap: 16px; }
</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="app.js"></script>
</body>
</html>
`
);
console.log(`Built ${join(out, 'index.html')}`);
