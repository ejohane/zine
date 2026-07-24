import { parseHTML } from 'linkedom/worker';

import type { ArticleBodyBlock } from './types';
import { isSafePublicArticleUrl } from './url-safety';

const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'nav',
  'footer',
  'aside',
  'svg',
  'canvas',
]);

const ALLOWED_TAGS = new Set([
  'article',
  'section',
  'div',
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'a',
  'img',
  'figure',
  'figcaption',
  'hr',
  'time',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);

const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,figcaption,th,td';
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;
const TRAILING_BOILERPLATE_PATTERNS = [
  /^(?:blog )?comments powered by disqus$/i,
  /^powered by disqus$/i,
  /^copy as\s*\/\s*view markdown$/i,
  /^this page respects your privacy by not using cookies or similar technologies\b/i,
  /^no posts$/i,
];

export interface ArticleBodyNormalizationDiagnostics {
  droppedElements: number;
  strippedAttributes: number;
  blockedUrls: number;
  linkTextCharacters: number;
  totalTextCharacters: number;
}

export interface NormalizedArticleBody {
  sanitizedHtml: string;
  plainText: string;
  blocks: ArticleBodyBlock[];
  wordCount: number;
  readingTimeMinutes: number;
  diagnostics: ArticleBodyNormalizationDiagnostics;
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeAbsoluteUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    return isSafePublicArticleUrl(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  element.remove();
}

function blockKind(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'li') return 'list_item';
  if (tag === 'blockquote') return 'quote';
  if (tag === 'pre') return 'code';
  if (tag === 'figcaption') return 'caption';
  if (tag === 'th' || tag === 'td') return 'table_cell';
  return 'paragraph';
}

function hasSelectedBlockAncestor(element: Element, root: Element): boolean {
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== root) {
    if (ancestor.matches(BLOCK_SELECTOR)) return true;
    ancestor = ancestor.parentElement;
  }
  return false;
}

function recoverProsePreBlocks(root: Element): void {
  const document = root.ownerDocument;
  if (!document) return;

  for (const pre of Array.from(root.querySelectorAll('pre'))) {
    const rawText = (pre.textContent ?? '').replace(/\r\n?/g, '\n').trim();
    const wordCount = rawText.match(WORD_PATTERN)?.length ?? 0;
    const paragraphTexts = rawText
      .split(/\n\s*\n+/)
      .map(normalizeWhitespace)
      .filter(Boolean);
    const sentenceCount = rawText.match(/[.!?](?:\s|$)/g)?.length ?? 0;

    if (wordCount < 120 || paragraphTexts.length < 3 || sentenceCount < 5) continue;

    const replacement = document.createElement('div');
    for (const text of paragraphTexts) {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      replacement.appendChild(paragraph);
    }
    pre.replaceWith(replacement);
  }
}

function dropKnownTrailingBoilerplate(
  root: Element,
  diagnostics: ArticleBodyNormalizationDiagnostics
): void {
  const blocks = Array.from(root.querySelectorAll(BLOCK_SELECTOR));
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    const text = normalizeWhitespace(block.textContent ?? '');
    if (!text) continue;
    if (!TRAILING_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text))) return;
    block.remove();
    diagnostics.droppedElements += 1;
  }
}

function dropTrailingConsecutiveDuplicateBlocks(
  root: Element,
  diagnostics: ArticleBodyNormalizationDiagnostics
): void {
  const blocks = Array.from(root.querySelectorAll(BLOCK_SELECTOR));
  if (blocks.length < 5) return;
  const firstTailIndex = Math.max(1, blocks.length - 5);
  for (let index = blocks.length - 1; index >= firstTailIndex; index -= 1) {
    const text = normalizeWhitespace(blocks[index].textContent ?? '');
    const previousText = normalizeWhitespace(blocks[index - 1].textContent ?? '');
    if (text.length < 20 || text !== previousText) continue;
    blocks[index].remove();
    diagnostics.droppedElements += 1;
  }
}

export function normalizeArticleBodyHtml(rawHtml: string, baseUrl: string): NormalizedArticleBody {
  const { document } = parseHTML(`<html><body><article>${rawHtml}</article></body></html>`);
  const root = document.querySelector('article');
  if (!root) throw new Error('Unable to create article normalization root');

  const diagnostics: ArticleBodyNormalizationDiagnostics = {
    droppedElements: 0,
    strippedAttributes: 0,
    blockedUrls: 0,
    linkTextCharacters: 0,
    totalTextCharacters: 0,
  };

  for (const element of Array.from(root.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      diagnostics.droppedElements += 1;
      element.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      diagnostics.droppedElements += 1;
      unwrap(element);
    }
  }

  for (const element of Array.from(root.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase();
    const originalAttributes = Array.from(element.attributes).map((attribute) => attribute.name);
    const allowed =
      tag === 'a'
        ? new Set(['href', 'title'])
        : tag === 'img'
          ? new Set(['src', 'alt', 'title', 'width', 'height'])
          : tag === 'time'
            ? new Set(['datetime'])
            : new Set<string>();

    for (const attribute of originalAttributes) {
      if (!allowed.has(attribute.toLowerCase())) {
        element.removeAttribute(attribute);
        diagnostics.strippedAttributes += 1;
      }
    }

    if (tag === 'a') {
      diagnostics.linkTextCharacters += normalizeWhitespace(element.textContent ?? '').length;
      const href = element.getAttribute('href');
      if (href) {
        const resolved = safeAbsoluteUrl(href, baseUrl);
        if (resolved) {
          element.setAttribute('href', resolved);
        } else {
          element.removeAttribute('href');
          diagnostics.blockedUrls += 1;
        }
      }
    }

    if (tag === 'img') {
      const src = element.getAttribute('src');
      const resolved = src ? safeAbsoluteUrl(src, baseUrl) : null;
      if (resolved) {
        element.setAttribute('src', resolved);
      } else {
        diagnostics.blockedUrls += 1;
        element.remove();
      }
    }
  }

  recoverProsePreBlocks(root);
  dropTrailingConsecutiveDuplicateBlocks(root, diagnostics);
  dropKnownTrailingBoilerplate(root, diagnostics);

  const blocks = Array.from(root.querySelectorAll(BLOCK_SELECTOR))
    .filter((element) => !hasSelectedBlockAncestor(element, root))
    .map((element, index) => ({
      id: `b${index + 1}`,
      kind: blockKind(element),
      text: normalizeWhitespace(element.textContent ?? ''),
    }))
    .filter((block) => block.text.length > 0);

  const plainText =
    blocks.length > 0
      ? blocks.map((block) => block.text).join('\n\n')
      : normalizeWhitespace(root.textContent ?? '');
  const words = plainText.match(WORD_PATTERN) ?? [];
  diagnostics.totalTextCharacters = plainText.length;

  return {
    sanitizedHtml: root.innerHTML.trim(),
    plainText,
    blocks,
    wordCount: words.length,
    readingTimeMinutes: words.length === 0 ? 0 : Math.max(1, Math.ceil(words.length / 200)),
    diagnostics,
  };
}
