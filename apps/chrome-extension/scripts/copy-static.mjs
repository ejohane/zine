import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(root, '..');
const repoRoot = join(extensionRoot, '..', '..');
const dist = join(extensionRoot, 'dist');
const compiled = join(dist, '.compiled');

const staticFiles = [
  ['public/popup.html', 'popup.html'],
  ['public/options.html', 'options.html'],
  ['public/styles.css', 'styles.css'],
];

const manifestTemplate = JSON.parse(
  await readFile(join(extensionRoot, 'public', 'manifest.json'), 'utf8')
);

const variants = {
  chrome: {
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
  },
  firefox: {
    background: {
      scripts: ['background.js'],
      type: 'module',
    },
    browser_specific_settings: {
      gecko: {
        id: 'zine-bookmark-saver@myzine.app',
        strict_min_version: '121.0',
      },
    },
  },
};

for (const [browser, overrides] of Object.entries(variants)) {
  const targetRoot = join(dist, browser);
  await mkdir(join(targetRoot, 'icons'), { recursive: true });
  await cp(compiled, targetRoot, { recursive: true });

  for (const [source, target] of staticFiles) {
    await copyFile(join(extensionRoot, source), join(targetRoot, target));
  }

  await copyFile(join(repoRoot, 'zine-logo.png'), join(targetRoot, 'icons', 'zine-logo.png'));

  const manifest = {
    ...manifestTemplate,
    ...overrides,
    version: process.env.npm_package_version ?? manifestTemplate.version,
  };
  await writeFile(join(targetRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
