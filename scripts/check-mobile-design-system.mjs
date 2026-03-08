import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const componentRoot = path.join(repoRoot, 'apps/mobile/components');
const baselinePath = path.join(repoRoot, 'scripts/mobile-design-system-baseline.json');

const colorPattern = /#[0-9A-Fa-f]{3,8}|rgba?\(/;
const typographyPattern = /\b(fontSize|lineHeight|letterSpacing)\s*:\s*-?\d/;
const legacyImportPattern = /from ['"]@\/components\/(home\/|themed-|ui\/)/;

const trackedIndexFiles = new Set(['apps/mobile/components/icons/index.tsx']);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isTrackedComponentFile(relativePath) {
  const extension = path.extname(relativePath);
  const baseName = path.basename(relativePath);

  if (!['.ts', '.tsx'].includes(extension)) {
    return false;
  }

  if (
    baseName.endsWith('.stories.tsx') ||
    baseName.endsWith('.test.tsx') ||
    baseName.endsWith('.test.ts')
  ) {
    return false;
  }

  if (
    relativePath.includes('/home/') ||
    relativePath.includes('/ui/') ||
    relativePath.includes('/storybook/')
  ) {
    return false;
  }

  if (baseName.startsWith('themed-')) {
    return false;
  }

  if (baseName === 'index.ts' || baseName === 'index.tsx') {
    return trackedIndexFiles.has(relativePath);
  }

  return true;
}

function hasExceptionComment(line, previousLine) {
  return (
    line.includes('design-system-exception') || previousLine?.includes('design-system-exception')
  );
}

function createIssue(relativePath, lineNumber, line, rule) {
  const trimmedLine = line.trim();

  return {
    id: `${relativePath}::${trimmedLine}`,
    location: `${relativePath}:${lineNumber}`,
    preview: trimmedLine,
    rule,
  };
}

function collectFiles(dirPath) {
  const files = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(nextPath));
      continue;
    }

    files.push(nextPath);
  }

  return files;
}

function collectIssues() {
  const issues = {
    color: [],
    typography: [],
    missingStory: [],
    legacyImport: [],
  };

  for (const absolutePath of collectFiles(componentRoot)) {
    const relativePath = toPosixPath(path.relative(repoRoot, absolutePath));

    if (!isTrackedComponentFile(relativePath)) {
      continue;
    }

    const fileContents = fs.readFileSync(absolutePath, 'utf8');
    const lines = fileContents.split('\n');

    lines.forEach((line, index) => {
      const previousLine = index > 0 ? lines[index - 1] : undefined;

      if (!line.trim() || hasExceptionComment(line, previousLine)) {
        return;
      }

      if (colorPattern.test(line)) {
        issues.color.push(createIssue(relativePath, index + 1, line, 'color'));
      }

      if (typographyPattern.test(line)) {
        issues.typography.push(createIssue(relativePath, index + 1, line, 'typography'));
      }

      if (legacyImportPattern.test(line)) {
        issues.legacyImport.push(createIssue(relativePath, index + 1, line, 'legacyImport'));
      }
    });

    const extension = path.extname(relativePath);
    const storyPath = path.join(
      repoRoot,
      path.dirname(relativePath),
      `${path.basename(relativePath, extension)}.stories.tsx`
    );

    if (!fs.existsSync(storyPath)) {
      issues.missingStory.push({
        id: relativePath,
        location: relativePath,
        preview: 'missing .stories.tsx file',
        rule: 'missingStory',
      });
    }
  }

  for (const key of Object.keys(issues)) {
    const deduped = new Map();

    for (const issue of issues[key]) {
      deduped.set(issue.id, issue);
    }

    issues[key] = [...deduped.values()].sort((left, right) =>
      left.location.localeCompare(right.location)
    );
  }

  return issues;
}

function compareWithBaseline(issues, baseline) {
  const failures = [];
  const staleBaselineEntries = [];

  for (const [rule, items] of Object.entries(issues)) {
    const baselineEntries = new Set(baseline[rule] ?? []);
    const currentEntries = new Set(items.map((item) => item.id));

    for (const item of items) {
      if (!baselineEntries.has(item.id)) {
        failures.push(item);
      }
    }

    for (const baselineEntry of baselineEntries) {
      if (!currentEntries.has(baselineEntry)) {
        staleBaselineEntries.push({ rule, id: baselineEntry });
      }
    }
  }

  return { failures, staleBaselineEntries };
}

function printIssues(label, issues) {
  if (issues.length === 0) {
    return;
  }

  console.error(`\n${label}`);

  for (const issue of issues) {
    console.error(`- ${issue.location}`);
    console.error(`  ${issue.preview}`);
  }
}

const baseline = readJson(baselinePath);
const issues = collectIssues();
const { failures, staleBaselineEntries } = compareWithBaseline(issues, baseline);

if (staleBaselineEntries.length > 0) {
  console.warn('mobile-design-system: baseline contains entries that are no longer present.');
  for (const entry of staleBaselineEntries) {
    console.warn(`- ${entry.rule}: ${entry.id}`);
  }
}

if (failures.length > 0) {
  console.error(
    'mobile-design-system: found design-system violations not in the approved baseline.'
  );
  console.error(
    'Add semantic tokens or Storybook coverage instead of adding new one-off styles. For intentional exceptions, add a nearby `design-system-exception:` comment.'
  );

  printIssues(
    'New raw color literals',
    failures.filter((issue) => issue.rule === 'color')
  );
  printIssues(
    'New ad hoc typography literals',
    failures.filter((issue) => issue.rule === 'typography')
  );
  printIssues(
    'Missing Storybook stories',
    failures.filter((issue) => issue.rule === 'missingStory')
  );
  printIssues(
    'Legacy component imports',
    failures.filter((issue) => issue.rule === 'legacyImport')
  );

  process.exitCode = 1;
} else {
  console.log('mobile-design-system: OK');
}
