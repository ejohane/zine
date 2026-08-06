import { createHash } from 'node:crypto';

const MAX_SLUG_BASE_LENGTH = 35;

export type PreviewTarget = {
  hostname: string;
  id: string;
  url: string;
  workerName: string;
};

export function createPreviewTarget(ref: string): PreviewTarget {
  const normalizedRef = ref.trim();
  if (!normalizedRef || normalizedRef === 'main' || normalizedRef === 'refs/heads/main') {
    throw new Error('A non-main branch ref is required for a preview deployment.');
  }

  const withoutPrefix = normalizedRef.replace(/^refs\/heads\//, '');
  const base = withoutPrefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_BASE_LENGTH)
    .replace(/-+$/g, '');

  if (!base) {
    throw new Error('The branch ref does not contain any deployable characters.');
  }

  const digest = createHash('sha256').update(withoutPrefix).digest('hex').slice(0, 8);
  const id = `${base}-${digest}`;
  const hostname = `${id}.preview.myzine.app`;

  return {
    hostname,
    id,
    url: `https://${hostname}`,
    workerName: `zine-web-preview-${id}`,
  };
}

if (import.meta.main) {
  const target = createPreviewTarget(process.argv[2] || '');
  const output = Object.entries(target)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  if (process.env.GITHUB_OUTPUT) {
    await Bun.write(process.env.GITHUB_OUTPUT, `${output}\n`, { createPath: true });
  } else {
    console.log(JSON.stringify(target));
  }
}
