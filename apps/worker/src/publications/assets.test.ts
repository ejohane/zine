import { describe, expect, it } from 'vitest';
import { stripCoverMetadata } from './assets';

describe('public cover metadata boundary', () => {
  it('removes application/comment segments while retaining encoded image data', () => {
    const bytes = new Uint8Array([
      255, 216, 255, 224, 0, 4, 1, 2, 255, 225, 0, 6, 3, 4, 5, 6, 255, 237, 0, 4, 7, 8, 255, 254, 0,
      4, 9, 10, 255, 219, 0, 4, 11, 12, 255, 218, 0, 2, 13, 255, 0, 14, 255, 217,
    ]);
    expect(stripCoverMetadata(bytes)).toEqual(
      new Uint8Array([255, 216, 255, 219, 0, 4, 11, 12, 255, 218, 0, 2, 13, 255, 0, 14, 255, 217])
    );
  });
  it('rejects non-JPEG and truncated encoder output', () => {
    for (const bytes of [
      [1, 2, 3],
      [255, 216, 255, 225, 0, 9, 1],
      [255, 216],
    ])
      expect(() => stripCoverMetadata(new Uint8Array(bytes))).toThrow();
  });
});
