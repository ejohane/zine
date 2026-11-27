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

const throwingStorage = {
  getItem: () => {
    throw Error('blocked');
  },
  setItem: () => {
    throw Error('blocked');
  },
};

const sidebar = (markup: string) =>
  markup.slice(markup.indexOf('<aside'), markup.indexOf('</aside>'));

describe('sidebar collapsed preference', () => {
  test('uses a key consistent with the other next-web keys', () => {
    expect(sidebarCollapsedKey).toBe('zine-next-web-sidebar-collapsed');
  });

  test('defaults to the rail when storage is empty', () => {
    expect(readSidebarCollapsed(memoryStorage())).toBe(true);
  });

  test('only the exact string "false" is expanded', () => {
    expect(readSidebarCollapsed(memoryStorage({ [sidebarCollapsedKey]: 'false' }))).toBe(false);
    for (const value of ['true', 'FALSE', ' false', '0', 'no', '', '{"collapsed":false}']) {
      expect(readSidebarCollapsed(memoryStorage({ [sidebarCollapsedKey]: value }))).toBe(true);
    }
    for (const value of [false, 0, null, undefined, {}]) {
      expect(parseSidebarCollapsed(value)).toBe(true);
    }
  });

  test('falls back to the rail when storage throws or is unavailable', () => {
    expect(readSidebarCollapsed(throwingStorage)).toBe(true);
    expect(readSidebarCollapsed()).toBe(true);
    expect(() => writeSidebarCollapsed(true, throwingStorage)).not.toThrow();
    expect(() => writeSidebarCollapsed(true)).not.toThrow();
  });

  test('toggling writes the new value and reads it back', () => {
    const storage = memoryStorage();
    writeSidebarCollapsed(!readSidebarCollapsed(storage), storage);
    expect(storage.values.get(sidebarCollapsedKey)).toBe('false');
    expect(readSidebarCollapsed(storage)).toBe(false);
    writeSidebarCollapsed(!readSidebarCollapsed(storage), storage);
    expect(storage.values.get(sidebarCollapsedKey)).toBe('true');
    expect(readSidebarCollapsed(storage)).toBe(true);
  });
});

describe('DestinationNav markup', () => {
  const globals = globalThis as { localStorage?: unknown };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const render = (stored?: string) => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage(stored === undefined ? {} : { [sidebarCollapsedKey]: stored }),
    });
    return renderToStaticMarkup(
      <DestinationNav current="Library" choose={() => {}} capture={() => {}} />
    );
  };
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globals.localStorage;
  });

  test('renders an expanded sidebar with a collapse toggle once expanded', () => {
    const aside = sidebar(render('false'));
    expect(aside).toContain('data-collapsed="false"');
    expect(aside).toContain('aria-label="Collapse navigation"');
    expect(aside).toContain('aria-expanded="true"');
    expect(aside).not.toContain('Expand navigation');
  });

  test('renders the rail with an expand toggle and labeled destinations by default', () => {
    const aside = sidebar(render());
    expect(aside).toContain('data-collapsed="true"');
    expect(aside).toContain('aria-label="Expand navigation"');
    expect(aside).toContain('aria-expanded="false"');
    for (const name of ['Home', 'Inbox', 'Library', 'Search']) {
      expect(aside).toContain(`aria-label="${name}"`);
      expect(aside).toContain(`<span class="destination-label">${name}</span>`);
    }
    expect(aside).toMatch(/aria-label="Library" aria-current="page"/);
    expect(aside.match(/aria-current="page"/g)).toHaveLength(1);
  });

  test('treats an invalid stored value as the rail', () => {
    expect(sidebar(render('expanded'))).toContain('aria-expanded="false"');
  });

  test('keeps the mobile triggers and drawer regardless of the desktop state', () => {
    for (const markup of [render(), render('false')]) {
      const mobile = markup.slice(markup.indexOf('</aside>'));
      expect(mobile).toContain('aria-label="Open navigation, current page Library"');
      expect(mobile).toContain('aria-haspopup="dialog"');
      expect(mobile).toContain('<dialog class="destination-drawer"');
      expect(mobile).toContain('aria-label="Close navigation"');
      expect(mobile).toContain('<p class="destination-brand">Zine</p>');
      expect(mobile).not.toContain('title="Library"');
    }
  });

  test('offers Save in the sidebar and in the drawer, and nothing but the menu up top', () => {
    const markup = render();
    expect(sidebar(markup)).toContain('aria-label="Save a link"');
    const drawer = markup.slice(markup.indexOf('<dialog'));
    expect(drawer).toContain('aria-label="Save a link"');
    const bar = markup.slice(markup.indexOf('destination-mobile'), markup.indexOf('<dialog'));
    expect(bar.match(/<button/g)).toHaveLength(1);
    expect(bar).not.toContain('Save a link');
    expect(bar).not.toContain('aria-label="Search"');
    expect(bar).not.toContain('Library</button>');
  });
});
