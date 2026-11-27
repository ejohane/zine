import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DestinationNav } from './DestinationNav';

describe('DestinationNav markup', () => {
  const markup = renderToStaticMarkup(
    <DestinationNav current="Library" choose={() => {}} capture={() => {}} />
  );

  test('names every destination and marks only the current one', () => {
    for (const name of ['Home', 'Inbox', 'Library', 'Search'])
      expect(markup).toContain(`aria-label="${name}"`);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-label="Library"[^>]*aria-current="page"/);
  });

  test('keeps Save outside the destinations', () => {
    const nav = markup.slice(markup.indexOf('<nav'), markup.indexOf('</nav>'));
    expect(markup).toContain('aria-label="Save a link"');
    expect(nav).not.toContain('Save a link');
    expect(nav).toContain('aria-label="Destinations"');
  });
});
