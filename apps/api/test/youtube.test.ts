import { describe, expect, it } from 'vitest';
import { embeddedObject, parseTimedTranscript } from '../src/providers/youtube';

describe('YouTube source data parsing', () => {
  it('extracts balanced JSON with escaped quotes and literal braces', () => {
    const value = {
      videoDetails: {
        title: 'A } and "quoted" title',
        shortDescription: 'Escapes \\ and { braces',
      },
    };
    expect(
      embeddedObject(
        `before;var ytInitialPlayerResponse = ${JSON.stringify(value)}; after;`,
        'ytInitialPlayerResponse'
      )
    ).toEqual(value);
    expect(embeddedObject('no player here', 'ytInitialPlayerResponse')).toBeNull();
  });
  it('retains caption timing and ignores empty events', () => {
    expect(
      parseTimedTranscript({
        events: [
          { tStartMs: 1200, dDurationMs: 2400, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
          { tStartMs: 4000, segs: [{ utf8: '\n' }] },
        ],
      })
    ).toEqual({
      segments: [{ text: 'Hello world', startSeconds: 1.2, endSeconds: 3.5999999999999996 }],
    });
  });
});

import { descriptionChapters, isoDuration } from '../src/providers/youtube-api';
it('parses official API durations and explicit description chapter timestamps', () => {
  expect(isoDuration('PT1H2M3S')).toBe(3723);
  expect(isoDuration('P1DT2H')).toBe(93600);
  expect(isoDuration('garbage')).toBeUndefined();
  expect(
    descriptionChapters(
      'Intro\n00:00 Opening\n12:34 Architecture\n1:02:03 Wrap-up\n1:99:00 Invalid'
    )
  ).toEqual([
    { startSeconds: 0, title: 'Opening' },
    { startSeconds: 754, title: 'Architecture' },
    { startSeconds: 3723, title: 'Wrap-up' },
  ]);
});
