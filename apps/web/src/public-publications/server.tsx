import { renderToString } from 'react-dom/server';
import { PublicReader } from './reader';
import { publicCover, type ReaderData } from './model';
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
export function renderPublicDocument(shell: string, data: ReaderData, url: URL): string {
  const publication =
    data.type === 'issue'
      ? data.issue.publication
      : data.type === 'publication'
        ? data.publication
        : null;
  const title =
    data.type === 'issue'
      ? `${data.issue.title} · ${publication!.displayName}`
      : publication?.displayName || 'Publication unavailable · Zine';
  const description =
    (data.type === 'issue' ? data.issue.introduction : publication?.description)?.slice(0, 240) ||
    (publication
      ? `A Zine edited by ${publication.editor.displayName}.`
      : 'This publication is not currently available.');
  const cover = publicCover(
    data.type === 'issue'
      ? data.issue.coverUrl || publication?.coverUrl || null
      : publication?.coverUrl || null
  );
  const image = new URL(cover || '/publication-fallback.png', url.origin).href;
  const canonical = new URL(url.pathname, url.origin).href;
  const meta = `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escapeHtml(publication?.displayName || 'Zine')}"><meta name="twitter:card" content="summary_large_image">`;
  const bootstrap = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[\s\S]*?>/i, '')
    .replace('</head>', `${meta}</head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderToString(<PublicReader data={data} />)}</div><script type="application/json" id="zine-publication-data">${bootstrap}</script>`
    );
}
