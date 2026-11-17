import { describe, expect, it } from 'vitest';
import { newToken, slugFor } from '../scripts/preview';

describe('branch previews', () => {
  it('turns branch names into short DNS-safe slugs', () => {
    expect(slugFor('next-home-redesign')).toBe('next-home-redesign');
    expect(slugFor('refs/heads/Feature/Big_Change!!')).toBe('feature-big-change');
    expect(slugFor('a-very-long-branch-name-that-keeps-going')).toBe('a-very-long-branch-n');
    expect(slugFor('ends-with-dash-at-twenty-x')).not.toMatch(/-$/);
    expect(() => slugFor('---')).toThrow();
  });

  it('mints random API-shaped agent tokens', () => {
    const one = newToken();
    expect(one).toMatch(/^zine2_[a-f0-9]{64}$/);
    expect(newToken()).not.toBe(one);
  });
});
