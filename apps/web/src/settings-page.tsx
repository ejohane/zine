import { BookmarkCheck, ChevronRight, LogOut, Newspaper, Settings } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

import { AppWordmark } from './app-wordmark';
import { cn } from './components';
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

export function SettingsPage() {
  const { mode } = useAuthAvailability();
  const { signOut } = useAppSession();

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
              {/* Keep the settings nav fixed on the left while the content pane changes on the right. */}
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
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
