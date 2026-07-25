import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';

import { extractVisibleListMembers } from './list-members-extractor.mjs';

describe('list member extractor', () => {
  it('extracts unique usernames only from mounted user cells', () => {
    const { document, window } = parseHTML(`
      <div data-testid="UserCell"><a href="/Alice">Alice</a></div>
      <div data-testid="UserCell"><a href="/bob">Bob</a><a href="/bob/status/1">post</a></div>
      <div data-testid="UserCell"><a href="/Alice">Alice again</a></div>
      <article data-testid="tweet"><a href="/not-a-member">Ignore</a></article>
    `);
    globalThis.document = document;
    globalThis.window = window;

    expect(extractVisibleListMembers()).toEqual(['alice', 'bob']);
  });
});
