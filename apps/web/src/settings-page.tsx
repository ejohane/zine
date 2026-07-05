import {
  ChevronRight,
  Copy,
  Home,
  Inbox,
  Library,
  LogOut,
  Mail,
  Newspaper,
  Podcast,
  Rss,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { ApiTokenScope } from '@zine/shared/api-tokens';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { AppWordmark } from './app-wordmark';
import { Badge, Button, LinkButton, Surface, cn } from './components';
import { MobileTabBar } from './components/mobile-tab-bar';
import { sourceConfigs, supportedSources, type SubscriptionSource } from './lib/onboarding';
import { usePwaState } from './lib/pwa';
import { trpc, useAppSession, useAuthAvailability } from './lib/trpc';

function getConnectionStatus(
  connections:
    | {
        YOUTUBE: { status: string } | null;
        SPOTIFY: { status: string } | null;
        GMAIL: { status: string } | null;
      }
    | undefined,
  provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL'
) {
  return connections?.[provider]?.status ?? null;
}

function getSourceSummary(
  source: SubscriptionSource,
  counts: Record<SubscriptionSource, number>,
  connections:
    | {
        YOUTUBE: { status: string } | null;
        SPOTIFY: { status: string } | null;
        GMAIL: { status: string } | null;
      }
    | undefined
) {
  if (source === 'RSS') {
    return counts.RSS > 0
      ? `${counts.RSS} active RSS feed${counts.RSS === 1 ? '' : 's'}`
      : 'No RSS feeds added yet';
  }

  const status = getConnectionStatus(connections, source);
  if (status === 'ACTIVE') {
    return counts[source] > 0
      ? `${counts[source]} active ${source === 'GMAIL' ? 'newsletter' : 'source'}${
          counts[source] === 1 ? '' : 's'
        }`
      : 'Connected and ready for import';
  }

  return 'Not connected yet';
}

function getSourceBadge(
  source: SubscriptionSource,
  counts: Record<SubscriptionSource, number>,
  connections:
    | {
        YOUTUBE: { status: string } | null;
        SPOTIFY: { status: string } | null;
        GMAIL: { status: string } | null;
      }
    | undefined
) {
  if (source === 'RSS') {
    return counts.RSS > 0 ? 'active' : 'manual';
  }

  return getConnectionStatus(connections, source) === 'ACTIVE' ? 'connected' : 'setup';
}

const sourceIcons: Record<SubscriptionSource, LucideIcon> = {
  SPOTIFY: Podcast,
  YOUTUBE: Video,
  GMAIL: Mail,
  RSS: Rss,
};

function SourcesSection() {
  const connectionsQuery = trpc.subscriptions.connections.list.useQuery();
  const subscriptionsQuery = trpc.subscriptions.list.useQuery({ limit: 100 });
  const newslettersStatsQuery = trpc.subscriptions.newsletters.stats.useQuery();
  const rssStatsQuery = trpc.subscriptions.rss.stats.useQuery();

  const subscriptions = subscriptionsQuery.data?.items ?? [];
  const counts: Record<SubscriptionSource, number> = {
    YOUTUBE: subscriptions.filter((subscription) => subscription.provider === 'YOUTUBE').length,
    SPOTIFY: subscriptions.filter((subscription) => subscription.provider === 'SPOTIFY').length,
    GMAIL: newslettersStatsQuery.data?.active ?? 0,
    RSS: rssStatsQuery.data?.active ?? 0,
  };

  return (
    <div className="settings-page__section">
      <div className="group-panel__header">
        <div>
          <h2 className="settings-page__section-title">Sources</h2>
          <p className="settings-page__section-copy">
            Launch the guided setup whenever you want to connect or expand your source mix.
          </p>
        </div>
        <LinkButton to="/welcome?origin=settings" aria-label="Launch guided setup">
          <Sparkles size={16} aria-hidden="true" />
          Launch guided setup
        </LinkButton>
      </div>

      <div className="source-grid">
        {supportedSources.map((source) => {
          const Icon = sourceIcons[source];
          return (
            <div key={source} className="source-card">
              <Surface className="source-card__surface">
                <div className="source-card__header">
                  <div className="source-card__icon" aria-hidden="true">
                    <Icon size={20} />
                  </div>
                  <div className="source-card__heading">
                    <p className="eyebrow">{sourceConfigs[source].eyebrow}</p>
                    <h2>{sourceConfigs[source].title}</h2>
                  </div>
                </div>
                <p>{getSourceSummary(source, counts, connectionsQuery.data)}</p>
                <div className="source-card__footer">
                  <Badge>{getSourceBadge(source, counts, connectionsQuery.data)}</Badge>
                  <span>{sourceConfigs[source].summary}</span>
                </div>
              </Surface>
            </div>
          );
        })}
      </div>
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
      <p className="eyebrow">
        {installAvailability === 'installed' ? 'Installed' : 'Install the app'}
      </p>
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

function formatTimestamp(value: number | null | undefined): string {
  if (!value) {
    return 'Never';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function ApiTokensSection() {
  const utils = trpc.useUtils();
  const tokensQuery = trpc.apiTokens.list.useQuery();
  const [name, setName] = useState('');
  const [readEnabled, setReadEnabled] = useState(true);
  const [writeEnabled, setWriteEnabled] = useState(true);
  const [syncReadEnabled, setSyncReadEnabled] = useState(false);
  const [syncWriteEnabled, setSyncWriteEnabled] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedScopes = useMemo(() => {
    const scopes: ApiTokenScope[] = [];
    if (readEnabled) scopes.push('bookmarks:read');
    if (writeEnabled) scopes.push('bookmarks:write');
    if (syncReadEnabled) scopes.push('sync:read');
    if (syncWriteEnabled) scopes.push('sync:write');
    return scopes;
  }, [readEnabled, syncReadEnabled, syncWriteEnabled, writeEnabled]);

  const createToken = trpc.apiTokens.create.useMutation({
    onSuccess: (result) => {
      setCreatedToken(result.rawToken);
      setCopied(false);
      setName('');
      void utils.apiTokens.list.invalidate();
    },
  });

  const revokeToken = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => {
      void utils.apiTokens.list.invalidate();
    },
  });

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedScopes.length === 0) {
      return;
    }

    await createToken.mutateAsync({
      name: name.trim(),
      scopes: selectedScopes,
    });
  };

  const handleCopy = async () => {
    if (!createdToken || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(createdToken);
    setCopied(true);
  };

  const tokens = tokensQuery.data?.tokens ?? [];

  return (
    <div className="settings-page__section api-tokens-section">
      <div className="group-panel__header">
        <div>
          <h2 className="settings-page__section-title">API tokens</h2>
        </div>
      </div>

      {createdToken ? (
        <div className="api-token-reveal" role="status">
          <code>{createdToken}</code>
          <Button type="button" tone="ghost" onClick={handleCopy}>
            <Copy size={16} aria-hidden="true" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      ) : null}

      <form className="api-token-form" onSubmit={(event) => void handleCreate(event)}>
        <label className="api-token-form__field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Codex on MacBook"
            maxLength={80}
            required
          />
        </label>

        <div className="api-token-form__scopes" aria-label="Token scopes">
          <label>
            <input
              type="checkbox"
              checked={readEnabled}
              onChange={(event) => setReadEnabled(event.target.checked)}
            />
            Read bookmarks
          </label>
          <label>
            <input
              type="checkbox"
              checked={writeEnabled}
              onChange={(event) => setWriteEnabled(event.target.checked)}
            />
            Add bookmarks
          </label>
          <label>
            <input
              type="checkbox"
              checked={syncReadEnabled}
              onChange={(event) => setSyncReadEnabled(event.target.checked)}
            />
            Read sync status
          </label>
          <label>
            <input
              type="checkbox"
              checked={syncWriteEnabled}
              onChange={(event) => setSyncWriteEnabled(event.target.checked)}
            />
            Start sync jobs
          </label>
        </div>

        <Button
          type="submit"
          disabled={
            createToken.isPending || name.trim().length === 0 || selectedScopes.length === 0
          }
        >
          Create token
        </Button>
      </form>

      <div className="api-token-list">
        {tokens.length === 0 ? (
          <p className="api-token-list__empty">No tokens yet.</p>
        ) : (
          tokens.map((token) => (
            <div key={token.id} className="api-token-row">
              <div>
                <strong>{token.name}</strong>
                <span>{token.tokenPrefix}...</span>
              </div>
              <div className="api-token-row__meta">
                <span>{token.scopes.join(', ')}</span>
                <span>Created {formatTimestamp(token.createdAt)}</span>
                <span>Last used {formatTimestamp(token.lastUsedAt)}</span>
              </div>
              {token.revokedAt ? (
                <Badge tone="danger">revoked</Badge>
              ) : (
                <Button
                  type="button"
                  tone="danger"
                  variant="ghost"
                  onClick={() => revokeToken.mutate({ id: token.id })}
                  disabled={revokeToken.isPending}
                  aria-label={`Revoke ${token.name}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Revoke
                </Button>
              )}
            </div>
          ))
        )}
      </div>
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
              <Link to="/home" className="new-page-sidebar__brand" aria-label="Go to home">
                <div className="new-page-sidebar__brand-icon">
                  <AppWordmark compact />
                </div>
              </Link>
            </div>

            <nav className="new-page-sidebar__rail-nav" aria-label="Primary">
              <NavLink
                to="/home"
                end
                className={({ isActive }) =>
                  cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
                }
                aria-label="Home"
                title="Home"
              >
                <Home size={18} strokeWidth={2.15} />
                <span>Home</span>
              </NavLink>
              <NavLink
                to="/inbox"
                className={({ isActive }) =>
                  cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
                }
                aria-label="Inbox"
                title="Inbox"
              >
                <Inbox size={18} strokeWidth={2.15} />
                <span>Inbox</span>
              </NavLink>
              <NavLink
                to="/search"
                className={({ isActive }) =>
                  cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
                }
                aria-label="Search"
                title="Search"
              >
                <Search size={18} strokeWidth={2.15} />
                <span>Search</span>
              </NavLink>
              <NavLink
                to="/library/bookmarks"
                className={({ isActive }) =>
                  cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
                }
                aria-label="Library"
                title="Library"
              >
                <Library size={18} strokeWidth={2.15} />
                <span>Library</span>
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
                <SourcesSection />
                <ApiTokensSection />
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
