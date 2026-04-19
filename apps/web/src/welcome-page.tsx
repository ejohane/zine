import { Loader2, Mail, Podcast, Rss, Video, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FaSpotify } from 'react-icons/fa';
import { IoLogoYoutube, IoNewspaperOutline } from 'react-icons/io5';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Provider } from '@zine/shared';

import { Button, EmptyState, Surface, cn } from './components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import {
  clearOnboardingOAuthContext,
  getOnboardingOAuthContext,
  providerToWizardStep,
  setOnboardingOAuthContext,
  sourceConfigs,
  type WizardStep,
} from './lib/onboarding';
import { connectProvider } from './lib/oauth';
import { trpc, useAppSession } from './lib/trpc';

type IntegrationStep = Exclude<WizardStep, 'DONE'>;

const STEP_ICONS: Record<IntegrationStep, LucideIcon> = {
  SPOTIFY: Podcast,
  YOUTUBE: Video,
  GMAIL: Mail,
  RSS: Rss,
};

const INTRO_STEPS: IntegrationStep[] = ['YOUTUBE', 'SPOTIFY', 'GMAIL', 'RSS'];

const INTRO_STEP_SUMMARIES: Record<IntegrationStep, string> = {
  YOUTUBE: 'Choose channels to import.',
  SPOTIFY: 'Pick the podcast shows you follow.',
  GMAIL: 'Review newsletter senders from Gmail.',
  RSS: 'Add blogs and feeds by URL.',
};

const INTRO_BRAND: Record<IntegrationStep, { bg: string; icon: ReactNode }> = {
  YOUTUBE: {
    bg: '#FF0000',
    icon: <IoLogoYoutube size={18} color="#FFFFFF" />,
  },
  SPOTIFY: {
    bg: '#1DB954',
    icon: <FaSpotify size={18} color="#FFFFFF" />,
  },
  GMAIL: {
    bg: '#1A73E8',
    icon: <IoNewspaperOutline size={18} color="#FFFFFF" />,
  },
  RSS: {
    bg: '#F59E0B',
    icon: <Rss size={16} color="#FFFFFF" strokeWidth={2.5} />,
  },
};

type ConnectionsData =
  | {
      YOUTUBE: { status: string } | null;
      SPOTIFY: { status: string } | null;
      GMAIL: { status: string } | null;
    }
  | undefined;

function isConnected(connections: ConnectionsData, provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL') {
  return connections?.[provider]?.status === 'ACTIVE';
}

type PickerItem = {
  id: string;
  label: string;
  description?: string | null;
};

type SubscriptionPickerProps = {
  testId: string;
  items: PickerItem[];
  isLoading: boolean;
  emptyMessage: string;
  searchLabel: string;
  itemNounSingular: string;
  itemNounPlural: string;
  onImport: (selected: PickerItem[], deselected: PickerItem[]) => Promise<void> | void;
  onBack: () => void;
  backLabel?: string;
  isImporting: boolean;
};

function SubscriptionPicker({
  testId,
  items,
  isLoading,
  emptyMessage,
  searchLabel,
  itemNounSingular,
  itemNounPlural,
  onImport,
  onBack,
  backLabel = 'Back to integrations',
  isImporting,
}: SubscriptionPickerProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || (item.description ?? '').toLowerCase().includes(q)
    );
  }, [items, query]);

  const allSelected = items.length > 0 && selected.size === items.length;

  const toggleItem = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((current) => {
      if (current.size === items.length) {
        return new Set();
      }
      return new Set(items.map((item) => item.id));
    });
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected]
  );
  const deselectedItems = useMemo(
    () => items.filter((item) => !selected.has(item.id)),
    [items, selected]
  );

  const importLabel =
    selectedItems.length === 0
      ? `Import ${itemNounPlural}`
      : `Import ${selectedItems.length} ${selectedItems.length === 1 ? itemNounSingular : itemNounPlural}`;

  return (
    <div className="wizard-picker" data-testid={testId}>
      <div className="wizard-picker__controls">
        <label className="wizard-picker__search">
          <span className="visually-hidden">{searchLabel}</span>
          <input
            type="search"
            role="searchbox"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label className="wizard-picker__select-all">
          <input
            type="checkbox"
            aria-label={`Select all ${itemNounPlural}`}
            checked={allSelected}
            onChange={toggleAll}
            disabled={items.length === 0}
          />
          <span>Select all</span>
          <span className="wizard-picker__count">
            {selected.size}/{items.length}
          </span>
        </label>
      </div>

      <div className="wizard-picker__list" role="group" aria-label={searchLabel}>
        {isLoading ? (
          <div className="wizard-picker__loading">
            <Loader2 size={18} className="wizard-picker__spinner" aria-hidden="true" />
            <span>Loading {itemNounPlural}…</span>
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={`No ${itemNounPlural} found`} message={emptyMessage} />
        ) : filtered.length === 0 ? (
          <p className="wizard-picker__empty">No {itemNounPlural} match that search.</p>
        ) : (
          <ul className="wizard-picker__items">
            {filtered.map((item) => {
              const inputId = `picker-${testId}-${item.id}`;
              return (
                <li key={item.id} className="wizard-picker__item">
                  <input
                    id={inputId}
                    type="checkbox"
                    aria-label={item.label}
                    checked={selected.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                  />
                  <label htmlFor={inputId}>
                    <strong>{item.label}</strong>
                    {item.description ? <span>{item.description}</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="wizard-footer">
        <Button tone="ghost" onClick={onBack}>
          {backLabel}
        </Button>
        <Button
          onClick={() => {
            void onImport(selectedItems, deselectedItems);
          }}
          disabled={isImporting || selectedItems.length === 0}
        >
          {isImporting ? 'Importing…' : importLabel}
        </Button>
      </div>
    </div>
  );
}

type ConnectGateProps = {
  provider: 'SPOTIFY' | 'YOUTUBE' | 'GMAIL';
  title: string;
  description: string;
  onConnect: () => void;
  onBack: () => void;
  error: string | null;
};

function ConnectGate({ provider, title, description, onConnect, onBack, error }: ConnectGateProps) {
  const Icon = STEP_ICONS[provider];
  return (
    <div className="wizard-connect">
      <div className="wizard-connect__icon" aria-hidden="true">
        <Icon size={28} />
      </div>
      <div className="wizard-connect__copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {error ? <p className="wizard-connect__error">{error}</p> : null}
      <div className="wizard-footer">
        <Button tone="ghost" onClick={onBack}>
          Back to integrations
        </Button>
        <Button onClick={onConnect}>Connect {sourceConfigs[provider].title}</Button>
      </div>
    </div>
  );
}

export function WelcomePage() {
  const { getToken } = useAppSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const origin = searchParams.get('origin') === 'settings' ? 'settings' : 'welcome';
  const closePath = origin === 'settings' ? '/settings' : '/bookmarks';

  const [activeStep, setActiveStep] = useState<IntegrationStep | null>(null);
  const [stepError, setStepError] = useState<Partial<Record<IntegrationStep, string>>>({});
  const [rssUrl, setRssUrl] = useState('');
  const [rssDiscoveryUrl, setRssDiscoveryUrl] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const processedOauthContextRef = useRef<string | null>(null);

  const connectionsQuery = trpc.subscriptions.connections.list.useQuery();
  const connections = connectionsQuery.data;

  const spotifyAvailable = trpc.subscriptions.discover.available.useQuery({
    provider: Provider.SPOTIFY,
  });
  const youtubeAvailable = trpc.subscriptions.discover.available.useQuery({
    provider: Provider.YOUTUBE,
  });
  const newslettersListQuery = trpc.subscriptions.newsletters.list.useQuery({ limit: 100 });
  const rssDiscoverQuery = trpc.subscriptions.rss.discover.useQuery(
    { url: rssDiscoveryUrl ?? 'https://example.com' },
    { enabled: Boolean(rssDiscoveryUrl) }
  );

  const addSubscription = trpc.subscriptions.add.useMutation();
  const syncNewsletters = trpc.subscriptions.newsletters.syncNow.useMutation();
  const updateNewsletterStatus = trpc.subscriptions.newsletters.updateStatus.useMutation();
  const addRss = trpc.subscriptions.rss.add.useMutation();

  const handleClose = useCallback(() => {
    navigate(closePath, { replace: true });
  }, [closePath, navigate]);

  const handleSelectStep = useCallback((step: IntegrationStep) => {
    setStepError((current) => ({ ...current, [step]: undefined }));
    setActiveStep(step);
  }, []);

  const handleBackToIntegrations = useCallback(() => {
    setActiveStep(null);
    setRssUrl('');
    setRssDiscoveryUrl(null);
  }, []);

  const handleConnect = useCallback(
    async (provider: 'SPOTIFY' | 'YOUTUBE' | 'GMAIL') => {
      setStepError((current) => ({ ...current, [provider]: undefined }));
      setOnboardingOAuthContext({ origin, provider });
      try {
        await connectProvider(provider, getToken);
      } catch (error) {
        setStepError((current) => ({
          ...current,
          [provider]:
            error instanceof Error ? error.message : 'Could not start the connection flow.',
        }));
      }
    },
    [getToken, origin]
  );

  // Resume on the provider step after returning from OAuth.
  useEffect(() => {
    const context = getOnboardingOAuthContext();
    if (!context) return;
    const key = `${context.origin}:${context.provider}`;
    if (processedOauthContextRef.current === key) return;
    if (!isConnected(connections, context.provider)) return;

    processedOauthContextRef.current = key;
    clearOnboardingOAuthContext();
    setActiveStep(providerToWizardStep(context.provider));
  }, [connections]);

  const importSpotify = useCallback(
    async (selected: PickerItem[]) => {
      setIsImporting(true);
      try {
        for (const item of selected) {
          await addSubscription.mutateAsync({
            provider: Provider.SPOTIFY,
            providerChannelId: item.id,
            name: item.label,
          });
        }
        handleBackToIntegrations();
      } catch (error) {
        setStepError((current) => ({
          ...current,
          SPOTIFY: error instanceof Error ? error.message : 'Could not import shows.',
        }));
      } finally {
        setIsImporting(false);
      }
    },
    [addSubscription, handleBackToIntegrations]
  );

  const importYoutube = useCallback(
    async (selected: PickerItem[]) => {
      setIsImporting(true);
      try {
        for (const item of selected) {
          await addSubscription.mutateAsync({
            provider: Provider.YOUTUBE,
            providerChannelId: item.id,
            name: item.label,
          });
        }
        handleBackToIntegrations();
      } catch (error) {
        setStepError((current) => ({
          ...current,
          YOUTUBE: error instanceof Error ? error.message : 'Could not import channels.',
        }));
      } finally {
        setIsImporting(false);
      }
    },
    [addSubscription, handleBackToIntegrations]
  );

  const importNewsletters = useCallback(
    async (selected: PickerItem[], deselected: PickerItem[]) => {
      setIsImporting(true);
      try {
        for (const item of selected) {
          await updateNewsletterStatus.mutateAsync({ feedId: item.id, status: 'ACTIVE' });
        }
        for (const item of deselected) {
          await updateNewsletterStatus.mutateAsync({ feedId: item.id, status: 'HIDDEN' });
        }
        handleBackToIntegrations();
      } catch (error) {
        setStepError((current) => ({
          ...current,
          GMAIL: error instanceof Error ? error.message : 'Could not update newsletters.',
        }));
      } finally {
        setIsImporting(false);
      }
    },
    [handleBackToIntegrations, updateNewsletterStatus]
  );

  const importRss = useCallback(
    async (selected: PickerItem[]) => {
      setIsImporting(true);
      try {
        for (const item of selected) {
          await addRss.mutateAsync({ feedUrl: item.id, seedMode: 'latest' });
        }
        handleBackToIntegrations();
      } catch (error) {
        setStepError((current) => ({
          ...current,
          RSS: error instanceof Error ? error.message : 'Could not add feeds.',
        }));
      } finally {
        setIsImporting(false);
      }
    },
    [addRss, handleBackToIntegrations]
  );

  const handleScanNewsletters = useCallback(async () => {
    setStepError((current) => ({ ...current, GMAIL: undefined }));
    try {
      await syncNewsletters.mutateAsync(undefined);
    } catch (error) {
      setStepError((current) => ({
        ...current,
        GMAIL: error instanceof Error ? error.message : 'Could not scan newsletters.',
      }));
    }
  }, [syncNewsletters]);

  const rssCandidates = useMemo<PickerItem[]>(() => {
    const candidates = rssDiscoverQuery.data?.candidates ?? [];
    return candidates.map((candidate) => ({
      id: candidate.feedUrl,
      label: candidate.title ?? candidate.feedUrl,
      description: candidate.feedUrl,
    }));
  }, [rssDiscoverQuery.data?.candidates]);

  const dialogTitle = useMemo(() => {
    if (!activeStep) {
      return 'Set up your sources';
    }

    switch (activeStep) {
      case 'SPOTIFY':
        return 'Import from Spotify';
      case 'YOUTUBE':
        return 'Import from YouTube';
      case 'GMAIL':
        return 'Import your newsletters';
      case 'RSS':
        return 'Add blogs & feeds';
    }
  }, [activeStep]);

  const dialogDescription = useMemo(() => {
    if (!activeStep) {
      return 'Pick an integration to connect or review. Connected providers jump straight to the subscriptions list.';
    }

    switch (activeStep) {
      case 'SPOTIFY':
        return 'Connect Spotify and pick which podcasts to bring into Zine.';
      case 'YOUTUBE':
        return 'Connect YouTube and pick which channels to bring into Zine.';
      case 'GMAIL':
        return 'Connect Gmail and pick which newsletters to keep active in Zine.';
      case 'RSS':
        return 'Paste a URL and pick which feeds to follow.';
    }
  }, [activeStep]);

  return (
    <Dialog open onOpenChange={(open) => (!open ? handleClose() : undefined)}>
      <DialogContent
        className="onboarding-dialog__content onboarding-dialog__content--compact"
        aria-describedby="welcome-dialog-description"
        aria-labelledby="welcome-dialog-title"
      >
        <div className="onboarding-dialog onboarding-dialog--compact">
          <header className="onboarding-dialog__header">
            <div className="onboarding-dialog__header-copy">
              <p className="eyebrow">Guided setup</p>
              <DialogTitle id="welcome-dialog-title" className="onboarding-dialog__title">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription
                id="welcome-dialog-description"
                className="onboarding-dialog__description"
              >
                {dialogDescription}
              </DialogDescription>
            </div>
            <button
              type="button"
              className="button button--ghost onboarding-dialog__close"
              aria-label="Close guided setup"
              onClick={handleClose}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </header>

          <div className="onboarding-dialog__body onboarding-dialog__body--compact">
            <Surface
              className={cn(
                'onboarding-dialog__panel',
                !activeStep ? 'wizard-intro' : 'wizard-panel'
              )}
            >
              {!activeStep ? <IntroStep onSelect={handleSelectStep} /> : null}

              {activeStep === 'SPOTIFY' ? (
                <SpotifyStep
                  connections={connections}
                  available={spotifyAvailable.data?.items ?? []}
                  isLoading={spotifyAvailable.isLoading}
                  isImporting={isImporting}
                  onConnect={() => void handleConnect('SPOTIFY')}
                  onBack={handleBackToIntegrations}
                  onImport={importSpotify}
                  error={stepError.SPOTIFY ?? null}
                />
              ) : null}

              {activeStep === 'YOUTUBE' ? (
                <YoutubeStep
                  connections={connections}
                  available={youtubeAvailable.data?.items ?? []}
                  isLoading={youtubeAvailable.isLoading}
                  isImporting={isImporting}
                  onConnect={() => void handleConnect('YOUTUBE')}
                  onBack={handleBackToIntegrations}
                  onImport={importYoutube}
                  error={stepError.YOUTUBE ?? null}
                />
              ) : null}

              {activeStep === 'GMAIL' ? (
                <GmailStep
                  connections={connections}
                  newsletters={newslettersListQuery.data?.items ?? []}
                  isLoading={newslettersListQuery.isLoading}
                  isSyncing={syncNewsletters.isPending}
                  isImporting={isImporting}
                  onConnect={() => void handleConnect('GMAIL')}
                  onScan={() => void handleScanNewsletters()}
                  onBack={handleBackToIntegrations}
                  onImport={importNewsletters}
                  error={stepError.GMAIL ?? null}
                />
              ) : null}

              {activeStep === 'RSS' ? (
                <RssStep
                  url={rssUrl}
                  onUrlChange={setRssUrl}
                  onDiscover={() => {
                    if (rssUrl.trim()) setRssDiscoveryUrl(rssUrl.trim());
                  }}
                  candidates={rssCandidates}
                  isDiscovering={rssDiscoverQuery.isLoading && Boolean(rssDiscoveryUrl)}
                  isImporting={isImporting}
                  onBack={handleBackToIntegrations}
                  onImport={importRss}
                  error={stepError.RSS ?? null}
                />
              ) : null}
            </Surface>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IntroStep({ onSelect }: { onSelect: (step: IntegrationStep) => void }) {
  return (
    <div className="wizard-intro__content">
      <ul className="wizard-intro__list" aria-label="Available integrations">
        {INTRO_STEPS.map((step) => {
          const config = sourceConfigs[step];
          const brand = INTRO_BRAND[step];
          return (
            <li key={step} className="wizard-intro__item">
              <button
                type="button"
                className="wizard-intro__button"
                onClick={() => onSelect(step)}
                aria-label={`Open ${config.title} integration`}
              >
                <span
                  className="wizard-intro__icon wizard-intro__icon--brand"
                  aria-hidden="true"
                  style={{ backgroundColor: brand.bg }}
                >
                  {brand.icon}
                </span>
                <div className="wizard-intro__copy">
                  <h3>{config.title}</h3>
                  <p>{INTRO_STEP_SUMMARIES[step]}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type ProviderStepProps = {
  connections: ConnectionsData;
  available: Array<{ id: string; name: string }>;
  isLoading: boolean;
  isImporting: boolean;
  onConnect: () => void;
  onBack: () => void;
  onImport: (selected: PickerItem[], deselected: PickerItem[]) => Promise<void> | void;
  error: string | null;
};

function SpotifyStep({
  connections,
  available,
  isLoading,
  isImporting,
  onConnect,
  onBack,
  onImport,
  error,
}: ProviderStepProps) {
  const connected = isConnected(connections, 'SPOTIFY');
  const config = sourceConfigs.SPOTIFY;

  if (!connected) {
    return (
      <StepShell title={config.title} summary={config.summary} stepIcon="SPOTIFY">
        <ConnectGate
          provider="SPOTIFY"
          title="Connect Spotify"
          description="Log in with Spotify to see the podcasts you follow."
          onConnect={onConnect}
          onBack={onBack}
          error={error}
        />
      </StepShell>
    );
  }

  return (
    <StepShell title={config.title} summary="Pick the Spotify shows to import." stepIcon="SPOTIFY">
      {error ? <p className="wizard-connect__error">{error}</p> : null}
      <SubscriptionPicker
        testId="spotify-picker"
        items={available.map((item) => ({ id: item.id, label: item.name }))}
        isLoading={isLoading}
        emptyMessage="No shows found on your Spotify account."
        searchLabel="Search Spotify shows"
        itemNounSingular={config.itemNounSingular}
        itemNounPlural={config.itemNounPlural}
        onImport={onImport}
        onBack={onBack}
        isImporting={isImporting}
      />
    </StepShell>
  );
}

function YoutubeStep({
  connections,
  available,
  isLoading,
  isImporting,
  onConnect,
  onBack,
  onImport,
  error,
}: ProviderStepProps) {
  const connected = isConnected(connections, 'YOUTUBE');
  const config = sourceConfigs.YOUTUBE;

  if (!connected) {
    return (
      <StepShell title={config.title} summary={config.summary} stepIcon="YOUTUBE">
        <ConnectGate
          provider="YOUTUBE"
          title="Connect YouTube"
          description="Log in with Google to see the channels you subscribe to."
          onConnect={onConnect}
          onBack={onBack}
          error={error}
        />
      </StepShell>
    );
  }

  return (
    <StepShell
      title={config.title}
      summary="Pick the YouTube channels to import."
      stepIcon="YOUTUBE"
    >
      {error ? <p className="wizard-connect__error">{error}</p> : null}
      <SubscriptionPicker
        testId="youtube-picker"
        items={available.map((item) => ({ id: item.id, label: item.name }))}
        isLoading={isLoading}
        emptyMessage="No channels found on your YouTube account."
        searchLabel="Search YouTube channels"
        itemNounSingular={config.itemNounSingular}
        itemNounPlural={config.itemNounPlural}
        onImport={onImport}
        onBack={onBack}
        isImporting={isImporting}
      />
    </StepShell>
  );
}

type GmailStepProps = {
  connections: ConnectionsData;
  newsletters: Array<{
    id: string;
    displayName: string;
    fromAddress: string | null;
    status?: string;
  }>;
  isLoading: boolean;
  isSyncing: boolean;
  isImporting: boolean;
  onConnect: () => void;
  onScan: () => void;
  onBack: () => void;
  onImport: (selected: PickerItem[], deselected: PickerItem[]) => Promise<void> | void;
  error: string | null;
};

function GmailStep({
  connections,
  newsletters,
  isLoading,
  isSyncing,
  isImporting,
  onConnect,
  onScan,
  onBack,
  onImport,
  error,
}: GmailStepProps) {
  const connected = isConnected(connections, 'GMAIL');
  const config = sourceConfigs.GMAIL;

  if (!connected) {
    return (
      <StepShell title={config.title} summary={config.summary} stepIcon="GMAIL">
        <ConnectGate
          provider="GMAIL"
          title="Connect Gmail"
          description="Log in with Google so Zine can scan for newsletters in your inbox."
          onConnect={onConnect}
          onBack={onBack}
          error={error}
        />
      </StepShell>
    );
  }

  if (newsletters.length === 0) {
    return (
      <StepShell
        title={config.title}
        summary="Scan your inbox to find newsletter senders."
        stepIcon="GMAIL"
      >
        {error ? <p className="wizard-connect__error">{error}</p> : null}
        <div className="wizard-connect">
          <div className="wizard-connect__icon" aria-hidden="true">
            <Mail size={28} />
          </div>
          <div className="wizard-connect__copy">
            <h3>Scan for newsletters</h3>
            <p>
              Gmail is connected. Run a quick scan to pull in newsletter senders you can pick from.
            </p>
          </div>
          <div className="wizard-footer">
            <Button tone="ghost" onClick={onBack}>
              Back to integrations
            </Button>
            <Button onClick={onScan} disabled={isSyncing || isLoading}>
              {isSyncing ? 'Scanning…' : 'Scan newsletters'}
            </Button>
          </div>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell title={config.title} summary="Pick the newsletters to keep active." stepIcon="GMAIL">
      {error ? <p className="wizard-connect__error">{error}</p> : null}
      <SubscriptionPicker
        testId="gmail-picker"
        items={newsletters.map((newsletter) => ({
          id: newsletter.id,
          label: newsletter.displayName,
          description: newsletter.fromAddress ?? undefined,
        }))}
        isLoading={isLoading}
        emptyMessage="No newsletters found yet. Run a scan to find more."
        searchLabel="Search newsletters"
        itemNounSingular={config.itemNounSingular}
        itemNounPlural={config.itemNounPlural}
        onImport={onImport}
        onBack={onBack}
        isImporting={isImporting}
      />
    </StepShell>
  );
}

type RssStepProps = {
  url: string;
  onUrlChange: (value: string) => void;
  onDiscover: () => void;
  candidates: PickerItem[];
  isDiscovering: boolean;
  isImporting: boolean;
  onBack: () => void;
  onImport: (selected: PickerItem[], deselected: PickerItem[]) => Promise<void> | void;
  error: string | null;
};

function RssStep({
  url,
  onUrlChange,
  onDiscover,
  candidates,
  isDiscovering,
  isImporting,
  onBack,
  onImport,
  error,
}: RssStepProps) {
  const config = sourceConfigs.RSS;
  return (
    <StepShell
      title={config.title}
      summary="Find feeds by URL and import the ones you want."
      stepIcon="RSS"
    >
      {error ? <p className="wizard-connect__error">{error}</p> : null}

      <div className="wizard-rss__form">
        <label className="field">
          <span className="field__label">Website or feed URL</span>
          <input
            type="url"
            aria-label="Website or feed URL"
            value={url}
            placeholder="https://example.com"
            onChange={(event) => onUrlChange(event.target.value)}
          />
        </label>
        <Button onClick={onDiscover} disabled={!url.trim() || isDiscovering}>
          {isDiscovering ? 'Searching…' : 'Discover feeds'}
        </Button>
      </div>

      {candidates.length > 0 ? (
        <SubscriptionPicker
          testId="rss-picker"
          items={candidates}
          isLoading={false}
          emptyMessage="No feeds found for that URL."
          searchLabel="Search discovered feeds"
          itemNounSingular={config.itemNounSingular}
          itemNounPlural={config.itemNounPlural}
          onImport={onImport}
          onBack={onBack}
          isImporting={isImporting}
        />
      ) : (
        <div className="wizard-footer">
          <Button tone="ghost" onClick={onBack}>
            Back to integrations
          </Button>
        </div>
      )}
    </StepShell>
  );
}

type StepShellProps = {
  title: string;
  summary: string;
  stepIcon: IntegrationStep;
  children: ReactNode;
};

function StepShell({ title, summary, stepIcon, children }: StepShellProps) {
  const Icon = STEP_ICONS[stepIcon];
  return (
    <div className="wizard-step">
      <header className="wizard-step__header">
        <span className="wizard-step__icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div>
          <h2 className="wizard-step__title">{title}</h2>
          <p className="wizard-step__summary">{summary}</p>
        </div>
      </header>
      <div className="wizard-step__body">{children}</div>
    </div>
  );
}
