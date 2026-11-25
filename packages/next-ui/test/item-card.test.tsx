import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { footerLabel, formatDuration, formatSaved, ItemCard } from '../src/index';
import type { CardItem, CardSize } from '../src/index';
import * as f from './fixtures';

const sizes: CardSize[] = ['large', 'compact', 'tile', 'tall'];
const html = (item: CardItem, size: CardSize) =>
  renderToStaticMarkup(<ItemCard item={item} size={size} now={f.NOW} />);
const at = (markup: string, needle: string) => markup.indexOf(needle);

describe('formatting', () => {
  test('durations', () => {
    expect(formatDuration(13)).toBe('13 min');
    expect(formatDuration(87)).toBe('1 h 27 min');
    expect(formatDuration(120)).toBe('2 h');
  });

  test('saved labels', () => {
    const saved = (iso: string) => formatSaved(iso, f.NOW);
    expect(saved('2026-11-25T11:59:40Z')).toBe('Saved just now');
    expect(saved('2026-11-25T11:52:00Z')).toBe('Saved 8m ago');
    expect(saved('2026-11-25T10:00:00Z')).toBe('Saved 2h ago');
    expect(saved('2026-11-23T12:00:00Z')).toBe('Saved 2d ago');
    expect(saved('2026-11-11T12:00:00Z')).toBe('Saved 2w ago');
    expect(saved('2026-09-20T12:00:00Z')).toBe('Saved 2mo ago');
  });

  test('footer label per kind', () => {
    expect(footerLabel(f.video, f.NOW)).toBe('1 h 27 min · Saved 2d ago');
    expect(footerLabel(f.article, f.NOW)).toBe('12 min read · Saved 1h ago');
    expect(footerLabel(f.post, f.NOW)).toBe('Saved 1mo ago');
    expect(footerLabel(f.postWideVideo, f.NOW)).toBe('Video · Saved 1mo ago');
  });
});

describe('one order on every card: title, creator, content, footer', () => {
  for (const item of [f.video, f.podcast, f.article, f.articleNoPicture, f.postTitled]) {
    for (const size of sizes) {
      test(`${item.id} at ${size}`, () => {
        const markup = html(item, size);
        const title = at(markup, 'zn-card__title');
        const creator = at(markup, 'zn-card__creator');
        const content = at(markup, 'zn-card__fill');
        const footer = at(markup, 'zn-card__footer');
        expect(title).toBeGreaterThan(-1);
        expect(creator).toBeGreaterThan(title);
        expect(content).toBeGreaterThan(creator);
        expect(footer).toBeGreaterThan(content);
      });
    }
  }

  test('a post with no title starts with its creator', () => {
    const markup = html(f.post, 'large');
    expect(markup).not.toContain('zn-card__title');
    expect(at(markup, 'zn-card__fill')).toBeGreaterThan(at(markup, 'zn-card__creator'));
    expect(markup).toContain('@mara');
  });
});

describe('pictures', () => {
  test('video and article pictures lead the card; a podcast cover is shown whole on a blurred copy', () => {
    for (const item of [f.video, f.article]) {
      const markup = html(item, 'large');
      expect(at(markup, 'zn-card__stage')).toBeLessThan(at(markup, 'zn-card__text'));
    }
    const podcast = html(f.podcast, 'tile');
    expect(podcast).toContain('zn-card__backdrop');
    expect(podcast).toContain('zn-card__cover');
  });

  test('compact: playable things keep the picture on the left, readable things on the right', () => {
    for (const item of [f.video, f.podcast]) {
      const markup = html(item, 'compact');
      expect(at(markup, 'zn-card__thumb')).toBeLessThan(at(markup, 'zn-card__text'));
    }
    for (const item of [f.article, f.postWideVideo]) {
      const markup = html(item, 'compact');
      expect(at(markup, 'zn-card__thumb')).toBeGreaterThan(at(markup, 'zn-card__footer'));
    }
  });

  test('an article with no picture is all text when large, and keeps a picture area as a tile', () => {
    const large = html(f.articleNoPicture, 'large');
    expect(large).not.toContain('zn-card__stage');
    expect(large).toContain('zn-card__content--words');
    expect(large).toContain('go where the audience already is');
    expect(html(f.articleNoPicture, 'tile')).toContain('zn-card__stage--empty');
  });

  test('an article with a picture shows the summary, not its body', () => {
    const markup = html(f.article, 'large');
    expect(markup).toContain('hand-built corners');
    expect(markup).not.toContain('go where the audience already is');
  });
});

describe('posts', () => {
  test('wide media goes under the words; tall media goes beside them at large size', () => {
    const wide = html(f.postWideVideo, 'large');
    expect(wide).not.toContain('zn-card__beside');
    expect(at(wide, 'zn-card__media')).toBeGreaterThan(at(wide, 'zn-card__fill'));
    expect(html(f.postTallVideo, 'large')).toContain('zn-card__beside');
    expect(html(f.postTallVideo, 'tile')).toContain('zn-card__media-panel');
  });

  test('a quoted post sits in its own panel, with its picture only on the tall card', () => {
    expect(html(f.postQuote, 'large')).toContain('zn-card__quote');
    expect(html(f.postQuote, 'large')).not.toContain('zn-card__quote-picture');
    expect(html(f.postQuote, 'tall')).toContain('zn-card__quote-picture');
    expect(html(f.postQuote, 'compact')).toContain('Quoting @atlas · Saved 1mo ago');
  });

  test('a link gets a bar, and short posts are set larger', () => {
    expect(html(f.postLink, 'large')).toContain('zn-card__link-bar');
    expect(html(f.postLink, 'large')).toContain('zn-card__content--loud');
    expect(html(f.post, 'large')).not.toContain('zn-card__content--loud');
    expect(html(f.postLink, 'tile')).not.toContain('zn-card__content--loud');
    expect(html({ ...f.postWideVideo, body: 'Watch this.' }, 'large')).not.toContain(
      'zn-card__content--loud'
    );
  });
});

describe('the card as a control', () => {
  test('the whole card links to the original and names what it opens', () => {
    expect(html(f.video, 'tile')).toContain('href="https://example.test/watch/1"');
    expect(html(f.video, 'tile')).toContain(
      'aria-label="Open Building a boat from one sheet of plywood"'
    );
    expect(html(f.post, 'tile')).toContain('aria-label="Open Post by Mara Lind"');
  });

  test('every card has one action button', () => {
    for (const size of sizes) {
      expect(html(f.podcast, size).match(/aria-label="More actions"/g)).toHaveLength(1);
    }
  });

  test('size classes', () => {
    expect(html(f.video, 'tall')).toContain('zn-card--tall');
    const narrow = renderToStaticMarkup(
      <ItemCard item={f.article} size="tall" tallWidth="narrow" now={f.NOW} />
    );
    expect(narrow).toContain('zn-card--narrow');
  });
});
