import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DestinationNav,
  parseSidebarCollapsed,
  readSidebarCollapsed,
  sidebarCollapsedKey,
  writeSidebarCollapsed,
} from './DestinationNav';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}
const blocked = () => {
  throw new Error('storage is blocked');
};

describe('sidebar collapsed preference', () => {
  test('uses a key in the app namespace', () => {
    expect(sidebarCollapsedKey).toBe('zine-next-web-sidebar-collapsed');
  });

  test('only the exact string "true" is collapsed', () => {
    expect(parseSidebarCollapsed('true')).toBe(true);
    for (const value of [null, undefined, '', 'false', 'TRUE', ' true', '1', 'yes', '{}'])
      expect(parseSidebarCollapsed(value)).toBe(false);
  });

  test('defaults to expanded when storage is empty', () => {
    expect(readSidebarCollapsed(() => memoryStorage())).toBe(false);
  });

  test('reads a stored collapsed value', () => {
    const storage = memoryStorage({ [sidebarCollapsedKey]: 'true' });
    expect(readSidebarCollapsed(() => storage)).toBe(true);
  });

  test('invalid stored values are expanded', () => {
    const storage = memoryStorage({ [sidebarCollapsedKey]: 'collapsed' });
    expect(readSidebarCollapsed(() => storage)).toBe(false);
  });

  test('toggling writes the new value and reads it back', () => {
    const storage = memoryStorage();
    writeSidebarCollapsed(true, () => storage);
    expect(storage.values.get(sidebarCollapsedKey)).toBe('true');
    expect(readSidebarCollapsed(() => storage)).toBe(true);
    writeSidebarCollapsed(false, () => storage);
    expect(storage.values.get(sidebarCollapsedKey)).toBe('false');
    expect(readSidebarCollapsed(() => storage)).toBe(false);
  });

  test('storage errors fall back to expanded and do not throw', () => {
    expect(readSidebarCollapsed(blocked)).toBe(false);
    expect(() => writeSidebarCollapsed(true, blocked)).not.toThrow();
  });
});

describe('DestinationNav markup', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const render = (stored?: string) => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage(stored === undefined ? {} : { [sidebarCollapsedKey]: stored }),
    });
    const markup = renderToStaticMarkup(<DestinationNav current="Library" choose={() => {}} />);
    const sidebar = markup.slice(markup.indexOf('<aside'), markup.indexOf('</aside>'));
    return { markup, sidebar };
  };
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test('expanded by default with a collapse toggle', () => {
    const { sidebar } = render();
    expect(sidebar).toContain('data-collapsed="false"');
    expect(sidebar).toMatch(/<button[^>]*aria-label="Collapse navigation"[^>]*>/);
    expect(sidebar).toMatch(/<button[^>]*aria-expanded="true"[^>]*>/);
    expect(sidebar).not.toContain('Expand navigation');
  });

  test('collapsed rail keeps the toggle and labeled destinations', () => {
    const { sidebar } = render('true');
    expect(sidebar).toContain('data-collapsed="true"');
    expect(sidebar).toMatch(/<button[^>]*aria-label="Expand navigation"[^>]*>/);
    expect(sidebar).toMatch(/<button[^>]*aria-expanded="false"[^>]*>/);
    for (const name of ['Home', 'Inbox', 'Library', 'Search'])
      expect(sidebar).toMatch(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`));
    expect(sidebar).toMatch(/<button[^>]*aria-label="Library"[^>]*aria-current="page"[^>]*>/);
    expect(sidebar).toContain('Z<span class="destination-label">ine</span>');
  });

  test('invalid stored value renders expanded', () => {
    expect(render('nope').sidebar).toContain('data-collapsed="false"');
  });

  test('mobile trigger and drawer are unaffected by the collapsed state', () => {
    const mobile = (markup: string) => markup.slice(markup.indexOf('</aside>'));
    const expanded = mobile(render().markup);
    expect(mobile(render('true').markup)).toBe(expanded);
    expect(expanded).toContain('aria-label="Open navigation, current page Library"');
    expect(expanded).toContain('aria-label="Close navigation"');
    expect(expanded).toContain('<p class="destination-brand">Zine</p>');
    expect(expanded).toMatch(/<button[^>]*aria-current="page"[^>]*>/);
  });
});
