import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ChevronRight,
  Home,
  Inbox,
  Library,
  LogOut,
  Newspaper,
  Search,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { ContentType } from '@zine/shared';

import { Badge, Button, EmptyState, StatCard, Surface } from '@/components';
import { AppWordmark } from '@/app-wordmark';
import { FilterChip } from '@/components/ui/filter-chip';

import { createDarkCanvasDecorator } from './decorators';

const bookmarkRows = [
  {
    id: 'article-1',
    title: 'Stable component APIs',
    creator: 'Zine Editorial',
  },
  {
    id: 'video-1',
    title: 'Design systems at scale',
    creator: 'Zine Editorial',
    selected: true,
  },
  {
    id: 'podcast-1',
    title: 'Product taste and pacing',
    creator: 'Studio Dispatch',
  },
];

const accessibleEyebrowStyle = {
  margin: 0,
  color: 'var(--text-subheader)',
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
};

function AuthStateReference() {
  return (
    <main className="auth-screen">
      <div className="auth-screen__backdrop" />
      <section className="auth-hero">
        <p className="eyebrow">Web channel</p>
        <h1>A single calm place for everything you bookmarked.</h1>
        <p>
          The browser surface now mirrors the mobile rhythm: home, inbox, search, library, and
          detail surfaces keep the same reading semantics across screen sizes.
        </p>
        <div className="auth-hero__grid">
          <StatCard label="Tabs" value="4" detail="Home, Inbox, Search, Library" />
          <StatCard label="Route" value="/home" detail="The signed-in landing page" />
        </div>
      </section>
      <section className="auth-panel">
        <AppWordmark />
        <Surface className="auth-panel__surface">
          <p style={accessibleEyebrowStyle}>Sign in</p>
          <h2>Continue where you left off.</h2>
          <p>
            Clerk handles the browser auth step, then drops you directly onto the mobile-parity web
            shell.
          </p>
          <div className="button-row">
            <Button>Continue with Clerk</Button>
            <Button tone="ghost">Create account</Button>
          </div>
        </Surface>
      </section>
    </main>
  );
}

function BookmarkSelectionReference() {
  return (
    <main className="new-page-screen">
      <div className="new-page-sidebar">
        <div className="new-page-sidebar__rail">
          <div className="new-page-sidebar__rail-top">
            <div className="new-page-sidebar__rail-header">
              <div className="new-page-sidebar__brand">
                <div className="new-page-sidebar__brand-icon">
                  <AppWordmark compact />
                </div>
              </div>
            </div>
            <nav className="new-page-sidebar__rail-nav" aria-label="Primary">
              <div className="new-page-sidebar__rail-btn">
                <Home size={18} strokeWidth={2.15} />
                <span>Home</span>
              </div>
              <div className="new-page-sidebar__rail-btn">
                <Inbox size={18} strokeWidth={2.15} />
                <span>Inbox</span>
              </div>
              <div className="new-page-sidebar__rail-btn">
                <Search size={18} strokeWidth={2.15} />
                <span>Search</span>
              </div>
              <div className="new-page-sidebar__rail-btn new-page-sidebar__rail-btn--active">
                <Library size={18} strokeWidth={2.15} />
                <span>Library</span>
              </div>
            </nav>
          </div>
          <div className="new-page-sidebar__rail-footer">
            <div className="new-page-sidebar__rail-btn">
              <span>Settings</span>
            </div>
          </div>
        </div>
      </div>

      <div className="new-page-inset">
        <header className="new-page-inset__header">
          <nav className="new-page-breadcrumb" aria-label="Current page location">
            <span>Library</span>
            <strong>Bookmarks</strong>
          </nav>
        </header>

        <div className="new-page-inset__body">
          <aside className="new-page-column-card">
            <div className="new-page-column-card__header">
              <h2 className="new-page-column-card__title">Bookmarks</h2>
              <div className="new-page-column-card__chips">
                <FilterChip label="All" size="small" selected />
                <FilterChip label="Articles" size="small" tone={ContentType.ARTICLE} />
                <FilterChip label="Videos" size="small" tone={ContentType.VIDEO} selected />
                <FilterChip label="Podcasts" size="small" tone={ContentType.PODCAST} />
              </div>
            </div>

            <div className="new-page-column-card__list">
              {bookmarkRows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={Boolean(item.selected)}
                  className={`bookmark-row${item.selected ? ' bookmark-row--selected' : ''}`}
                >
                  <div className="bookmark-row__cover bookmark-row__cover--empty" />
                  <div className="bookmark-row__info">
                    <span className="bookmark-row__title">{item.title}</span>
                    <div className="bookmark-row__author">
                      <div className="bookmark-row__avatar bookmark-row__avatar--fallback">
                        {item.creator[0]}
                      </div>
                      <span className="bookmark-row__name">{item.creator}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="new-page-inset__content">
            <section className="new-page-column-card new-page-bookmark-pane">
              <article className="new-page-bookmark-view new-page-bookmark-view--pane">
                <div className="new-page-bookmark-view__hero">
                  <div className="new-page-bookmark-view__hero-placeholder" />

                  <div className="new-page-bookmark-view__hero-content">
                    <div className="new-page-bookmark-view__badges">
                      <Badge>youtube</Badge>
                      <Badge>video</Badge>
                    </div>

                    <h2 className="new-page-bookmark-view__title">Design systems at scale</h2>
                  </div>
                </div>

                <div className="new-page-bookmark-view__body">
                  <div className="new-page-bookmark-view__creator-block">
                    <div className="new-page-bookmark-view__creator">
                      <div className="new-page-bookmark-view__creator-avatar new-page-bookmark-view__creator-avatar--fallback">
                        Z
                      </div>
                      <div className="new-page-bookmark-view__creator-copy">
                        <strong>Zine Editorial</strong>
                      </div>
                    </div>
                  </div>

                  <div className="new-page-bookmark-view__meta" aria-label="Bookmark metadata">
                    <span>@zine-editorial</span>
                    <span>2 days ago</span>
                    <span>10:05</span>
                  </div>

                  <div className="new-page-bookmark-view__actions">
                    <div className="new-page-bookmark-view__actions-left">
                      <Button tone="ghost" size="icon" aria-label="Remove bookmark">
                        B
                      </Button>
                      <Button tone="ghost" size="icon" aria-label="Mark finished">
                        C
                      </Button>
                      <Button tone="ghost" size="icon" aria-label="Share bookmark">
                        S
                      </Button>
                    </div>

                    <a
                      className="new-page-bookmark-view__fab new-page-bookmark-view__fab--youtube"
                      href="https://zine.example/watch/design-systems-at-scale"
                    >
                      Open in YouTube
                    </a>
                  </div>

                  <section className="new-page-bookmark-view__section">
                    <p style={accessibleEyebrowStyle}>About this video</p>
                    <p className="new-page-bookmark-view__summary">
                      The desk keeps the reading, watching, and listening flows in one quiet browser
                      surface without losing the editorial cadence from mobile.
                    </p>
                  </section>
                </div>
              </article>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function BookmarkEmptyReference() {
  return (
    <main className="new-page-screen">
      <EmptyState
        title="No bookmarks yet"
        message="Save a few items first, then Home and Library become the main web surfaces for browsing them."
      />
    </main>
  );
}

function SettingsReference() {
  return (
    <main className="new-page-screen">
      <div className="new-page-sidebar">
        <div className="new-page-sidebar__rail">
          <div className="new-page-sidebar__rail-top">
            <div className="new-page-sidebar__rail-header">
              <Link to="/home" className="new-page-sidebar__brand" aria-label="Go to home">
                <div className="new-page-sidebar__brand-icon">
                  <AppWordmark compact />
                </div>
              </Link>
            </div>

            <nav className="new-page-sidebar__rail-nav" aria-label="Primary">
              <Link to="/home" className="new-page-sidebar__rail-btn" aria-label="Home">
                <Home size={18} strokeWidth={2.15} />
                <span>Home</span>
              </Link>
              <Link to="/inbox" className="new-page-sidebar__rail-btn" aria-label="Inbox">
                <Inbox size={18} strokeWidth={2.15} />
                <span>Inbox</span>
              </Link>
              <Link to="/search" className="new-page-sidebar__rail-btn" aria-label="Search">
                <Search size={18} strokeWidth={2.15} />
                <span>Search</span>
              </Link>
              <Link
                to="/library/bookmarks"
                className="new-page-sidebar__rail-btn"
                aria-label="Library"
              >
                <Library size={18} strokeWidth={2.15} />
                <span>Library</span>
              </Link>
            </nav>
          </div>

          <div className="new-page-sidebar__rail-footer">
            <Link
              to="/settings"
              className="new-page-sidebar__rail-btn new-page-sidebar__rail-btn--active"
              aria-label="Settings"
            >
              <SettingsIcon size={18} strokeWidth={2.15} />
              <span>Settings</span>
            </Link>
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
                <button className="settings-page__nav-item settings-page__nav-item--active">
                  <Newspaper size={16} strokeWidth={2} />
                  Subscriptions
                </button>
                <button className="settings-page__nav-item settings-page__nav-item--danger">
                  <LogOut size={16} strokeWidth={2} />
                  Sign out
                </button>
              </nav>

              <div className="settings-page__content">
                <div className="settings-page__section">
                  <h2 className="settings-page__section-title">Subscriptions</h2>
                  <p className="settings-page__section-copy">
                    Manage your subscriptions here. Subscription controls are coming soon.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

const meta = {
  title: 'Layout/Web App States',
  decorators: [createDarkCanvasDecorator({ minHeight: 960, padding: 24 })],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const AuthSignIn: Story = {
  render: () => <AuthStateReference />,
};

export const BookmarkSelection: Story = {
  render: () => <BookmarkSelectionReference />,
};

export const BookmarkEmpty: Story = {
  render: () => <BookmarkEmptyReference />,
};

export const Settings: Story = {
  render: () => <SettingsReference />,
};
