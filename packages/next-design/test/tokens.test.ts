import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { outputs } from '../scripts/generate';
import { color, contrast, tokens, type ColorRole, type Mode } from '../src/index';

const modes: Mode[] = ['day', 'night'];

describe('tokens', () => {
  test('every color role has a 6-digit hex for day and night', () => {
    for (const role of Object.keys(tokens.color) as ColorRole[]) {
      for (const mode of modes) {
        expect(color(role, mode)).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  const textPairs: [ColorRole, ColorRole][] = [
    ['ink', 'canvas'],
    ['muted', 'canvas'],
    ['accentText', 'canvas'],
    ['onAccent', 'accent'],
    ['onRaised', 'raised'],
    ['onRaisedMuted', 'raised'],
    ['ink', 'bubble'],
  ];
  for (const mode of modes) {
    for (const [fg, bg] of textPairs) {
      test(`${fg} on ${bg} meets 4.5:1 in ${mode}`, () => {
        expect(contrast(color(fg, mode), color(bg, mode))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('generated files', () => {
  for (const [path, render] of Object.entries(outputs)) {
    test(`${path} is up to date (run \`bun run generate\`)`, () => {
      expect(readFileSync(join(import.meta.dir, '..', path), 'utf8')).toBe(render());
    });
  }
});
