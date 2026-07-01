import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(root, '..');
const dist = join(extensionRoot, 'dist');

const packages = [
  {
    source: join(dist, 'chrome'),
    target: join(dist, 'zine-chrome.zip'),
  },
  {
    source: join(dist, 'firefox'),
    target: join(dist, 'zine-firefox.xpi'),
  },
];

for (const extensionPackage of packages) {
  await rm(extensionPackage.target, { force: true });
  await execFileAsync('zip', ['-qr', extensionPackage.target, '.'], {
    cwd: extensionPackage.source,
  });
}

console.log('Created browser extension packages:');
for (const extensionPackage of packages) {
  console.log(`- ${extensionPackage.target}`);
}
