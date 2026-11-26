import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import type { ReactNode } from 'react';
import type { act as Act } from 'react';
import type * as ReactDomClient from 'react-dom/client';
import { ItemCard } from '../src/index';
import type { CardItem, CardSize } from '../src/index';
import * as f from './fixtures';

/** A real DOM, so the cards receive the same `error` events a browser fires for a dead image. */
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const globals = {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
};
const scope = globalThis as unknown as Record<string, unknown>;
const previous = new Map<string, unknown>();
let client: typeof ReactDomClient;
let act: typeof Act;
let root: ReactDomClient.Root | undefined;
let host: HTMLElement;

beforeAll(async () => {
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, scope[name]);
    scope[name] = value;
  }
  client = await import('react-dom/client');
  act = (await import('react')).act;
});
/** Unmounts the card, so the next one starts with no memory of failed URLs. */
async function reset() {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
}
afterEach(reset);
afterAll(() => {
  for (const [name, value] of previous) {
    if (value === undefined) delete scope[name];
    else scope[name] = value;
  }
});

async function show(node: ReactNode) {
  if (!root) {
    host = dom.window.document.createElement('div');
    dom.window.document.body.append(host);
    root = client.createRoot(host);
  }
  await act(async () => root!.render(node));
  return host;
}
const card = (item: CardItem, size: CardSize) => <ItemCard item={item} size={size} now={f.NOW} />;
const images = (selector = 'img') => [...host.querySelectorAll<HTMLImageElement>(selector)];
async function fail(image: Element | undefined) {
  expect(image).toBeDefined();
  await act(async () => {
    image!.dispatchEvent(new dom.window.Event('error'));
  });
}
const avatarUrl = 'https://example.test/avatar.jpg';
const withAvatar = (item: CardItem): CardItem => ({
  ...item,
  creator: { ...item.creator, avatarUrl },
});
const sizes: CardSize[] = ['large', 'compact', 'tile', 'tall'];

describe('a picture that fails to load never leaves a broken image', () => {
  test('a broken avatar becomes the letter avatar, leaving the cover alone', async () => {
    await show(card(withAvatar(f.article), 'large'));
    expect(images('img.zn-card__avatar')).toHaveLength(1);
    await fail(images('img.zn-card__avatar')[0]);
    expect(images('img.zn-card__avatar')).toHaveLength(0);
    const letter = host.querySelector('span.zn-card__avatar');
    expect(letter?.textContent).toBe('F');
    expect(letter?.getAttribute('aria-hidden')).toBe('true');
    expect(images('.zn-card__stage img')).toHaveLength(1);
  });

  test('a broken tile picture becomes the empty letter stage', async () => {
    for (const item of [f.video, f.podcast, f.article]) {
      await reset();
      await show(card(item, 'tile'));
      await fail(images('.zn-card__stage img')[0]);
      expect(images()).toHaveLength(0);
      const stage = host.querySelector('.zn-card__stage');
      expect(stage?.classList.contains('zn-card__stage--empty')).toBe(true);
      expect(stage?.textContent).toBe(item.creator.name.slice(0, 1));
    }
  });

  test('a podcast backdrop and cover fail together', async () => {
    await show(card(f.podcast, 'large'));
    expect(images('.zn-card__stage--cover img')).toHaveLength(2);
    await fail(images('img.zn-card__cover')[0]);
    expect(images()).toHaveLength(0);
    // Re-rendered as a tile, the same dead URL is not tried again.
    await show(card(f.podcast, 'tile'));
    expect(host.querySelector('.zn-card__stage--empty')).not.toBeNull();
  });

  for (const size of ['large', 'tall'] as const)
    test(`a ${size} article with a broken picture becomes the text-led card`, async () => {
      await show(card(f.article, size));
      expect(host.querySelector('.zn-card--no-picture')).toBeNull();
      await fail(images('.zn-card__stage img')[0]);
      expect(images()).toHaveLength(0);
      expect(host.querySelector('.zn-card__stage')).toBeNull();
      expect(host.querySelector('article')?.classList.contains('zn-card--no-picture')).toBe(true);
      // The article's own words replace the muted summary, exactly as with no picture at all.
      const words = host.querySelector('.zn-card__content--words');
      expect(words?.textContent).toContain('For a decade');
      expect(host.querySelector('.zn-card__title')?.textContent).toBe(f.article.title);
      expect(host.querySelector('.zn-card__footer')).not.toBeNull();
    });

  test('broken compact thumbs are hidden', async () => {
    for (const item of [f.video, f.podcast, f.article, f.postWideVideo]) {
      await reset();
      await show(card(item, 'compact'));
      await fail(images('img.zn-card__thumb')[0]);
      expect(images()).toHaveLength(0);
      expect(host.querySelector('.zn-card__text')).not.toBeNull();
    }
  });

  test('broken post media is hidden at every size and layout', async () => {
    for (const item of [f.postWideVideo, f.postTallVideo])
      for (const size of ['large', 'tile', 'tall'] as const) {
        await reset();
        await show(card(item, size));
        const media = images('img.zn-card__media, .zn-card__media-panel img');
        expect(media).toHaveLength(1);
        await fail(media[0]);
        expect(images()).toHaveLength(0);
        expect(host.querySelector('.zn-card__media-panel')).toBeNull();
        expect(host.querySelector('.zn-card__beside')).toBeNull();
        expect(host.textContent).toContain('The best tools disappear');
        // It is still a video post, so its footer keeps saying so.
        expect(host.querySelector('.zn-card__meta')?.textContent).toContain('Video');
      }
  });

  test('a broken quote picture is hidden without touching the quote', async () => {
    await show(card(f.postQuote, 'tall'));
    await fail(images('img.zn-card__quote-picture')[0]);
    expect(images()).toHaveLength(0);
    expect(host.querySelector('.zn-card__quote-text')?.textContent).toBe(
      'A field guide to getting lost.'
    );
  });

  test('every image on every card and size has a fallback', async () => {
    const withQuoteAvatar: CardItem = {
      ...f.postQuote,
      quote: { ...f.postQuote.quote!, creator: { ...f.postQuote.quote!.creator, avatarUrl } },
    };
    const items = [
      f.video,
      f.podcast,
      f.article,
      f.postWideVideo,
      f.postTallVideo,
      withQuoteAvatar,
    ].map(withAvatar);
    for (const item of items)
      for (const size of sizes) {
        await reset();
        await show(card(item, size));
        // Failing one image can remove others, so keep going until none are left.
        for (let guard = 0; images().length && guard < 10; guard++) await fail(images()[0]);
        expect(images()).toHaveLength(0);
        expect(host.querySelector('.zn-card__link')?.getAttribute('href')).toBe(item.url);
      }
  });

  test('a new URL is tried again after the old one failed', async () => {
    await show(card(withAvatar(f.article), 'tile'));
    await fail(images('.zn-card__stage img')[0]);
    await fail(images('img.zn-card__avatar')[0]);
    expect(images()).toHaveLength(0);

    const next = 'https://example.test/replacement.jpg';
    await show(
      card(
        {
          ...f.article,
          picture: { ...f.article.picture!, url: next },
          creator: { ...f.article.creator, avatarUrl: next },
        },
        'tile'
      )
    );
    expect(images('.zn-card__stage img')[0]?.getAttribute('src')).toBe(next);
    expect(images('img.zn-card__avatar')[0]?.getAttribute('src')).toBe(next);
    expect(host.querySelector('.zn-card__stage--empty')).toBeNull();

    // The same failed URL stays failed across re-renders.
    await fail(images('.zn-card__stage img')[0]);
    await show(
      card(
        { ...f.article, title: 'Renamed', picture: { ...f.article.picture!, url: next } },
        'tile'
      )
    );
    expect(host.querySelector('.zn-card__stage--empty')).not.toBeNull();
  });
});
