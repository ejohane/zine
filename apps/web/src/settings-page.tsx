import { BookmarkCheck, ChevronRight, LogOut, Newspaper, Settings } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

import { AppWordmark } from './app-wordmark';
import { Button, cn } from './components';
import { MobileTabBar } from './components/mobile-tab-bar';
import { usePwaState } from './lib/pwa';
import { useAppSession, useAuthAvailability } from './lib/trpc';

function SubscriptionsSection() {
  return (
    <div className="settings-page__section">
      <h2 className="settings-page__section-title">Subscriptions</h2>
      <p className="settings-page__section-copy">
        Manage your subscriptions here. Subscription controls are coming soon.
      </p>
    </div>
  );
}

function InstallAppSection({
  installAvailability,
  promptInstall,
}: {
  installAvailability: ReturnType<typeof usePwaState>['installAvailability'];
  promptInstall: ReturnType<typeof usePwaState>['promptInstall'];
}) {
  if (installAvailability === 'unsupported') {
    return null;
  }

  return (
    <div className="settings-page__section settings-pwa-card">
      <p className="eyebrow">{installAvailability === 'installed' ? 'Installed' : 'Install the app'}</p>
      <h3>
        {installAvailability === 'installed'
          ? 'Zine is already on this device.'
          : 'Keep Zine one tap away.'}
      </h3>
      <p>
        {installAvailability === 'prompt'
          ? 'Install Zine for a fullscreen shell, cached relaunches, and mobile-safe layout handling.'
          : installAvailability === 'ios'
            ? 'On iPhone, open this page in Safari, then use Share -> Add to Home Screen to install Zine.'
            : 'This browser is already running the installed version of Zine.'}
      </p>
      {installAvailability === 'prompt' ? (
        <Button
          type="button"
          tone="ghost"
          onClick={() => {
            void promptInstall();
          }}
        >
          Install app
        </Button>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const { mode } = useAuthAvailability();
  const { signOut } = useAppSession();
  const { installAvailability, promptInstall } = usePwaState();

  return (
    <main className="new-page-screen">
      <div className="new-page-sidebar">
        <div className="new-page-sidebar__rail">
          <div className="new-page-sidebar__rail-top">
            <div className="new-page-sidebar__rail-header">
              <Link
                to="/bookmarks"
                className="new-page-sidebar__brand"
                aria-label="Go to bookmarks"
              >
                <div className="new-page-sidebar__brand-icon">
                  <AppWordmark compact />
                </div>
              </Link>
            </div>

            <nav className="new-page-sidebar__rail-nav" aria-label="Primary">
              <NavLink
                to="/bookmarks"
                end
                className={({ isActive }) =>
                  cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
                }
                aria-label="Bookmarks"
                title="Bookmarks"
              >
                <BookmarkCheck size={18} strokeWidth={2.15} />
                <span>Bookmarks</span>
              </NavLink>
            </nav>
          </div>

          <div className="new-page-sidebar__rail-footer">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
              }
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={18} strokeWidth={2.15} />
              <span>Settings</span>
            </NavLink>
          </div>
        </div>
      </div>

      <div className="new-page-inset">
        <header className="new-page-inset__header">
          <nav className="new-page-breadcrumb" aria-label="Current page location">
            <span>Library</span>
            <ChevronRight size={14} strokeWidth={2.2} />
            <strong>Settings</strong>
          </nav>
        </header>

        <div className="new-page-inset__body">
          <section className="new-page-column-card new-page-column-card--full">
            <div className="new-page-column-card__header">
              <h1 className="new-page-column-card__title">Settings</h1>
            </div>

            <div className="settings-page__layout">
              <nav className="settings-page__nav" aria-label="Settings sections">
                <button
                  className="settings-page__nav-item settings-page__nav-item--active"
                  aria-current="true"
                >
                  <Newspaper size={16} strokeWidth={2} />
                  Subscriptions
                </button>

                {mode === 'clerk' ? (
                  <button
                    className="settings-page__nav-item settings-page__nav-item--danger"
                    onClick={() => {
                      void signOut({ redirectUrl: '/sign-in' });
                    }}
                  >
                    <LogOut size={16} strokeWidth={2} />
                    Sign out
                  </button>
                ) : null}
              </nav>

              <div className="settings-page__content">
                <SubscriptionsSection />
                <InstallAppSection
                  installAvailability={installAvailability}
                  promptInstall={promptInstall}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <MobileTabBar />
    </main>
  );
}
