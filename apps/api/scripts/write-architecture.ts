import { writeFile } from 'node:fs/promises';
import { architectureGuide } from '../src/architecture';
await writeFile('docs/architecture.html', architectureGuide());
console.log(
  'Wrote docs/architecture.html — self-contained; no external dependencies or live requests.'
);
