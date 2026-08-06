import { describe, expect, test } from 'bun:test';

import { createPreviewTarget } from './preview-target';

describe('createPreviewTarget', () => {
  test('creates a stable, Cloudflare-safe target for a branch', () => {
    const target = createPreviewTarget('codex/library-workbench-web');

    expect(target.id).toMatch(/^codex-library-workbench-web-[0-9a-f]{8}$/);
    expect(target.workerName).toBe(`zine-web-preview-${target.id}`);
    expect(target.hostname).toBe(`${target.id}.preview.myzine.app`);
    expect(target.url).toBe(`https://${target.hostname}`);
  });

  test('adds a digest so similarly normalized refs do not collide', () => {
    expect(createPreviewTarget('feature/one').id).not.toBe(createPreviewTarget('feature-one').id);
  });

  test('keeps Worker and DNS labels within platform limits', () => {
    const target = createPreviewTarget(`feature/${'very-long-name-'.repeat(12)}`);

    expect(target.id.length).toBeLessThanOrEqual(44);
    expect(target.workerName.length).toBeLessThanOrEqual(63);
    expect(target.hostname.split('.')[0]!.length).toBeLessThanOrEqual(63);
  });

  test('rejects production and unusable refs', () => {
    expect(() => createPreviewTarget('main')).toThrow('non-main branch');
    expect(() => createPreviewTarget('refs/heads/main')).toThrow('non-main branch');
    expect(() => createPreviewTarget('///')).toThrow('deployable characters');
  });
});
