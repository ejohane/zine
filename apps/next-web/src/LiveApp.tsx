import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, Archive, Check, LogOut, RefreshCw, Sparkles, WifiOff } from 'lucide-react';
import { Header } from './Feed';
import { DestinationNav, readDestination } from './DestinationNav';
import type { Destination } from './DestinationNav';
import { BentoFeed, HomeFeed } from './HomeFeed';
import { headlines, progress, resumeLabel, safeURL, timestamp } from './model';
import type { Item, Section } from './model';
import { API, ServiceError, apiOrigin, appURL, message } from './live-api';
import type { RemoteItem, Collection, Material } from './live-api';
import { loadAuth, token } from './auth';
import type { Identity } from './auth';
import {
  clearPrivateData,
  forgetItem,
  forgetMaterial,
  readSnapshot,
  writeSnapshot,
  readItem,
  writeItem,
  readMaterial,
  writeMaterial,
  readOperation,
  writeOperation,
  clearOperation,
} from './account-cache';
import { registerOffline } from './pwa';

export function viewItem(item: RemoteItem): Item {
  const content = item.content;
  const section: Item['section'] =
    content.type === 'podcast_episode' || content.type === 'show'
      ? 'Podcasts'
      : content.type === 'video'
        ? 'Videos'
        : ['post', 'thread', 'account'].includes(content.type)
          ? 'Posts'
          : 'Articles';
  const duration = content.durationSeconds
    ? `${Math.max(1, Math.round(content.durationSeconds / 60))} min`
    : section === 'Articles'
      ? 'Saved article'
      : section === 'Posts'
        ? 'Saved post'
        : 'Saved ' + content.type.replaceAll('_', ' ');
  return {
    id: item.id,
    section,
    title: content.title || new URL(content.url).hostname,
    author:
      typeof content.creator === 'string'
        ? content.creator
        : content.creator?.name || new URL(content.url).hostname,
    note: content.description || '',
    duration,
    image: content.thumbnail?.startsWith('https:') ? content.thumbnail : undefined,
    creatorImage: content.creatorImageUrl?.startsWith('https://')
      ? content.creatorImageUrl
      : undefined,
    url: content.url,
    isSample: false,
    api: item,
  };
}
const api = new API(token);
function readPanel() {
  const params = new URLSearchParams(location.hash.slice(1));
  return params.has('capture') ? 'capture' : params.get('item');
}

export function ConnectedApp() {
  const [identity, setIdentity] = useState<Identity>();
  const [authError, setAuthError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const mount = useRef<HTMLDivElement>(null);
  const supported = location.origin === apiOrigin;
  useEffect(() => {
    if (!supported) return;
    let active = true;
    let remove: (() => void) | undefined;
    const boot = async () => {
      if (!navigator.onLine) {
        const owner = localStorage.getItem('zine-next-connected-owner');
        if (owner) {
          setIdentity({ owner, offline: true });
          return;
        }
        throw Error('Connect to sign in and load your library for the first time.');
      }
      const auth = await loadAuth();
      if (!active) return;
      const refresh = async () => {
        if (!auth.isSignedIn || !auth.user) {
          if (active) {
            setSignedOut(true);
            setIdentity(undefined);
          }
          return;
        }
        const me = await api.request<{ id: string }>('GET', '/v1/me');
        if (me.id !== auth.user.id) throw Error('Your account could not be verified.');
        const previous = localStorage.getItem('zine-next-connected-owner');
        if (previous && previous !== me.id) await clearPrivateData();
        localStorage.setItem('zine-next-connected-owner', me.id);
        if (active) {
          setIdentity({ owner: me.id, offline: false });
          setSignedOut(false);
        }
      };
      let observedUser = auth.user?.id ?? null;
      remove = auth.addListener((state) => {
        if (!active) return;
        if (!state.user) {
          observedUser = null;
          setIdentity(undefined);
          setSignedOut(true);
          void clearPrivateData().catch(() =>
            setAuthError(
              'Signed out, but offline storage could not be cleared. Clear this site’s data on a shared device.'
            )
          );
        } else if (state.user.id !== observedUser) {
          observedUser = state.user.id;
          setIdentity(undefined);
          setSignedOut(false);
          void refresh().catch((error) => setAuthError(message(error)));
        }
      });
      await refresh();
    };
    void boot().catch((error) => {
      if (active) setAuthError(error instanceof Error ? error.message : 'Sign-in failed.');
    });
    return () => {
      active = false;
      remove?.();
    };
  }, [supported]);
  useEffect(() => {
    if (signedOut && mount.current) {
      void loadAuth().then((auth) => {
        if (mount.current)
          auth.mountSignIn(mount.current, {
            routing: 'hash',
            forceRedirectUrl: appURL,
            signUpUrl: 'https://accounts.myzine.app/sign-up',
          });
      });
    }
  }, [signedOut]);
  if (!supported)
    return (
      <main className="auth-page stack">
        <h1>Your Zine, connected.</h1>
        <p>Open the connected experience to sign in and browse your real saves.</p>
        <a className="primary" href={appURL}>
          Open Zine
          <ArrowUpRight size={20} />
        </a>
        <p className="secondary">
          Your earlier mock saves remain on this device and have not been imported.
        </p>
      </main>
    );
  if (!identity)
    return (
      <main className="auth-page stack">
        <h1>A place for your curiosity.</h1>
        {authError ? (
          <>
            <p role="alert">{authError}</p>
            <button className="primary" onClick={() => location.reload()}>
              Try again
            </button>
          </>
        ) : signedOut ? (
          <>
            <p className="secondary">Sign in to your Zine account.</p>
            <div ref={mount} />
          </>
        ) : (
          <p role="status">Opening your Zine…</p>
        )}
      </main>
    );
  return (
    <Library
      key={identity.owner}
      identity={identity}
      signOut={async () => {
        setIdentity(undefined);
        setSignedOut(false);
        try {
          await clearPrivateData();
        } finally {
          await (await loadAuth()).signOut();
        }
        setSignedOut(true);
      }}
    />
  );
}

function Library({ identity, signOut }: { identity: Identity; signOut: () => Promise<void> }) {
  const [section, setSection] = useState<Section>('Home');
  const [destination, setDestination] = useState(readDestination);
  const destinationRef = useRef(destination);
  const [query, setQuery] = useState('');
  const [searchText, setSearchText] = useState('');
  const isSearch = destination === 'Search';
  const isInbox = destination === 'Inbox';
  const snapshotKey = isInbox ? 'Inbox' : section;
  const [items, setItems] = useState<RemoteItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cacheError, setCacheError] = useState('');
  const [cachedAt, setCachedAt] = useState<number>();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [panel, setPanel] = useState<string | null>(readPanel);
  const [current, setCurrent] = useState<RemoteItem>();
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration>();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const owner = identity.owner;
  function cacheFailure() {
    if (alive.current)
      setCacheError('Offline storage is unavailable. Changes saved to your account are safe.');
  }
  const cacheItem = async (item: RemoteItem) => {
    if (!alive.current) return;
    try {
      await writeItem(owner, item);
    } catch {
      cacheFailure();
    }
  };
  async function forgetDenied(id: string) {
    setCurrent(undefined);
    setItems((previous) => previous.filter((item) => item.id !== id));
    try {
      await forgetItem(owner, id);
    } catch {
      cacheFailure();
    }
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const pop = () => {
      const next = readDestination();
      if (destinationRef.current !== next) {
        destinationRef.current = next;
        setSection('Home');
        setDestination(next);
        setItems([]);
        setCursor(null);
        setLoading(true);
      }
      setPanel(readPanel());
    };
    const online = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) {
        if (identity.offline) location.reload();
        else setRevision((r) => r + 1);
      }
    };
    window.addEventListener('popstate', pop);
    window.addEventListener('hashchange', pop);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    void registerOffline(
      () => setReady(true),
      setUpdate,
      () => setNotice('Offline setup did not finish. Reopen while connected to try again.')
    );
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('hashchange', pop);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, [identity.offline]);
  useEffect(() => {
    const ticket = ++generation.current;
    let stopped = false;
    const load = async () => {
      setLoading(true);
      setError('');
      setItems([]);
      setCursor(null);
      setCachedAt(undefined);
      if (isSearch) {
        try {
          if (!query) return;
          if (!navigator.onLine) throw Error('Connect to search your library.');
          const page = await api.search(query);
          if (!stopped && ticket === generation.current) {
            setItems(page.items);
            setCursor(page.nextCursor);
          }
        } catch (error) {
          if (!stopped) setError(message(error));
        } finally {
          if (!stopped) setLoading(false);
        }
        return;
      }
      let cached;
      try {
        cached = await readSnapshot(owner, snapshotKey);
      } catch {
        cacheFailure();
      }
      if (stopped) return;
      if (cached) {
        setItems(cached.items);
        setCursor(cached.nextCursor);
        setCachedAt(cached.savedAt);
      }
      if (!navigator.onLine) {
        if (!cached) setError('This section has not been saved for offline reading yet.');
        setLoading(false);
        return;
      }
      try {
        const page = await api.list(section, undefined, isInbox ? 'received' : undefined);
        if (stopped || ticket !== generation.current) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setCachedAt(undefined);
        try {
          await writeSnapshot({ owner, section: snapshotKey, ...page, savedAt: Date.now() });
        } catch {
          cacheFailure();
        }
      } catch (error) {
        if (!stopped) setError(message(error));
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    void load();
    return () => {
      stopped = true;
    };
  }, [section, owner, revision, destination, isSearch, isInbox, snapshotKey, query]);
  useEffect(() => {
    if (!offline)
      void api
        .request<{ collections: Collection[] }>('GET', '/v1/collections')
        .then((value) => {
          if (alive.current) setCollections(value.collections);
        })
        .catch(() => {});
  }, [offline]);
  useEffect(() => {
    if (!panel || panel === 'capture') {
      setCurrent(undefined);
      return;
    }
    let stopped = false;
    setCurrent(items.find((i) => i.id === panel));
    setError('');
    void (async () => {
      try {
        const cached = await readItem(owner, panel);
        if (!stopped && cached) setCurrent(cached);
      } catch {
        cacheFailure();
      }
      if (!navigator.onLine) {
        if (!stopped && !items.some((i) => i.id === panel)) {
          const cached = await readItem(owner, panel).catch(() => undefined);
          if (!cached) setError('Open this save while connected before reading it offline.');
        }
        return;
      }
      try {
        const value = await api.item(panel);
        if (!stopped) {
          setCurrent(value);
          await cacheItem(value);
        }
      } catch (error) {
        if (!stopped) {
          if (error instanceof ServiceError && [403, 404, 410].includes(error.status))
            await forgetDenied(panel);
          setError(message(error));
        }
      }
    })();
    return () => {
      stopped = true;
    };
    // Item loads are keyed by navigation; mutations update their authoritative result separately.
  }, [panel, owner]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (panel) {
      if (!element.open) {
        trigger.current = document.activeElement as HTMLElement;
        element.showModal();
      }
      document.documentElement.classList.add('modal-open');
    } else {
      element.close();
      document.documentElement.classList.remove('modal-open');
      trigger.current?.focus();
    }
    return () => {
      document.documentElement.classList.remove('modal-open');
    };
  }, [panel]);
  function navigate(next: string | null) {
    history.pushState(
      null,
      '',
      location.pathname +
        location.search +
        (next === null ? '' : next === 'capture' ? '#capture' : '#item=' + encodeURIComponent(next))
    );
    setPanel(next);
  }
  function chooseDestination(next: Destination) {
    if (next === destination) return;
    const url = new URL(location.href);
    if (next === 'Home') url.searchParams.delete('view');
    else url.searchParams.set('view', next.toLowerCase());
    url.hash = '';
    history.pushState(null, '', url);
    destinationRef.current = next;
    setSection('Home');
    setDestination(next);
    setPanel(null);
    setItems([]);
    setCursor(null);
    setLoading(true);
    window.scrollTo(0, 0);
  }

  async function more() {
    if (!cursor || busy || offline) return;
    setBusy(true);
    setError('');
    const expected = snapshotKey;
    const ticket = generation.current;
    try {
      const page = isSearch
        ? await api.search(query, cursor)
        : await api.list(section, cursor, isInbox ? 'received' : undefined);
      if (ticket !== generation.current) return;
      const unique = [...new Map([...items, ...page.items].map((i) => [i.id, i])).values()];
      setItems(unique);
      setCursor(page.nextCursor);
      if (isSearch) return;
      try {
        await writeSnapshot({
          owner,
          section: expected,
          items: unique,
          nextCursor: page.nextCursor,
          savedAt: Date.now(),
        });
      } catch {
        cacheFailure();
      }
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function refreshItem(id: string) {
    const value = await api.item(id);
    if (!alive.current) return value;
    setCurrent(value);
    setItems((previous) => previous.map((i) => (i.id === value.id ? value : i)));
    await cacheItem(value);
    try {
      const snap = isSearch ? undefined : await readSnapshot(owner, snapshotKey);
      if (snap)
        await writeSnapshot({
          ...snap,
          items: snap.items.map((i) => (i.id === value.id ? value : i)),
        });
    } catch {
      cacheFailure();
    }
    return value;
  }
  async function mutation(operation: () => Promise<unknown>, id: string, success: string) {
    if (busy || offline) throw Error('Connect to save changes.');
    setBusy(true);
    setError('');
    try {
      await operation();
      const item = await refreshItem(id);
      setNotice(success);
      return item;
    } catch (error) {
      if (error instanceof ServiceError && [403, 404, 410].includes(error.status))
        await forgetDenied(id);
      setError(message(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }
  async function save(body: unknown) {
    if (offline || busy) throw Error('Connect to save a link.');
    setBusy(true);
    setError('');
    try {
      const pending = await readOperation(owner);
      const operation = pending ?? { key: crypto.randomUUID(), body };
      if (pending && JSON.stringify(pending.body) !== JSON.stringify(body))
        throw Error('Retry your previous save first. Its details are preserved in this form.');
      await writeOperation(owner, operation.key, operation.body);
      const receipt = await api.save(operation.body, operation.key);
      const saved = await api.item(receipt.item.id);
      await clearOperation(owner);
      await cacheItem(saved);
      setCurrent(saved);
      setSection('Home');
      setRevision((r) => r + 1);
      navigate(saved.id);
      setNotice('Saved to your Zine.');
    } catch (error) {
      // Schema rejection happens before a save is committed. Keep ambiguous
      // network/server outcomes retryable, but let invalid input be corrected.
      if (error instanceof ServiceError && [400, 422].includes(error.status))
        await clearOperation(owner);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const cards = items.map(viewItem);
  return (
    <>
      <div className="destination-shell" inert={!!panel}>
        <DestinationNav current={destination} choose={chooseDestination} />
        <Header
          allLabel
          showFilters={!isInbox && !isSearch}
          section={section}
          choose={(next) => {
            if (next !== section) {
              setItems([]);
              setLoading(true);
              setSection(next);
              navigator.vibrate?.(8);
            }
          }}
          capture={() => navigate('capture')}
        />
        <main className="page" id="main-content">
          <div className="heading-row">
            <h1>{destination === 'Home' ? headlines[section] : destination}</h1>
          </div>
          {isSearch && (
            <form
              className="destination-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const next = searchText.trim();
                if (next === query) setRevision((value) => value + 1);
                else setQuery(next);
              }}
            >
              <label className="sr-only" htmlFor="library-search">
                Search your library
              </label>
              <input
                id="library-search"
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search your library"
                maxLength={2000}
                required
              />
              <button className="primary" disabled={offline}>
                Search
              </button>
            </form>
          )}
          {cachedAt && (
            <p className="sync-note secondary">
              {offline ? 'Offline copy' : 'Showing your saved copy'} ·{' '}
              {new Date(cachedAt).toLocaleString()}
            </p>
          )}
          {loading && !items.length && (
            <p role="status" className="sync-note">
              {isSearch ? 'Searching your library…' : 'Opening your saves…'}
            </p>
          )}
          {error && !panel && (
            <div className="inline-error" role="alert">
              <p>{error}</p>
              {!offline && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => setRevision((r) => r + 1)}
                >
                  Try again
                </button>
              )}
            </div>
          )}
          {cards.length > 0 ? (
            destination === 'Home' && section === 'Home' ? (
              <HomeFeed cards={cards} open={navigate} />
            ) : (
              <BentoFeed
                cards={cards}
                label={`${section === 'Home' ? destination : section} feed`}
                open={navigate}
              />
            )
          ) : (
            !loading &&
            !error &&
            (!isSearch || query) && (
              <div className="empty">
                <h2>
                  {isInbox
                    ? 'You’re all caught up.'
                    : isSearch
                      ? 'No matching saves.'
                      : 'Room for something good.'}
                </h2>
                {!isInbox && !isSearch && (
                  <>
                    <p>Your next discovery starts with a saved link.</p>
                    <button className="primary" onClick={() => navigate('capture')}>
                      Save a link
                    </button>
                  </>
                )}
              </div>
            )
          )}
          {cursor && (
            <button
              type="button"
              className="load-more secondary-button"
              disabled={busy || offline || loading}
              onClick={() => void more()}
            >
              {busy ? 'Loading…' : 'More saves'}
            </button>
          )}
          <footer>
            <p>Your saves · Connected to Zine{ready ? ' · Ready offline' : ''}</p>
            <div className="footer-actions">
              <button
                className="quiet-button"
                disabled={offline || loading}
                onClick={() => setRevision((r) => r + 1)}
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <button
                className="quiet-button"
                disabled={offline}
                onClick={() => void signOut().catch((error) => setError(message(error)))}
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
            <p className="small secondary">To install: Safari → Share → Add to Home Screen.</p>
            {update && (
              <button
                className="text-action"
                onClick={() => {
                  navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    () => location.reload(),
                    { once: true }
                  );
                  update.waiting?.postMessage('ACTIVATE_UPDATE');
                }}
              >
                Update and reload
              </button>
            )}
          </footer>
        </main>
      </div>
      {offline && (
        <div className="connection-status" role="status">
          <WifiOff size={16} /> Offline · Reading saved copies. Connect to make changes.
        </div>
      )}
      {cacheError && (
        <div className="storage-alert" role="alert">
          {cacheError}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {notice}
      </span>
      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="sheet-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) navigate(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const controls = [
            ...e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],summary,[tabindex="0"]'
            ),
          ].filter((el) => el.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        {panel && (
          <>
            <div className="sheet-toolbar">
              <span className="toolbar-spacer" />
              <h2 id="sheet-title">
                {panel === 'capture' ? 'Keep something good' : 'Saved for you'}
              </h2>
              <button className="done" disabled={busy} onClick={() => navigate(null)}>
                Done
              </button>
            </div>
            <div className="sheet-body">
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              {panel === 'capture' ? (
                <LiveCapture
                  owner={owner}
                  collections={collections}
                  save={save}
                  busy={busy}
                  offline={offline}
                />
              ) : current ? (
                <LiveDetail
                  key={current.id}
                  item={current}
                  owner={owner}
                  collections={collections}
                  busy={busy}
                  offline={offline}
                  mutation={mutation}
                />
              ) : (
                !error && <p role="status">Opening this save…</p>
              )}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}

type Mutation = (
  operation: () => Promise<unknown>,
  id: string,
  success: string
) => Promise<RemoteItem | undefined>;
function LiveDetail({
  item,
  owner,
  collections,
  busy,
  offline,
  mutation,
}: {
  item: RemoteItem;
  owner: string;
  collections: Collection[];
  busy: boolean;
  offline: boolean;
  mutation: Mutation;
}) {
  const view = viewItem(item);
  const [note, setNote] = useState('');
  const [position, setPosition] = useState(progress(view) ?? 0);
  const [error, setError] = useState('');
  const [material, setMaterial] = useState<Material>();
  const [reading, setReading] = useState(false);
  const [loadingText, setLoadingText] = useState(false);
  useEffect(() => {
    setPosition(progress(viewItem(item)) ?? 0);
  }, [item]);
  const act = async (operation: () => Promise<unknown>, success: string) => {
    setError('');
    try {
      await mutation(operation, item.id, success);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Changes could not be saved.');
      return false;
    }
  };
  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    if (await act(() => api.note(item.id, note.trim()), 'Note saved to Zine.')) setNote('');
  }
  async function savePosition(value: number) {
    if (Math.abs(value - (progress(view) ?? 0)) < 0.001) return;
    const seconds = item.progress.unit === 'seconds' && item.content.durationSeconds;
    await act(
      () =>
        api.progress(
          item.id,
          seconds
            ? { position: value * seconds, unit: 'seconds' }
            : { position: value, unit: 'fraction' }
        ),
      'Saved place updated.'
    );
  }
  async function read() {
    setReading(true);
    setLoadingText(true);
    setError('');
    try {
      const cached = await readMaterial(owner, item.id);
      if (cached) setMaterial(cached);
      if (!navigator.onLine) {
        if (!cached) throw Error('Open saved text while connected before reading it offline.');
        return;
      }
      const field =
        view.section === 'Articles'
          ? 'article'
          : view.section === 'Posts'
            ? 'thread'
            : 'transcript';
      const result = await api.request<Material>(
        'GET',
        '/v1/items/' + encodeURIComponent(item.id) + '/' + field
      );
      setMaterial(result);
      try {
        await writeMaterial(owner, item.id, result);
      } catch {
        setError('Text opened, but could not be stored offline on this device.');
      }
    } catch (error) {
      if (error instanceof ServiceError && [403, 404, 410].includes(error.status)) {
        setMaterial(undefined);
        await forgetMaterial(owner, item.id).catch(() => {});
      }
      setError(error instanceof Error ? error.message : message(error));
    } finally {
      setLoadingText(false);
    }
  }
  return (
    <article className="detail stack">
      {view.image && (
        <img
          className="detail-art"
          src={view.image}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      <h3 className="detail-title">{view.title}</h3>
      <p className="secondary">
        {view.author} · {view.duration}
      </p>
      {view.note && <p className="lede">{view.note}</p>}
      <hr />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {view.section !== 'Posts' && (
        <section>
          <div className="section-heading">
            <h4>Your place</h4>
            <span className="secondary">{resumeLabel(view)}</span>
          </div>
          <input
            type="range"
            aria-label="Saved position"
            min="0"
            max="1"
            step=".01"
            value={position}
            disabled={offline || busy}
            onChange={(e) => setPosition(Number(e.target.value))}
            onPointerUp={(event) => void savePosition(Number(event.currentTarget.value))}
            onKeyUp={(event) => void savePosition(Number(event.currentTarget.value))}
          />
          <p className="small secondary">
            Your place syncs across Zine. Completion is a separate choice.
          </p>
        </section>
      )}
      {item.content.summary && (
        <section>
          <h4>
            <Sparkles size={22} />
            At a glance
          </h4>
          <p>{item.content.summary}</p>
          <p className="small secondary">
            {item.enrichment.fields.summary?.provenance.coverage === 'metadata_only' ||
            item.enrichment.fields.summary?.provenance.sourceCoverage === 'metadata_only'
              ? 'Based on metadata only · Full source not analyzed'
              : 'Generated understanding · ' +
                (item.enrichment.fields.summary?.provenance.coverage ?? 'Coverage not specified')}
          </p>
          {item.content.topics && <p className="accent">{item.content.topics.join(' · ')}</p>}
        </section>
      )}
      <section>
        <h4>Why keep it?</h4>
        <div className="notes">
          {item.context.map((entry) => (
            <div key={entry.id}>
              <p>{entry.text}</p>
              <p className="small secondary">
                {entry.origin === 'inferred' ? 'Inferred context' : 'Saved context'}
              </p>
            </div>
          ))}
        </div>
        <form className="note-form" onSubmit={(event) => void addNote(event)}>
          <label className="sr-only" htmlFor="live-note">
            Add a thought for later
          </label>
          <textarea
            id="live-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a thought for later"
            rows={2}
            maxLength={20000}
            disabled={offline || busy}
          />
          <button className="text-action" type="submit" disabled={offline || busy || !note.trim()}>
            {busy ? 'Saving…' : 'Keep this note'}
          </button>
        </form>
      </section>
      {(collections.length > 0 || item.tags.length > 0) && (
        <section>
          <h4>Collections</h4>
          {collections.length > 0 && (
            <details className="organize">
              <summary>Organize</summary>
              <fieldset disabled={offline || busy}>
                <legend className="sr-only">Collection membership</legend>
                {collections.map((collection) => (
                  <label key={collection.id}>
                    <input
                      type="checkbox"
                      checked={item.collectionIds.includes(collection.id)}
                      onChange={(e) =>
                        void act(
                          () =>
                            api.request(
                              e.target.checked ? 'PUT' : 'DELETE',
                              '/v1/collections/' +
                                encodeURIComponent(collection.id) +
                                '/items/' +
                                encodeURIComponent(item.id),
                              e.target.checked ? {} : undefined
                            ),
                          'Collection updated.'
                        )
                      }
                    />
                    {collection.name}
                  </label>
                ))}
              </fieldset>
            </details>
          )}
          {item.tags.length > 0 && (
            <p className="secondary">{item.tags.map((tag) => '#' + tag).join(' · ')}</p>
          )}
        </section>
      )}
      <section>
        <button
          type="button"
          className="text-action"
          onClick={() => void read()}
          disabled={loadingText}
        >
          {loadingText
            ? 'Opening text…'
            : view.section === 'Articles'
              ? 'Read saved text'
              : view.section === 'Posts'
                ? 'Read saved thread'
                : 'Read transcript'}
        </button>
        {reading && material && (
          <div className="retained-text stack">
            <p className="small secondary">
              {material.value.coverage ?? material.provenance.coverage ?? 'Coverage not specified'}{' '}
              · {material.provenance.description ?? 'Retained source material'}
            </p>
            {material.value.text && <p className="retained-copy">{material.value.text}</p>}
            {material.value.segments?.map((segment, index) => (
              <p key={index}>
                {segment.startSeconds !== undefined && (
                  <strong className="timestamp">{timestamp(segment.startSeconds)} </strong>
                )}
                {segment.text}
              </p>
            ))}
            {material.value.posts?.map((post, index) => (
              <p key={index}>{post.text}</p>
            ))}
          </div>
        )}
      </section>
      <details className="disclosure">
        <summary>What’s available</summary>
        <div className="stack">
          {item.enrichment.components.map((component) => (
            <div key={component.component}>
              <strong>{component.component.replaceAll('_', ' ')}</strong>
              <p className="small secondary">
                {component.status === 'available'
                  ? 'Available'
                  : component.status === 'pending'
                    ? 'Waiting to be prepared'
                    : component.status === 'processing'
                      ? 'Being prepared'
                      : component.status === 'failed'
                        ? 'Couldn’t prepare this yet'
                        : 'Source material isn’t available'}
              </p>
            </div>
          ))}
          <p className="small secondary">
            Your save is kept even when source processing is delayed or unavailable.
          </p>
        </div>
      </details>
      <hr />
      <a className="text-action" href={item.content.url} target="_blank" rel="noopener noreferrer">
        Open original
        <ArrowUpRight size={18} />
      </a>
      <div className="action-row">
        <button
          className="secondary-button"
          disabled={offline || busy}
          onClick={() =>
            void act(
              () => api.progress(item.id, { completed: !item.progress.completedAt }),
              'Completion updated.'
            )
          }
        >
          <Check size={18} />
          {item.progress.completedAt ? 'Mark unfinished' : 'Mark finished'}
        </button>
        <button
          className="text-action"
          disabled={offline || busy}
          onClick={() =>
            void act(() => api.patch(item.id, { archived: !item.archived }), 'Archive updated.')
          }
        >
          <Archive size={18} />
          {item.archived ? 'Unarchive' : 'Archive'}
        </button>
      </div>
    </article>
  );
}

function LiveCapture({
  owner,
  collections,
  save,
  busy,
  offline,
}: {
  owner: string;
  collections: Collection[];
  save: (body: unknown) => Promise<void>;
  busy: boolean;
  offline: boolean;
}) {
  const [url, setURL] = useState('');
  const [context, setContext] = useState('');
  const [tags, setTags] = useState('');
  const [collection, setCollection] = useState('');
  const [error, setError] = useState('');
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    void readOperation(owner)
      .then((pending) => {
        if (pending) {
          const body = pending.body as {
            url: string;
            context?: { text: string };
            tags?: string[];
            collectionIds?: string[];
          };
          setURL(body.url);
          setContext(body.context?.text ?? '');
          setTags(body.tags?.join(', ') ?? '');
          setCollection(body.collectionIds?.[0] ?? '');
          setRecovering(true);
        }
      })
      .catch(() => setError('Could not read pending saves. Check this device’s storage.'));
  }, [owner]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const normalized = safeURL(url).href;
      await save({
        url: normalized,
        ...(context.trim() ? { context: { text: context.trim() } } : {}),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        collectionIds: collection ? [collection] : [],
      });
    } catch (error) {
      if (error instanceof ServiceError && [400, 422].includes(error.status)) setRecovering(false);
      setError(error instanceof Error ? error.message : message(error));
    }
  }
  return (
    <form className="capture-form stack" onSubmit={(event) => void submit(event)} noValidate>
      {recovering && (
        <p className="secondary">
          A previous save needs confirmation. Retry these details to safely finish it.
        </p>
      )}
      <label>
        Link
        <input
          type="url"
          name="url"
          autoFocus
          required
          maxLength={8192}
          value={url}
          onChange={(e) => setURL(e.target.value)}
          disabled={busy || recovering}
        />
      </label>
      <label>
        Why do you want to keep it?
        <textarea
          name="context"
          rows={3}
          maxLength={20000}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={busy || recovering}
        />
      </label>
      <label>
        Tags <span className="secondary">(separated by commas)</span>
        <input
          name="tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          disabled={busy || recovering}
        />
      </label>
      {collections.length > 0 && (
        <label>
          Collection
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            disabled={busy || recovering}
          >
            <option value="">No collection yet</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy || offline}>
        {busy ? 'Saving…' : recovering ? 'Retry save' : 'Save'}
      </button>
      <p className="small secondary">
        Saved to your Zine account. Titles and artwork may arrive afterward. Saving a link again
        adds your new context to the existing save.
      </p>
      {offline && (
        <p className="secondary">
          Connect to save this link. Your draft stays here while this form is open.
        </p>
      )}
    </form>
  );
}
