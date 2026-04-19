import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { Button, cn } from './components';
import { useMediaQuery } from './lib/use-media-query';
import { usePwaState } from './lib/pwa';

export function PwaSupport() {
  const { pathname } = useLocation();
  const isPhoneLayout = useMediaQuery('(max-width: 700px)');
  const {
    dismissInstallPrompt,
    installAvailability,
    isInstallPromptDismissed,
    isOnline,
    promptInstall,
  } = usePwaState();

  const hidesInstallPrompt = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');
  const usesBottomTabBar = pathname.startsWith('/bookmarks') || pathname.startsWith('/settings');
  const hasInlineInstallSurface = pathname.startsWith('/settings');
  const showInstallBanner =
    isPhoneLayout &&
    !hidesInstallPrompt &&
    !hasInlineInstallSurface &&
    !isInstallPromptDismissed &&
    (installAvailability === 'prompt' || installAvailability === 'ios');
  const installCopy = useMemo(() => {
    if (installAvailability === 'prompt') {
      return 'Install Zine for fullscreen reading, quicker relaunches, and a shell that behaves more like the iPhone app.';
    }

    return 'On iPhone, open this page in Safari, then use Share -> Add to Home Screen to install Zine.';
  }, [installAvailability]);

  return (
    <>
      {!isOnline ? (
        <div
          className={cn('pwa-status-banner', usesBottomTabBar && 'pwa-status-banner--tabbed')}
          role="status"
          aria-live="polite"
        >
          Offline. Zine will use the saved shell and any cached views already on this device.
        </div>
      ) : null}

      {showInstallBanner ? (
        <aside
          className={cn('pwa-install-banner', usesBottomTabBar && 'pwa-install-banner--tabbed')}
          aria-label="Install Zine"
        >
          <div className="pwa-install-banner__copy">
            <p className="eyebrow">Install Zine</p>
            <h2 className="pwa-install-banner__title">Open it like a mobile app.</h2>
            <p>{installCopy}</p>
          </div>
          <div className="pwa-install-banner__actions">
            {installAvailability === 'prompt' ? (
              <Button type="button" onClick={() => void promptInstall()}>
                Install
              </Button>
            ) : null}
            <Button type="button" tone="ghost" onClick={dismissInstallPrompt}>
              Not now
            </Button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
