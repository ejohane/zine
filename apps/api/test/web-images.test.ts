import { describe, expect, it } from 'vitest';
import { extractWebDocument } from '../src/providers/web';

const text = 'A paragraph about reliable systems that is long enough to be an article. '.repeat(12);
const body = (extra = '') =>
  `<article><h1>Title</h1><p>${text}</p>${extra}<p>${text}</p></article>`;
const jsonLd = (value: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
function extract(head: string, content = body(), url = 'https://publisher.example/posts/article') {
  const result = extractWebDocument({
    url,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: `<html><head><title>Title</title>${head}</head><body><main>${content}</main></body></html>`,
  });
  const values = (field: string) =>
    result.contributions.filter((value) => value.field === field).map((value) => value.value);
  return { thumbnails: values('thumbnail'), avatars: values('creatorImageUrl') };
}

describe('web article cover fallbacks', () => {
  const social = '<meta property="og:image" content="/og.png">';
  const twitter = '<meta name="twitter:image" content="https://cdn.example/twitter.png">';
  const structured = jsonLd({ '@type': 'Article', image: 'https://cdn.example/ld.png' });
  const linked = '<link rel="image_src" href="/image-src.png">';
  const inline = body('<img src="/inline.jpg" width="800" height="450" alt="A diagram">');

  it('uses exactly one cover in priority order: social card, JSON-LD, image_src, article image', () => {
    expect(extract(social + twitter + structured + linked, inline).thumbnails).toEqual([
      'https://publisher.example/og.png',
    ]);
    expect(extract(twitter + structured + linked, inline).thumbnails).toEqual([
      'https://cdn.example/twitter.png',
    ]);
    expect(extract(structured + linked, inline).thumbnails).toEqual(['https://cdn.example/ld.png']);
    expect(extract(linked, inline).thumbnails).toEqual(['https://publisher.example/image-src.png']);
    expect(extract('', inline).thumbnails).toEqual(['https://publisher.example/inline.jpg']);
    expect(extract('').thumbnails).toEqual([]);
  });

  it('reads JSON-LD images as a string, an array or an ImageObject', () => {
    const cover = (image: unknown) => extract(jsonLd({ '@type': 'BlogPosting', image })).thumbnails;
    expect(cover('/relative.png')).toEqual(['https://publisher.example/relative.png']);
    expect(cover(['https://cdn.example/first.png', 'https://cdn.example/second.png'])).toEqual([
      'https://cdn.example/first.png',
    ]);
    expect(cover({ '@type': 'ImageObject', url: 'https://cdn.example/object.png' })).toEqual([
      'https://cdn.example/object.png',
    ]);
    expect(
      cover({ '@type': 'ImageObject', contentUrl: 'https://cdn.example/content.png' })
    ).toEqual(['https://cdn.example/content.png']);
    expect(cover([{ '@type': 'ImageObject', url: 'https://cdn.example/nested.png' }])).toEqual([
      'https://cdn.example/nested.png',
    ]);
  });

  it('prefers the Article image, then any top-level or @graph object, never a nested author image', () => {
    expect(
      extract(
        jsonLd({
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', image: 'https://cdn.example/site.png' },
            { '@type': 'Article', image: 'https://cdn.example/article.png' },
          ],
        })
      ).thumbnails
    ).toEqual(['https://cdn.example/article.png']);
    expect(
      extract(
        jsonLd({
          '@graph': [
            { '@type': 'Article', author: { name: 'Writer' } },
            { '@type': 'WebPage', image: { url: 'https://cdn.example/page.png' } },
          ],
        })
      ).thumbnails
    ).toEqual(['https://cdn.example/page.png']);
    expect(
      extract(jsonLd([{ '@type': 'WebPage', image: 'https://cdn.example/top-level.png' }]))
        .thumbnails
    ).toEqual(['https://cdn.example/top-level.png']);
    expect(
      extract(
        jsonLd({
          '@type': 'Article',
          author: { name: 'Writer', image: 'https://cdn.example/face.png' },
        })
      ).thumbnails
    ).toEqual([]);
  });

  it('skips small, inline-data, SVG and decorative images when choosing an article image', () => {
    const skipped = [
      '<img src="/small.jpg" width="120" height="120">',
      '<img src="/short.jpg" width="900" height="60">',
      '<img src="data:image/png;base64,iVBORw0KGgo=">',
      '<img src="/diagram.svg">',
      '<img src="https://stats.example/pixel.gif">',
      '<img src="/photo-a.jpg" class="author-avatar">',
      '<img src="/photo-b.jpg" alt="Company logo">',
      '<img src="https://www.gravatar.com/abc.jpg">',
      '<img src="/photo-c.jpg" class="emoji">',
      '<img src="/tracking/open.png">',
      '<img src="/spacer.gif">',
      '<img src="/1x1.gif">',
      '<img src="/badge.png">',
      '<img src="/sprite.png">',
      '<img src="/beacon.png">',
      '<img src="/icon-large.png">',
    ].join('');
    expect(extract('', body(skipped)).thumbnails).toEqual([]);
    expect(
      extract('', body(`${skipped}<img src="/first.jpg"><img src="/second.jpg" width="1200">`))
        .thumbnails
    ).toEqual(['https://publisher.example/first.jpg']);
  });

  it('uses the largest srcset candidate, then src, then data-src', () => {
    expect(
      extract(
        '',
        body(
          '<img src="/small.jpg" srcset="/w_400,c_fill/a.jpg 400w, /w_1600,c_fill/a.jpg 1600w, /w_800,c_fill/a.jpg 800w">'
        )
      ).thumbnails
    ).toEqual(['https://publisher.example/w_1600,c_fill/a.jpg']);
    expect(
      extract('', body('<img src="/one.jpg" srcset="/one.jpg 1x, /two.jpg 2x">')).thumbnails
    ).toEqual(['https://publisher.example/two.jpg']);
    expect(extract('', body('<img data-src="images/lazy.jpg">')).thumbnails).toEqual([
      'https://publisher.example/posts/images/lazy.jpg',
    ]);
  });
});

describe('web article creator image', () => {
  const author = (image: unknown, extra: Record<string, unknown> = {}) =>
    jsonLd({ '@type': 'Article', author: { '@type': 'Person', name: 'Writer', image }, ...extra });
  const publisher = { publisher: { '@type': 'Organization', logo: { url: '/logo.png' } } };
  const touch =
    '<link rel="apple-touch-icon" sizes="120x120" href="/touch-120.png">' +
    '<link rel="apple-touch-icon-precomposed" sizes="180x180" href="/touch-180.png">' +
    '<link rel="apple-touch-icon" href="/touch-unsized.png">';
  const icons =
    '<link rel="shortcut icon" href="/legacy.ico" sizes="256x256">' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">' +
    '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">' +
    '<link rel="mask-icon" href="/mask.svg">';

  it('contributes exactly one avatar, first match wins', () => {
    expect(
      extract(author('https://cdn.example/face.png', publisher) + touch + icons).avatars
    ).toEqual(['https://cdn.example/face.png']);
    expect(
      extract(jsonLd({ '@type': 'Article', author: 'Writer', ...publisher }) + touch + icons)
        .avatars
    ).toEqual(['https://publisher.example/logo.png']);
    expect(extract(touch + icons).avatars).toEqual(['https://publisher.example/touch-180.png']);
    expect(extract(icons).avatars).toEqual(['https://publisher.example/icon-192.png']);
    expect(extract('').avatars).toEqual(['https://publisher.example/favicon.ico']);
  });

  it('reads author images as a string, an ImageObject or an array, and resolves relative URLs', () => {
    expect(extract(author('../faces/writer.png')).avatars).toEqual([
      'https://publisher.example/faces/writer.png',
    ]);
    expect(extract(author({ '@type': 'ImageObject', url: '/face-url.png' })).avatars).toEqual([
      'https://publisher.example/face-url.png',
    ]);
    expect(extract(author({ contentUrl: '/face-content.png' })).avatars).toEqual([
      'https://publisher.example/face-content.png',
    ]);
    expect(extract(author([{ url: '/face-array.png' }, '/face-other.png'])).avatars).toEqual([
      'https://publisher.example/face-array.png',
    ]);
    expect(
      extract(
        jsonLd({
          '@type': 'NewsArticle',
          author: [{ name: 'First', image: '/first.png' }, { name: 'Second' }],
        })
      ).avatars
    ).toEqual(['https://publisher.example/first.png']);
    expect(
      extract(jsonLd({ '@type': 'Article', publisher: { logo: '/logo-string.png' } })).avatars
    ).toEqual(['https://publisher.example/logo-string.png']);
  });

  it('prefers PNG or SVG icons over a larger ICO and falls back to the legacy icon', () => {
    expect(
      extract('<link rel="icon" href="/big.ico" sizes="256x256"><link rel="icon" href="/mark.svg">')
        .avatars
    ).toEqual(['https://publisher.example/mark.svg']);
    expect(extract('<link rel="SHORTCUT ICON" href="/only.ico">').avatars).toEqual([
      'https://publisher.example/only.ico',
    ]);
  });

  it('only contributes https references and skips unusable candidates', () => {
    expect(extract(author('http://cdn.example/insecure.png') + icons).avatars).toEqual([
      'https://publisher.example/icon-192.png',
    ]);
    expect(extract(author('http://[bad')).avatars).toEqual([
      'https://publisher.example/favicon.ico',
    ]);
    expect(extract('', body(), 'http://plain.example/article').avatars).toEqual([]);
  });
});
