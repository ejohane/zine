import { describe, expect, it } from 'vitest';
import { parsePublishedTranscript } from '../src/providers/transcript';
describe('publisher-provided transcript formats', () => {
  it('retains VTT and SRT cue timings while removing markup', () => {
    expect(
      parsePublishedTranscript(
        'WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000 align:start\nHello <b>world</b>\n\n2\n00:00:03.100 --> 00:00:05.000\nA second thought.',
        'text/vtt'
      ).segments
    ).toEqual([
      { text: 'Hello world', startSeconds: 1.5, endSeconds: 3 },
      { text: 'A second thought.', startSeconds: 3.1, endSeconds: 5 },
    ]);
    expect(
      parsePublishedTranscript(
        '1\n00:01:01,000 --> 00:01:03,500\nSubtitle text\n',
        'application/x-subrip'
      ).segments[0]
    ).toEqual({ text: 'Subtitle text', startSeconds: 61, endSeconds: 63.5 });
  });
  it('supports podcast JSON and timed text XML without inventing timestamps for plain text', () => {
    expect(
      parsePublishedTranscript(
        JSON.stringify({
          segments: [{ startTime: 1.2, endTime: 3.4, body: 'Actual words', speaker: 'Person' }],
        }),
        'application/json'
      ).segments
    ).toEqual([{ text: 'Actual words', startSeconds: 1.2, endSeconds: 3.4, speaker: 'Person' }]);
    expect(
      parsePublishedTranscript(
        '<transcript><text start="1.2" dur="2.3">Words &amp; context</text></transcript>',
        'text/xml'
      ).segments[0]
    ).toEqual({ text: 'Words & context', startSeconds: 1.2, endSeconds: 3.5 });
    expect(parsePublishedTranscript('An untimed transcript.', 'text/plain').segments).toEqual([
      { text: 'An untimed transcript.' },
    ]);
  });
  it('reads a publisher HTML transcript while preserving speaker names and avoiding invented times', () => {
    const transcript = parsePublishedTranscript(
      '<html><body><nav>Menu</nav><cite>Speaker One:</cite><p>A real explanation.</p><cite>Speaker Two:</cite><p>A response.</p></body></html>',
      'text/html'
    );
    expect(transcript.segments).toEqual([
      { text: 'A real explanation.', speaker: 'Speaker One' },
      { text: 'A response.', speaker: 'Speaker Two' },
    ]);
  });
  it('rejects entity declarations, malformed JSON and empty or reversed cues', () => {
    expect(() =>
      parsePublishedTranscript('<!DOCTYPE transcript><transcript/>', 'text/xml')
    ).toThrow();
    expect(() => parsePublishedTranscript('{invalid', 'application/json')).toThrow();
    expect(() => parsePublishedTranscript('00:02 --> 00:01\nInvalid cue', 'text/vtt')).toThrow();
  });
});
