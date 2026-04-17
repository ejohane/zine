import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PwaProvider, type BeforeInstallPromptEvent } from './lib/pwa';
import { PwaSupport } from './pwa-support';

const originalUserAgentDescriptor =
  Object.getOwnPropertyDescriptor(window.navigator, 'userAgent') ??
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.navigator), 'userAgent');

function setMatchMedia(matchesByQuery: Record<string, boolean>) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: matchesByQuery[query] ?? false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderPwaSupport(pathname = '/bookmarks') {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <PwaProvider>
        <PwaSupport />
      </PwaProvider>
    </MemoryRouter>
  );
}

describe('PwaSupport', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key);
        }),
        clear: vi.fn(() => {
          storage.clear();
        }),
      },
    });

    setMatchMedia({
      '(max-width: 700px)': true,
      '(display-mode: standalone)': false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();

    if (originalUserAgentDescriptor) {
      Object.defineProperty(window.navigator, 'userAgent', originalUserAgentDescriptor);
    }
  });

  test('shows the iOS install guidance on phone-sized Safari views', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });

    renderPwaSupport();

    expect(screen.getByLabelText('Install Zine')).toBeVisible();
    expect(screen.getByText(/Add to Home Screen/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  test('shows the iOS install guidance even when the runtime is not detected as Safari', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });

    renderPwaSupport();

    expect(screen.getByLabelText('Install Zine')).toBeVisible();
    expect(screen.getByText(/open this page in Safari/i)).toBeVisible();
  });

  test('does not show the floating install banner on settings', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });

    renderPwaSupport('/settings');

    expect(screen.queryByLabelText('Install Zine')).not.toBeInTheDocument();
  });

  test('uses the browser install prompt when available', async () => {
    const user = userEvent.setup();
    const prompt = vi.fn(async () => undefined);

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
    });

    renderPwaSupport();

    const installEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    }) as BeforeInstallPromptEvent;

    act(() => {
      window.dispatchEvent(installEvent);
    });

    const installButton = await screen.findByRole('button', { name: 'Install' });
    await user.click(installButton);

    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
