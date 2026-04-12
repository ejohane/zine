import { SignIn, SignUp, UserButton } from '@clerk/clerk-react';
import { BookOpen, House, Inbox, Rss, Settings, type LucideIcon } from 'lucide-react';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';

import { ContentType, Provider, UserItemState } from '@zine/shared';

import {
  Badge,
  Button,
  AnchorButton,
  EmptyState,
  Field,
  LinkButton,
  PageHeader,
  QueryBoundary,
  StatCard,
  Surface,
  cn,
} from './components';
import { ItemCard } from './components/item-card';
import { FilterChip } from './components/ui/filter-chip';
import {
  formatAbsoluteDate,
  formatDeltaLabel,
  formatDuration,
  formatEstimatedMinutes,
  formatRelativeDate,
  isValidUrl,
  mapProvider,
} from './lib/format';
import { completeOAuthFlow, connectProvider, type OAuthProvider } from './lib/oauth';
import { WEB_APP_VERSION } from './lib/env';
import { HomePage as HomeSurfacePage } from './home-page';
import type {
  BookmarkSaveResult,
  DiscoverableSubscription,
  InboxItem,
  LibraryItem,
  NewsletterItem,
  RssFeed,
  SubscriptionItem,
} from './lib/router-types';
import {
  buildSubscriptionsSummary,
  formatSourceCount,
  getHubStatusText,
  getIntegrationCardCopy,
  getIntegrationState,
  getSubscriptionSourceConfig,
  SUBSCRIPTION_SOURCES,
  type SubscriptionSource,
} from './lib/subscriptions';
import { trpc, useAppSession, useAuthAvailability, useRecapTimezone } from './lib/trpc';

const CONTENT_FILTERS: Array<{ label: string; value?: ContentType }> = [
  { label: 'All' },
  { label: 'Articles', value: ContentType.ARTICLE },
  { label: 'Podcasts', value: ContentType.PODCAST },
  { label: 'Videos', value: ContentType.VIDEO },
  { label: 'Posts', value: ContentType.POST },
];

const SHELL_NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Home', icon: House },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/subscriptions', label: 'Subscriptions', icon: Rss },
];

function AppWordmark() {
  return (
    <div className="wordmark">
      <span className="wordmark__disc" />
      <div>
        <p>Zine</p>
        <small>editorial browser</small>
      </div>
    </div>
  );
}

export function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { isEnabled } = useAuthAvailability();

  if (!isEnabled) {
    return (
      <main className="shell-loading">
        <div>
          <p className="eyebrow">Configuration required</p>
          <h1>Set `VITE_CLERK_PUBLISHABLE_KEY` to use the web auth flow.</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <div className="auth-screen__backdrop" />
      <section className="auth-hero">
        <p className="eyebrow">Web channel</p>
        <h1>An editorial desk for everything you mean to return to.</h1>
        <p>
          Zine on the web keeps the same calm mental model: triage in the inbox, keep what matters
          in the library, and reconnect through a deliberately spare home surface.
        </p>
        <div className="auth-hero__grid">
          <StatCard label="Modes" value="3" detail="Home, Inbox, Library" />
          <StatCard
            label="New channel"
            value="Web"
            detail="Vite + React on top of the worker API"
          />
        </div>
      </section>
      <section className="auth-panel">
        <AppWordmark />
        <Surface className="auth-panel__surface">
          {mode === 'sign-in' ? (
            <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
          ) : (
            <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/" />
          )}
        </Surface>
      </section>
    </main>
  );
}

function ClerkProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAppSession();

  if (!auth.isLoaded) {
    return (
      <main className="shell-loading">
        <div>
          <p className="eyebrow">Authenticating</p>
          <h1>Checking your session.</h1>
        </div>
      </main>
    );
  }

  if (!auth.isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isEnabled } = useAuthAvailability();

  if (!isEnabled) {
    return (
      <main className="shell-loading">
        <div>
          <p className="eyebrow">Configuration required</p>
          <h1>Set `VITE_CLERK_PUBLISHABLE_KEY` to use the web app.</h1>
        </div>
      </main>
    );
  }

  return <ClerkProtectedRoute>{children}</ClerkProtectedRoute>;
}

function ShellChrome() {
  const { mode } = useAuthAvailability();

  return (
    <div className="app-shell">
      <header className="shell-header">
        <Link to="/" className="shell-header__brand" aria-label="Go to home">
          <AppWordmark />
        </Link>
        <div className="shell-header__actions">
          <Link className="shell-icon-button" to="/settings" aria-label="Open settings">
            <Settings size={18} strokeWidth={2.1} />
          </Link>
          {mode === 'clerk' ? (
            <div className="shell-user-button">
              <UserButton />
            </div>
          ) : (
            <Badge tone="warning">Dev mode</Badge>
          )}
        </div>
      </header>

      <main className="page-frame">
        <Outlet />
      </main>

      <nav className="shell-dock" aria-label="Primary">
        {SHELL_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn('shell-dock__link', isActive && 'shell-dock__link--active')
            }
          >
            <Icon size={18} strokeWidth={2.15} />
            <span className="shell-dock__label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function AppShell() {
  return <ShellChrome />;
}

export function HomePage() {
  return <HomeSurfacePage />;
}

export function InboxPage() {
  const utils = trpc.useUtils();
  const inboxQuery = trpc.items.inbox.useQuery({ limit: 50 });
  const [pendingId, setPendingId] = useState<string | null>(null);

  const bookmarkMutation = trpc.items.bookmark.useMutation({
    onSettled: () => {
      setPendingId(null);
      void Promise.all([
        utils.items.inbox.invalidate(),
        utils.items.library.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const archiveMutation = trpc.items.archive.useMutation({
    onSettled: () => {
      setPendingId(null);
      void Promise.all([utils.items.inbox.invalidate(), utils.items.home.invalidate()]);
    },
  });

  const inboxItems: InboxItem[] = inboxQuery.data?.items ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inbox"
        title="Decisions first."
        description="Treat new items like a finite queue: save what matters, archive the rest, move on cleanly."
      />

      <QueryBoundary
        isLoading={inboxQuery.isLoading}
        error={inboxQuery.error}
        isEmpty={inboxItems.length === 0}
        empty={
          <EmptyState
            title="Your inbox is clear"
            message="Connect a source or sync again and new arrivals will appear here."
          />
        }
      >
        <div className="item-list">
          {inboxItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              actionSlot={
                <div className="button-row">
                  <Button
                    tone="ghost"
                    disabled={pendingId === item.id}
                    onClick={() => {
                      setPendingId(item.id);
                      archiveMutation.mutate({ id: item.id });
                    }}
                  >
                    Archive
                  </Button>
                  <Button
                    disabled={pendingId === item.id}
                    onClick={() => {
                      setPendingId(item.id);
                      bookmarkMutation.mutate({ id: item.id });
                    }}
                  >
                    Keep
                  </Button>
                </div>
              }
            />
          ))}
        </div>
      </QueryBoundary>
    </div>
  );
}

export function LibraryPage() {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<ContentType | undefined>();
  const [showFinishedOnly, setShowFinishedOnly] = useState(false);

  const libraryQuery = trpc.items.library.useQuery({
    limit: 100,
    search: search.trim() || undefined,
    filter: {
      contentType: selectedType,
      ...(showFinishedOnly ? { isFinished: true } : {}),
    },
  });

  const items: LibraryItem[] = libraryQuery.data?.items ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Library"
        title="The long shelf."
        description="One browseable surface for saved things — searchable, filterable, and still intentionally calm."
        actions={
          <div className="button-row">
            <LinkButton to="/add-link">Add link</LinkButton>
          </div>
        }
      />

      <Surface className="toolbar">
        <Field label="Search" hint="Title or creator">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your shelf"
          />
        </Field>
        <div className="chip-row">
          {CONTENT_FILTERS.map((filter) => (
            <FilterChip
              key={filter.label}
              label={filter.label}
              size="small"
              selected={selectedType === filter.value}
              tone={filter.value ?? 'default'}
              onClick={() => setSelectedType(filter.value)}
            ></FilterChip>
          ))}
          <FilterChip
            label="Finished only"
            size="small"
            selected={showFinishedOnly}
            onClick={() => setShowFinishedOnly((value) => !value)}
          />
        </div>
      </Surface>

      <QueryBoundary
        isLoading={libraryQuery.isLoading}
        error={libraryQuery.error}
        isEmpty={items.length === 0}
        empty={
          <EmptyState
            title="Your library is empty"
            message="Save a link or promote something from the inbox to start your archive."
          />
        }
      >
        <div className="item-list">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </QueryBoundary>
    </div>
  );
}

export function AddLinkPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [url, setUrl] = useState('');
  const [isPending, startTransition] = useTransition();

  const previewQuery = trpc.bookmarks.preview.useQuery(
    { url: url.trim() },
    {
      enabled: isValidUrl(url),
      staleTime: 300_000,
      retry: 1,
      refetchOnWindowFocus: false,
    }
  );

  const saveMutation = trpc.bookmarks.save.useMutation({
    onSuccess: (result: BookmarkSaveResult) => {
      void Promise.all([
        utils.items.library.invalidate(),
        utils.items.home.invalidate(),
        utils.items.inbox.invalidate(),
      ]);
      navigate(`/item/${result.userItemId}`);
    },
  });

  const preview = previewQuery.data;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Add link"
        title="Save something on purpose."
        description="Paste a URL, let Zine enrich it, then decide if it belongs on the shelf."
      />

      <div className="split-layout">
        <Surface className="editor-panel">
          <Field label="URL" hint="Any supported article, video, podcast, or social link">
            <input
              autoFocus
              value={url}
              onChange={(event) => {
                const nextUrl = event.target.value;
                startTransition(() => setUrl(nextUrl));
              }}
              placeholder="https://..."
            />
          </Field>
          <div className="button-row">
            <Button
              disabled={!preview || isPending || saveMutation.isPending}
              onClick={() => {
                if (!preview) return;
                saveMutation.mutate({
                  url: url.trim(),
                  provider: preview.provider,
                  contentType: preview.contentType,
                  providerId: preview.providerId,
                  title: preview.title,
                  creator: preview.creator,
                  creatorImageUrl: preview.creatorImageUrl ?? null,
                  thumbnailUrl: preview.thumbnailUrl,
                  duration: preview.duration,
                  canonicalUrl: preview.canonicalUrl,
                  description: preview.description,
                  siteName: preview.siteName,
                  wordCount: preview.wordCount,
                  readingTimeMinutes: preview.readingTimeMinutes,
                  hasArticleContent: preview.hasArticleContent,
                  publishedAt: preview.publishedAt,
                  rawMetadata: preview.rawMetadata,
                });
              }}
            >
              Save to library
            </Button>
          </div>
        </Surface>

        <QueryBoundary
          isLoading={previewQuery.isLoading}
          error={previewQuery.error}
          isEmpty={!preview}
          empty={
            <EmptyState
              title="Preview will appear here"
              message="Paste a valid URL and Zine will fetch metadata before you save."
            />
          }
        >
          <Surface className="preview-panel">
            <p className="eyebrow">Preview</p>
            <h2>{preview?.title}</h2>
            <p>{preview?.description ?? preview?.creator}</p>
            <div className="meta-row">
              <Badge>{preview?.provider.toLowerCase()}</Badge>
              <span>{preview?.contentType.toLowerCase()}</span>
              {preview?.duration ? <span>{formatDuration(preview.duration)}</span> : null}
              {preview?.readingTimeMinutes ? (
                <span>{preview.readingTimeMinutes} min read</span>
              ) : null}
            </div>
            {preview?.thumbnailUrl ? (
              <img className="preview-panel__image" src={preview.thumbnailUrl} alt="" />
            ) : null}
          </Surface>
        </QueryBoundary>
      </div>
    </div>
  );
}

function stateBadge(state: UserItemState) {
  if (state === UserItemState.BOOKMARKED) return <Badge tone="success">bookmarked</Badge>;
  if (state === UserItemState.ARCHIVED) return <Badge>archived</Badge>;
  return <Badge tone="warning">inbox</Badge>;
}

export function ItemDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const itemQuery = trpc.items.get.useQuery({ id }, { enabled: Boolean(id) });

  const bookmarkMutation = trpc.items.bookmark.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.items.get.invalidate({ id }),
        utils.items.inbox.invalidate(),
        utils.items.library.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const archiveMutation = trpc.items.archive.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.items.get.invalidate({ id }),
        utils.items.inbox.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const unbookmarkMutation = trpc.items.unbookmark.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.items.get.invalidate({ id }),
        utils.items.library.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const toggleFinishedMutation = trpc.items.toggleFinished.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.items.get.invalidate({ id }),
        utils.items.library.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });

  const item = itemQuery.data;

  return (
    <div className="page-stack">
      <QueryBoundary
        isLoading={itemQuery.isLoading}
        error={itemQuery.error}
        isEmpty={!item}
        empty={
          <EmptyState
            title="Item not found"
            message="This item either does not exist or belongs to another account."
            action={<Button onClick={() => navigate(-1)}>Go back</Button>}
          />
        }
      >
        {item ? (
          <>
            <PageHeader
              eyebrow="Item detail"
              title={item.title}
              description={
                item.summary ?? item.creator ?? item.publisher ?? 'Saved from the original source.'
              }
              actions={<div className="button-row">{stateBadge(item.state)}</div>}
            />

            <div className="split-layout">
              <Surface className="detail-panel">
                <div className="detail-grid">
                  <div>
                    <span className="detail-grid__label">Creator</span>
                    <strong>{item.creator || item.publisher || 'Unknown'}</strong>
                  </div>
                  <div>
                    <span className="detail-grid__label">Source</span>
                    <strong>{mapProvider(item.provider)}</strong>
                  </div>
                  <div>
                    <span className="detail-grid__label">Saved</span>
                    <strong>{formatAbsoluteDate(item.bookmarkedAt ?? item.ingestedAt)}</strong>
                  </div>
                  <div>
                    <span className="detail-grid__label">Published</span>
                    <strong>{formatAbsoluteDate(item.publishedAt)}</strong>
                  </div>
                </div>

                <div className="button-row button-row--wrap">
                  {item.state === UserItemState.INBOX ? (
                    <>
                      <Button onClick={() => bookmarkMutation.mutate({ id: item.id })}>
                        Bookmark
                      </Button>
                      <Button tone="ghost" onClick={() => archiveMutation.mutate({ id: item.id })}>
                        Archive
                      </Button>
                    </>
                  ) : null}
                  {item.state === UserItemState.BOOKMARKED ? (
                    <>
                      <Button
                        tone="ghost"
                        onClick={() => toggleFinishedMutation.mutate({ id: item.id })}
                      >
                        {item.isFinished ? 'Mark unfinished' : 'Mark finished'}
                      </Button>
                      <Button
                        tone="danger"
                        onClick={() => unbookmarkMutation.mutate({ id: item.id })}
                      >
                        Remove bookmark
                      </Button>
                    </>
                  ) : null}
                  {item.canonicalUrl ? (
                    <AnchorButton href={item.canonicalUrl} target="_blank" rel="noreferrer">
                      Open original
                    </AnchorButton>
                  ) : null}
                </div>
              </Surface>

              <Surface className="preview-panel">
                <p className="eyebrow">Context</p>
                <h2>{item.title}</h2>
                <p>{item.summary ?? 'No summary available for this item yet.'}</p>
                {item.thumbnailUrl ? (
                  <img className="preview-panel__image" src={item.thumbnailUrl} alt="" />
                ) : null}
              </Surface>
            </div>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}

export function SubscriptionsHubPage() {
  const connectionsQuery = trpc.subscriptions.connections.list.useQuery();
  const subscriptionsQuery = trpc.subscriptions.list.useQuery({ limit: 100 });
  const newslettersStatsQuery = trpc.subscriptions.newsletters.stats.useQuery();
  const rssStatsQuery = trpc.subscriptions.rss.stats.useQuery();

  const connections = connectionsQuery.data;
  const subscriptions: SubscriptionItem[] = subscriptionsQuery.data?.items ?? [];
  const youtubeCount = subscriptions.filter(
    (item: SubscriptionItem) => item.provider === 'YOUTUBE' && item.status !== 'UNSUBSCRIBED'
  ).length;
  const spotifyCount = subscriptions.filter(
    (item: SubscriptionItem) => item.provider === 'SPOTIFY' && item.status !== 'UNSUBSCRIBED'
  ).length;
  const gmailCount = newslettersStatsQuery.data?.active ?? 0;
  const rssCount = rssStatsQuery.data?.active ?? 0;
  const activeIntegrationCount = [
    connections?.YOUTUBE,
    connections?.SPOTIFY,
    connections?.GMAIL,
  ].filter((connection) => connection?.status === 'ACTIVE').length;
  const attentionCount = [connections?.YOUTUBE, connections?.SPOTIFY, connections?.GMAIL].filter(
    (connection) => connection?.status === 'EXPIRED' || connection?.status === 'REVOKED'
  ).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Subscriptions"
        title="Quiet intake, source by source."
        description="Integrations stay separate from triage. Connect what you follow elsewhere, or add RSS directly."
      />

      <Surface className="hero-panel">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>
            {buildSubscriptionsSummary(
              youtubeCount + spotifyCount + gmailCount + rssCount,
              activeIntegrationCount,
              attentionCount
            )}
          </h2>
        </div>
      </Surface>

      <div className="source-grid">
        {SUBSCRIPTION_SOURCES.map((source) => {
          const config = getSubscriptionSourceConfig(source);
          const count =
            source === 'YOUTUBE'
              ? youtubeCount
              : source === 'SPOTIFY'
                ? spotifyCount
                : source === 'GMAIL'
                  ? gmailCount
                  : rssCount;
          const state = getIntegrationState(
            source,
            source === 'YOUTUBE'
              ? (connections?.YOUTUBE?.status ?? null)
              : source === 'SPOTIFY'
                ? (connections?.SPOTIFY?.status ?? null)
                : source === 'GMAIL'
                  ? (connections?.GMAIL?.status ?? null)
                  : null
          );

          return (
            <Link key={source} className="source-card" to={config.route}>
              <Surface className="source-card__surface">
                <p className="eyebrow">{config.integrationName}</p>
                <h2>{config.name}</h2>
                <p>{getHubStatusText(source, state, count)}</p>
                <div className="source-card__footer">
                  <Badge>{formatSourceCount(source, count)}</Badge>
                  <span>Manage source</span>
                </div>
              </Surface>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function getProviderParam(source: string | undefined): SubscriptionSource | null {
  const value = source?.toUpperCase();
  return value === 'YOUTUBE' || value === 'SPOTIFY' || value === 'GMAIL' || value === 'RSS'
    ? value
    : null;
}

export function SubscriptionSourcePage() {
  const params = useParams();
  const source = getProviderParam(params.source);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { getToken } = useAppSession();
  const { mode: authMode } = useAuthAvailability();
  const [search, setSearch] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const providerFilter =
    source && source !== 'RSS'
      ? source === 'YOUTUBE'
        ? Provider.YOUTUBE
        : source === 'SPOTIFY'
          ? Provider.SPOTIFY
          : Provider.GMAIL
      : undefined;
  const discoverProvider = source === 'SPOTIFY' ? Provider.SPOTIFY : Provider.YOUTUBE;

  const connectionsQuery = trpc.subscriptions.connections.list.useQuery();
  const subscriptionsQuery = trpc.subscriptions.list.useQuery({
    limit: 100,
    provider: providerFilter,
  });
  const newslettersQuery = trpc.subscriptions.newsletters.list.useQuery(
    { limit: 100, search: search.trim() || undefined },
    { enabled: source === 'GMAIL' }
  );
  const rssQuery = trpc.subscriptions.rss.list.useQuery(
    { limit: 100, search: search.trim() || undefined },
    { enabled: source === 'RSS' }
  );
  const discoverQuery = trpc.subscriptions.discover.available.useQuery(
    { provider: discoverProvider },
    {
      enabled:
        source === 'YOUTUBE'
          ? connectionsQuery.data?.YOUTUBE?.status === 'ACTIVE'
          : source === 'SPOTIFY'
            ? connectionsQuery.data?.SPOTIFY?.status === 'ACTIVE'
            : false,
      staleTime: 300_000,
    }
  );

  const disconnectMutation = trpc.subscriptions.connections.disconnect.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.subscriptions.connections.list.invalidate(),
        utils.subscriptions.list.invalidate(),
        utils.subscriptions.newsletters.list.invalidate(),
        utils.subscriptions.newsletters.stats.invalidate(),
        utils.subscriptions.rss.list.invalidate(),
        utils.subscriptions.rss.stats.invalidate(),
      ]);
    },
  });
  const addSubscriptionMutation = trpc.subscriptions.add.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.subscriptions.list.invalidate(),
        utils.items.inbox.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const removeSubscriptionMutation = trpc.subscriptions.remove.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.subscriptions.list.invalidate(),
        utils.items.inbox.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const pauseSubscriptionMutation = trpc.subscriptions.pause.useMutation({
    onSuccess: () => {
      void utils.subscriptions.list.invalidate();
    },
  });
  const resumeSubscriptionMutation = trpc.subscriptions.resume.useMutation({
    onSuccess: () => {
      void utils.subscriptions.list.invalidate();
    },
  });
  const syncSubscriptionMutation = trpc.subscriptions.syncNow.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.subscriptions.list.invalidate(),
        utils.items.inbox.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const updateNewsletterMutation = trpc.subscriptions.newsletters.updateStatus.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.subscriptions.newsletters.list.invalidate(),
        utils.subscriptions.newsletters.stats.invalidate(),
        utils.items.inbox.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const unsubscribeNewsletterMutation = trpc.subscriptions.newsletters.unsubscribe.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.subscriptions.newsletters.list.invalidate(),
        utils.subscriptions.newsletters.stats.invalidate(),
      ]);
    },
  });
  const syncNewslettersMutation = trpc.subscriptions.newsletters.syncNow.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.subscriptions.newsletters.list.invalidate(),
        utils.subscriptions.newsletters.stats.invalidate(),
        utils.items.inbox.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const addRssMutation = trpc.subscriptions.rss.add.useMutation({
    onSuccess: () => {
      setRssUrl('');
      void Promise.all([
        utils.subscriptions.rss.list.invalidate(),
        utils.subscriptions.rss.stats.invalidate(),
        utils.items.inbox.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const pauseRssMutation = trpc.subscriptions.rss.pause.useMutation({
    onSuccess: () => void utils.subscriptions.rss.list.invalidate(),
  });
  const resumeRssMutation = trpc.subscriptions.rss.resume.useMutation({
    onSuccess: () => void utils.subscriptions.rss.list.invalidate(),
  });
  const removeRssMutation = trpc.subscriptions.rss.remove.useMutation({
    onSuccess: () => void utils.subscriptions.rss.list.invalidate(),
  });
  const syncRssMutation = trpc.subscriptions.rss.syncNow.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.subscriptions.rss.list.invalidate(),
        utils.subscriptions.rss.stats.invalidate(),
        utils.items.inbox.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });

  if (!source) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Unknown source"
          message="This source does not exist yet."
          action={<Button onClick={() => navigate('/subscriptions')}>Back to subscriptions</Button>}
        />
      </div>
    );
  }

  const config = getSubscriptionSourceConfig(source);
  const connectionStatus =
    source === 'YOUTUBE'
      ? (connectionsQuery.data?.YOUTUBE?.status ?? null)
      : source === 'SPOTIFY'
        ? (connectionsQuery.data?.SPOTIFY?.status ?? null)
        : source === 'GMAIL'
          ? (connectionsQuery.data?.GMAIL?.status ?? null)
          : null;
  const integrationState = getIntegrationState(source, connectionStatus);
  const copy = getIntegrationCardCopy(source, integrationState);
  const oauthUnavailable = authMode !== 'clerk' && source !== 'RSS';
  const subscriptions: SubscriptionItem[] = subscriptionsQuery.data?.items ?? [];
  const sourceSubscriptions: SubscriptionItem[] = subscriptions.filter(
    (item: SubscriptionItem) => item.provider === source
  );
  const rssFeeds: RssFeed[] = rssQuery.data?.items ?? [];
  const newsletters: NewsletterItem[] = newslettersQuery.data?.items ?? [];
  const discoverable: Array<{
    id: string;
    title: string;
    imageUrl: string | null;
    existing: SubscriptionItem | undefined;
  }> =
    source === 'YOUTUBE' || source === 'SPOTIFY'
      ? (discoverQuery.data?.items ?? []).map((item: DiscoverableSubscription) => ({
          id: item.id,
          title: item.name,
          imageUrl: item.imageUrl ?? null,
          existing: sourceSubscriptions.find(
            (subscription: SubscriptionItem) => subscription.providerChannelId === item.id
          ),
        }))
      : [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Source detail"
        title={config.name}
        description={getHubStatusText(
          source,
          integrationState,
          source === 'GMAIL'
            ? newsletters.length
            : source === 'RSS'
              ? rssFeeds.length
              : sourceSubscriptions.length
        )}
      />

      <Surface className="hero-panel">
        <div>
          <p className="eyebrow">Integration</p>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
          {oauthUnavailable ? (
            <p>
              OAuth connections are disabled in local worktree mode because the production Clerk key
              only works on `myzine.app`.
            </p>
          ) : null}
        </div>
        <div className="button-row">
          {copy.actionLabel ? (
            integrationState === 'connected' ? (
              <Button
                tone="danger"
                onClick={() =>
                  disconnectMutation.mutate({
                    provider:
                      source === 'YOUTUBE'
                        ? Provider.YOUTUBE
                        : source === 'SPOTIFY'
                          ? Provider.SPOTIFY
                          : source === 'GMAIL'
                            ? Provider.GMAIL
                            : Provider.RSS,
                  })
                }
              >
                {copy.actionLabel}
              </Button>
            ) : (
              <Button
                disabled={oauthUnavailable}
                onClick={() => {
                  if (source === 'RSS' || oauthUnavailable) return;
                  void connectProvider(source as OAuthProvider, getToken);
                }}
              >
                {copy.actionLabel}
              </Button>
            )
          ) : null}
          {source === 'GMAIL' && integrationState === 'connected' ? (
            <Button tone="ghost" onClick={() => syncNewslettersMutation.mutate()}>
              Sync now
            </Button>
          ) : null}
        </div>
      </Surface>

      {source !== 'RSS' ? (
        <Surface className="toolbar">
          <Field label="Search" hint={config.searchPlaceholder}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={config.searchPlaceholder}
            />
          </Field>
        </Surface>
      ) : null}

      {source === 'RSS' ? (
        <>
          <Surface className="toolbar">
            <Field label="Feed URL" hint="Paste an RSS or Atom feed URL">
              <input
                value={rssUrl}
                onChange={(event) => setRssUrl(event.target.value)}
                placeholder="https://example.com/feed.xml"
              />
            </Field>
            <div className="button-row">
              <Button
                disabled={!isValidUrl(rssUrl)}
                onClick={() => addRssMutation.mutate({ feedUrl: rssUrl.trim() })}
              >
                Add feed
              </Button>
            </div>
          </Surface>

          <QueryBoundary
            isLoading={rssQuery.isLoading}
            error={rssQuery.error}
            isEmpty={rssFeeds.length === 0}
            empty={
              <EmptyState
                title="No RSS feeds yet"
                message="Add a feed URL to start pulling articles into your inbox."
              />
            }
          >
            <div className="item-list">
              {rssFeeds.map((feed: RssFeed) => (
                <Surface key={feed.id} className="source-row">
                  <div>
                    <p className="eyebrow">{feed.status.toLowerCase()}</p>
                    <h3>{feed.title}</h3>
                    <p>{feed.feedUrl}</p>
                  </div>
                  <div className="button-row button-row--wrap">
                    {feed.status === 'ACTIVE' ? (
                      <Button
                        tone="ghost"
                        onClick={() => pauseRssMutation.mutate({ feedId: feed.id })}
                      >
                        Pause
                      </Button>
                    ) : feed.status === 'PAUSED' ? (
                      <Button
                        tone="ghost"
                        onClick={() => resumeRssMutation.mutate({ feedId: feed.id })}
                      >
                        Resume
                      </Button>
                    ) : null}
                    <Button
                      tone="ghost"
                      onClick={() => syncRssMutation.mutate({ feedId: feed.id })}
                    >
                      Sync
                    </Button>
                    <Button
                      tone="danger"
                      onClick={() => removeRssMutation.mutate({ feedId: feed.id })}
                    >
                      Remove
                    </Button>
                  </div>
                </Surface>
              ))}
            </div>
          </QueryBoundary>
        </>
      ) : null}

      {source === 'GMAIL' ? (
        <QueryBoundary
          isLoading={newslettersQuery.isLoading}
          error={newslettersQuery.error}
          isEmpty={newsletters.length === 0}
          empty={
            <EmptyState
              title="No newsletters detected yet"
              message="Connect Gmail and run a sync to see newsletter senders appear here."
            />
          }
        >
          <div className="item-list">
            {newsletters.map((newsletter: NewsletterItem) => (
              <Surface key={newsletter.id} className="source-row">
                <div>
                  <div className="meta-row">
                    <Badge>{newsletter.status.toLowerCase()}</Badge>
                    <span>{formatRelativeDate(newsletter.lastSeenAt)}</span>
                  </div>
                  <h3>{newsletter.displayName}</h3>
                  <p>{newsletter.fromAddress ?? 'Unknown sender'}</p>
                </div>
                <div className="button-row button-row--wrap">
                  <Button
                    tone="ghost"
                    onClick={() =>
                      updateNewsletterMutation.mutate({
                        feedId: newsletter.id,
                        status: newsletter.status === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE',
                      })
                    }
                  >
                    {newsletter.status === 'ACTIVE' ? 'Hide' : 'Activate'}
                  </Button>
                  <Button
                    tone="danger"
                    onClick={() => unsubscribeNewsletterMutation.mutate({ feedId: newsletter.id })}
                  >
                    Unsubscribe
                  </Button>
                </div>
              </Surface>
            ))}
          </div>
        </QueryBoundary>
      ) : null}

      {source === 'YOUTUBE' || source === 'SPOTIFY' ? (
        <QueryBoundary
          isLoading={subscriptionsQuery.isLoading || discoverQuery.isLoading}
          error={subscriptionsQuery.error ?? discoverQuery.error}
          isEmpty={discoverable.length === 0 && sourceSubscriptions.length === 0}
          empty={
            <EmptyState
              title={`No ${config.subscriptionNoun}s yet`}
              message={`Connect ${config.providerLabel} and import the things you already follow.`}
            />
          }
        >
          <div className="item-list">
            {sourceSubscriptions.map((subscription: SubscriptionItem) => (
              <SubscriptionRow
                key={subscription.id}
                subscription={subscription}
                onPause={() =>
                  pauseSubscriptionMutation.mutate({ subscriptionId: subscription.id })
                }
                onResume={() =>
                  resumeSubscriptionMutation.mutate({ subscriptionId: subscription.id })
                }
                onSync={() => syncSubscriptionMutation.mutate({ subscriptionId: subscription.id })}
                onRemove={() =>
                  removeSubscriptionMutation.mutate({ subscriptionId: subscription.id })
                }
              />
            ))}

            {discoverable
              .filter(
                (item) =>
                  !item.existing && item.title.toLowerCase().includes(search.trim().toLowerCase())
              )
              .map((item) => (
                <Surface key={item.id} className="source-row">
                  <div>
                    <p className="eyebrow">Discover</p>
                    <h3>{item.title}</h3>
                    <p>{config.providerLabel} candidate ready to import.</p>
                  </div>
                  <Button
                    onClick={() =>
                      addSubscriptionMutation.mutate({
                        provider: source === 'YOUTUBE' ? Provider.YOUTUBE : Provider.SPOTIFY,
                        providerChannelId: item.id,
                        name: item.title,
                        imageUrl: item.imageUrl ?? undefined,
                      })
                    }
                  >
                    Subscribe
                  </Button>
                </Surface>
              ))}
          </div>
        </QueryBoundary>
      ) : null}
    </div>
  );
}

function SubscriptionRow({
  subscription,
  onPause,
  onResume,
  onSync,
  onRemove,
}: {
  subscription: SubscriptionItem;
  onPause: () => void;
  onResume: () => void;
  onSync: () => void;
  onRemove: () => void;
}) {
  return (
    <Surface className="source-row">
      <div>
        <div className="meta-row">
          <Badge
            tone={
              subscription.status === 'ACTIVE'
                ? 'success'
                : subscription.status === 'PAUSED'
                  ? 'warning'
                  : 'default'
            }
          >
            {subscription.status.toLowerCase()}
          </Badge>
          {subscription.lastPublishedAt ? (
            <span>{formatRelativeDate(subscription.lastPublishedAt)}</span>
          ) : null}
        </div>
        <h3>{subscription.name}</h3>
        <p>{subscription.description ?? 'Connected source'}</p>
      </div>
      <div className="button-row button-row--wrap">
        {subscription.status === 'ACTIVE' ? (
          <Button tone="ghost" onClick={onPause}>
            Pause
          </Button>
        ) : subscription.status === 'PAUSED' ? (
          <Button tone="ghost" onClick={onResume}>
            Resume
          </Button>
        ) : null}
        <Button tone="ghost" onClick={onSync}>
          Sync
        </Button>
        <Button tone="danger" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </Surface>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { mode } = useAuthAvailability();
  const { signOut } = useAppSession();
  const connectionsQuery = trpc.subscriptions.connections.list.useQuery();
  const subscriptionsQuery = trpc.subscriptions.list.useQuery({ limit: 100 });
  const newslettersStatsQuery = trpc.subscriptions.newsletters.stats.useQuery();
  const rssStatsQuery = trpc.subscriptions.rss.stats.useQuery();

  const connections = connectionsQuery.data;
  const subscriptions: SubscriptionItem[] = subscriptionsQuery.data?.items ?? [];
  const activeSubscriptionCount =
    subscriptions.filter((item: SubscriptionItem) => item.status !== 'UNSUBSCRIBED').length +
    (newslettersStatsQuery.data?.active ?? 0) +
    (rssStatsQuery.data?.active ?? 0);
  const connectedIntegrationCount = [
    connections?.YOUTUBE,
    connections?.SPOTIFY,
    connections?.GMAIL,
  ].filter((connection) => connection?.status === 'ACTIVE').length;
  const attentionCount = [connections?.YOUTUBE, connections?.SPOTIFY, connections?.GMAIL].filter(
    (connection) => connection?.status === 'EXPIRED' || connection?.status === 'REVOKED'
  ).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Settings"
        title="Account and quiet maintenance."
        description="A minimal control room: sources, recap, and the account switch."
      />

      <div className="group-grid">
        <Surface className="group-panel">
          <div className="group-panel__header">
            <h3>Subscriptions</h3>
            <Badge>{activeSubscriptionCount}</Badge>
          </div>
          <p>
            {buildSubscriptionsSummary(
              activeSubscriptionCount,
              connectedIntegrationCount,
              attentionCount
            )}
          </p>
          <div className="button-row">
            <LinkButton to="/subscriptions">Manage sources</LinkButton>
          </div>
        </Surface>

        <Surface className="group-panel">
          <div className="group-panel__header">
            <h3>Insights</h3>
            <Badge>weekly</Badge>
          </div>
          <p>Review how your last week tilted across reading, listening, and watching.</p>
          <div className="button-row">
            <LinkButton to="/recap/weekly">Open weekly recap</LinkButton>
          </div>
        </Surface>

        <Surface className="group-panel">
          <div className="group-panel__header">
            <h3>About</h3>
            <Badge>v{WEB_APP_VERSION}</Badge>
          </div>
          <p>
            The browser channel is tuned for wider layouts and calmer browsing, without changing the
            backend model.
          </p>
          <div className="button-row button-row--wrap">
            <AnchorButton href="https://myzine.app/terms" target="_blank" rel="noreferrer">
              Terms
            </AnchorButton>
            <AnchorButton href="https://myzine.app/privacy" target="_blank" rel="noreferrer">
              Privacy
            </AnchorButton>
          </div>
        </Surface>
      </div>

      <Surface className="hero-panel">
        <div>
          <p className="eyebrow">Account</p>
          <h2>
            {mode === 'clerk' ? 'End the session cleanly.' : 'Authentication is unavailable.'}
          </h2>
          <p>
            {mode === 'clerk'
              ? 'Signing out returns you to the Clerk-powered auth shell.'
              : 'Set `VITE_CLERK_PUBLISHABLE_KEY` to enable the web auth flow.'}
          </p>
        </div>
        <Button
          tone={mode === 'clerk' ? 'danger' : 'ghost'}
          onClick={() =>
            mode === 'clerk'
              ? signOut({
                  redirectUrl: '/sign-in',
                }).then(() => navigate('/sign-in', { replace: true }))
              : navigate('/', { replace: true })
          }
        >
          {mode === 'clerk' ? 'Sign out' : 'Back home'}
        </Button>
      </Surface>
    </div>
  );
}

export function WeeklyRecapPage() {
  const timezone = useRecapTimezone();
  const recapQuery = trpc.insights.weeklyRecap.useQuery(timezone ? { timezone } : undefined, {
    staleTime: 60_000,
  });

  const recap = recapQuery.data;
  const modeRows = recap
    ? [
        { label: 'Reading', minutes: recap.totals.estimatedMinutesByMode.reading },
        { label: 'Watching', minutes: recap.totals.estimatedMinutesByMode.watching },
        { label: 'Listening', minutes: recap.totals.estimatedMinutesByMode.listening },
      ]
    : [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Weekly recap"
        title={recap?.window.label ?? 'Weekly recap'}
        description="A high-level reading of your week — what got finished, which mode dominated, and where the time went."
      />

      <QueryBoundary
        isLoading={recapQuery.isLoading}
        error={recapQuery.error}
        isEmpty={!recap}
        empty={
          <EmptyState
            title="No recap yet"
            message="Finish a few saved things and the week will start to take shape."
          />
        }
      >
        {recap ? (
          <>
            <div className="stats-grid">
              <StatCard
                label="Completed"
                value={String(recap.totals.completedCount)}
                detail={`${formatEstimatedMinutes(recap.headline.estimatedTotalMinutes)} estimated time`}
              />
              <StatCard
                label="Started"
                value={String(recap.totals.startedCount)}
                detail={
                  formatDeltaLabel(recap.headline.estimatedMinutesDeltaPct) ??
                  'No change vs last week'
                }
              />
              <StatCard
                label="Dominant mode"
                value={recap.headline.dominantMode.toLowerCase()}
                detail={recap.window.label}
              />
            </div>

            <Surface className="group-panel">
              <div className="group-panel__header">
                <h3>Mode split</h3>
                <Badge>{recap.window.label}</Badge>
              </div>
              <div className="mode-stack">
                {modeRows.map((row) => (
                  <div key={row.label} className="mode-row">
                    <div className="mode-row__meta">
                      <strong>{row.label}</strong>
                      <span>{formatEstimatedMinutes(row.minutes)}</span>
                    </div>
                    <div className="mode-row__track">
                      <div
                        className="mode-row__fill"
                        style={{
                          width: `${recap.headline.estimatedTotalMinutes > 0 ? Math.max(10, Math.round((row.minutes / recap.headline.estimatedTotalMinutes) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Surface>

            <div className="group-grid">
              <Surface className="group-panel">
                <div className="group-panel__header">
                  <h3>Top creator</h3>
                </div>
                <p>{recap.highlights.topCreators[0]?.creator ?? 'No standout yet'}</p>
              </Surface>
              <Surface className="group-panel">
                <div className="group-panel__header">
                  <h3>Top provider</h3>
                </div>
                <p>{recap.highlights.topProviders[0]?.provider ?? 'No standout yet'}</p>
              </Surface>
            </div>
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}

export function OAuthCallbackPage() {
  const { getToken } = useAppSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('Finishing the provider connection…');

  useEffect(() => {
    void completeOAuthFlow(new URLSearchParams(location.search), getToken)
      .then((provider) => {
        navigate(`/subscriptions/${provider.toLowerCase()}`, { replace: true });
      })
      .catch((error) => {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Could not finish the OAuth flow.');
      });
  }, [getToken, location.search, navigate]);

  return (
    <main className="shell-loading">
      <div>
        <p className="eyebrow">
          {status === 'working' ? 'Connecting source' : 'Connection failed'}
        </p>
        <h1>{message}</h1>
        {status === 'error' ? (
          <div className="button-row">
            <LinkButton to="/subscriptions">Back to subscriptions</LinkButton>
          </div>
        ) : null}
      </div>
    </main>
  );
}
