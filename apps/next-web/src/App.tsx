import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Headphones,
  House,
  Layers,
  MessageSquare,
  Play,
  Search,
  Sparkles,
} from 'lucide-react';
import { Header, StoryCard } from './Feed';
import type { LucideIcon } from 'lucide-react';
import {
  capture,
  fixtures,
  headlines,
  isComplete,
  loadLibrary,
  plan,
  progress,
  resumeLabel,
  search,
  sections,
  setProgress,
  timestamp,
  updateItem,
  visibleItems,
  persist,
  storageKey,
} from './model';
import type { Item, Scope, Section, SearchMode } from './model';
import { registerOffline } from './pwa';
import type { InstallPrompt } from './pwa';

type Panel =
  | { type: 'detail'; id: string }
  | { type: 'collection'; id: string }
  | { type: 'search' | 'collections' | 'following' | 'capture' | 'experience' };
const icons: Record<Section, LucideIcon> = {
  Home: House,
  Podcasts: Headphones,
  Articles: FileText,
  Videos: Play,
  Posts: MessageSquare,
};
function readPanels(): Panel[] {
  try {
    const value = JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
    const allowed = [
      'detail',
      'collection',
      'search',
      'collections',
      'following',
      'capture',
      'experience',
    ];
    return Array.isArray(value) &&
      value.length < 8 &&
      value.every(
        (p) =>
          p &&
          allowed.includes(p.type) &&
          (!['detail', 'collection'].includes(p.type) || typeof p.id === 'string')
      )
      ? value
      : [];
  } catch {
    return [];
  }
}
function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

export function App() {
  const [loaded] = useState(() => loadLibrary(window.localStorage));
  const [items, setItems] = useState(loaded.items);
  const [storageError, setStorageError] = useState(loaded.error);
  const [section, setSection] = useState<Section>('Home');
  const [scope, setScope] = useState<Scope>('saved');
  const [collection, setCollection] = useState<string>();
  const [panels, setPanels] = useState<Panel[]>(readPanels);
  const [announcement, setAnnouncement] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineError, setOfflineError] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration>();
  const [install, setInstall] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches
  );
  const [following, setFollowing] = useState(fixtures.subscriptionList.subscriptions);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const waitingToReload = useRef(false);
  const blocked = useRef(loaded.blocked);
  const top = panels.at(-1);
  const visible = visibleItems(items, section, scope, collection);

  function navigate(next: Panel[]) {
    if (next.length && !panels.length) lastFocused.current = document.activeElement as HTMLElement;
    const url =
      window.location.pathname +
      window.location.search +
      (next.length ? '#' + encodeURIComponent(JSON.stringify(next)) : '');
    history.pushState(null, '', url);
    setPanels(next);
  }
  const push = (panel: Panel) => {
    if (panel.type === 'search') {
      setSearchQuery('');
      setSearchMode('hybrid');
    }
    navigate([...panels, panel]);
  };
  const back = () => navigate(panels.slice(0, -1));
  function commit(next: Item[], message?: string) {
    setItems(next);
    if (message) setAnnouncement(message);
    if (blocked.current) return;
    try {
      persist(localStorage, next);
      setStorageError(null);
    } catch {
      setStorageError(
        'Your changes are available this session but could not be saved on this device. Free some storage and retry.'
      );
    }
  }
  const change = (id: string, mutate: (item: Item) => void, message?: string) =>
    commit(updateItem(items, id, mutate), message);
  function choose(next: Section) {
    if (next === section) return;
    setSection(next);
    setAnnouncement(`${next} selected`);
    navigator.vibrate?.(8);
  }
  useEffect(() => {
    const pop = () => setPanels(readPanels());
    const online = () => setOffline(!navigator.onLine);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const didInstall = () => {
      setInstalled(true);
      setInstall(undefined);
    };
    const controller = () => {
      if (waitingToReload.current) window.location.reload();
    };
    window.addEventListener('popstate', pop);
    window.addEventListener('hashchange', pop);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', didInstall);
    navigator.serviceWorker?.addEventListener('controllerchange', controller);
    void registerOffline(
      () => setOfflineReady(true),
      setUpdate,
      () => setOfflineError(true)
    );
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('hashchange', pop);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', didInstall);
      navigator.serviceWorker?.removeEventListener('controllerchange', controller);
    };
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [section, scope, collection]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (top && !element.open) {
      element.showModal();
      document.documentElement.classList.add('modal-open');
    } else if (!top && element.open) {
      element.close();
      document.documentElement.classList.remove('modal-open');
      lastFocused.current?.focus();
    }
  }, [top]);
  const current = top?.type === 'detail' ? items.find((i) => i.id === top.id) : undefined;
  const titles = {
    search: 'Find something good',
    collections: 'Collections',
    following: 'Following',
    capture: 'Keep something good',
    experience: 'Your web experience',
    detail: 'Saved for you',
    collection:
      fixtures.collectionList.collections.find((c) => top?.type === 'collection' && c.id === top.id)
        ?.name ?? 'Collection',
  };

  return (
    <>
      <div inert={!!top}>
        <Header section={section} choose={choose} capture={() => push({ type: 'capture' })} />
      </div>
      <main id="main-content" className="page" inert={!!top}>
        <div className="heading-row">
          <h1>{headlines[section]}</h1>
        </div>
        {visible.length ? (
          <div className="bento" aria-label={`${section} feed`} data-testid="feed">
            {plan(visible).map((p) => (
              <StoryCard
                key={visible[p.index].id}
                item={visible[p.index]}
                placement={p}
                onOpen={() => push({ type: 'detail', id: visible[p.index].id })}
              />
            ))}
          </div>
        ) : (
          <div className="empty">
            <Bookmark size={34} aria-hidden="true" />
            <h2>Room for something new</h2>
            <p>Nothing in this view yet. Your other saves are still here.</p>
            <button type="button" className="primary" onClick={() => push({ type: 'capture' })}>
              Save a link
            </button>
          </div>
        )}
        <footer>
          <p>
            Local capability preview · Notes, progress, source states, and understanding are mock
            data.
          </p>
          <button
            type="button"
            className="quiet-button"
            onClick={() => push({ type: 'experience' })}
          >
            <Download size={17} aria-hidden="true" />
            {installed ? 'Installed' : 'Preview & install'}
            <span className="footer-dot" aria-hidden="true">
              ·
            </span>
            {offlineReady ? 'Ready offline' : 'Web experience'}
          </button>
        </footer>
      </main>
      {offline && (
        <div className="connection-status" role="status">
          Offline ·{' '}
          {offlineReady
            ? 'Your local collection is available'
            : 'Previously cached content may be available'}
        </div>
      )}
      {storageError && (
        <div className="storage-alert" role="alert">
          <p>{storageError}</p>
          {!blocked.current && (
            <button type="button" onClick={() => commit(items)}>
              Retry saving
            </button>
          )}
          {blocked.current && (
            <button
              type="button"
              onClick={() => {
                const raw = localStorage.getItem(storageKey) ?? '';
                const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'zine-next-preserved-data.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download preserved data
            </button>
          )}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="sheet-title"
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const focusable = [
            ...e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"])'
            ),
          ].filter((el) => el.getClientRects().length > 0);
          const first = focusable[0],
            last = focusable.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          back();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) {
            const r = dialog.current.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              back();
          }
        }}
      >
        {top && (
          <>
            <div className="sheet-toolbar">
              {panels.length > 1 ? (
                <IconButton label="Back" icon={ArrowLeft} onClick={back} />
              ) : (
                <span className="toolbar-spacer" />
              )}
              <h2 id="sheet-title">{titles[top.type]}</h2>
              <button type="button" className="done" onClick={back}>
                Done
              </button>
            </div>
            <div className="sheet-body" key={top.type + ('id' in top ? top.id : '')}>
              {top.type === 'detail' &&
                (current ? (
                  <Detail
                    key={current.id}
                    item={current}
                    change={change}
                    open={(id) => push({ type: 'detail', id })}
                  />
                ) : (
                  <div className="empty">
                    <h3>This save isn’t available</h3>
                    <p>It may belong to another browser’s local collection.</p>
                  </div>
                ))}
              {top.type === 'search' && (
                <SearchView
                  items={items}
                  open={(id) => push({ type: 'detail', id })}
                  query={searchQuery}
                  setQuery={setSearchQuery}
                  mode={searchMode}
                  setMode={setSearchMode}
                />
              )}
              {top.type === 'collections' && (
                <div className="list">
                  {fixtures.collectionList.collections.map((c) => (
                    <button
                      type="button"
                      className="list-row"
                      key={c.id}
                      onClick={() => push({ type: 'collection', id: c.id })}
                    >
                      <Layers aria-hidden="true" />
                      <span>
                        <strong>{c.name}</strong>
                        <span className="secondary">{c.description}</span>
                        <span className="small secondary">
                          {items.filter((i) => i.api.collectionIds.includes(c.id)).length} saves
                        </span>
                      </span>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
              {top.type === 'collection' && (
                <CollectionView
                  id={top.id}
                  items={items}
                  open={(id) => push({ type: 'detail', id })}
                  explore={() => {
                    setCollection(top.id);
                    setScope('saved');
                    setSection('Home');
                    navigate([]);
                  }}
                />
              )}
              {top.type === 'following' && (
                <div className="stack">
                  {following.map((sub) => (
                    <section className="settings-group" key={sub.id}>
                      <h3>
                        {fixtures.sourceList.sources.find((s) => s.id === sub.sourceId)?.name}
                      </h3>
                      <label className="toggle-row">
                        Save new arrivals automatically
                        <input
                          type="checkbox"
                          role="switch"
                          checked={sub.autoSave}
                          onChange={(e) =>
                            setFollowing(
                              following.map((s) =>
                                s.id === sub.id ? { ...s, autoSave: e.target.checked } : s
                              )
                            )
                          }
                        />
                      </label>
                      <p className="secondary">
                        {sub.autoSave
                          ? 'New matches go directly to your saves.'
                          : 'New matches arrive in your inbox for review.'}
                      </p>
                      <p className="status-line">
                        {sub.lastErrorCode ? (
                          <Clock size={20} aria-hidden="true" />
                        ) : (
                          <CheckCircle size={20} aria-hidden="true" />
                        )}
                        {sub.lastErrorCode ? 'Waiting to check this source again' : 'Up to date'}
                      </p>
                      {sub.lastErrorCode && (
                        <p className="secondary">
                          Your existing saves are safe. Provider delays can push the next check
                          back.
                        </p>
                      )}
                      <label className="toggle-row">
                        Following
                        <input
                          type="checkbox"
                          role="switch"
                          checked={sub.status === 'active'}
                          onChange={(e) =>
                            setFollowing(
                              following.map((s) =>
                                s.id === sub.id
                                  ? { ...s, status: e.target.checked ? 'active' : 'unsubscribed' }
                                  : s
                              )
                            )
                          }
                        />
                      </label>
                    </section>
                  ))}
                  <p className="small secondary">
                    Following starts with the latest matching item, then future arrivals. It does
                    not import a source’s full history. Unfollowing keeps existing saves. Source
                    controls are session-only mock behavior.
                  </p>
                </div>
              )}
              {top.type === 'capture' && (
                <Capture
                  section={section}
                  save={(input) => {
                    const result = capture(items, input);
                    commit(result.items, 'Link and context saved on this device');
                    navigate([]);
                  }}
                />
              )}
              {top.type === 'experience' && (
                <div className="stack">
                  <img src="/icons/icon-192.png" alt="" className="experience-icon" />
                  <h3>A fresh place for your curiosity.</h3>
                  <p>
                    The experimental web channel for Zine. Your collection and edits stay in this
                    browser, separate from the native app.
                  </p>
                  <div className="settings-group">
                    <h3>
                      {offlineReady
                        ? 'Your collection is ready offline'
                        : offlineError
                          ? 'Offline setup didn’t finish'
                          : 'Preparing offline access'}
                    </h3>
                    <p className="secondary">
                      The application, sample metadata, and all bundled artwork are cached together.
                      Opening original links still needs a connection.
                    </p>
                  </div>
                  {installed ? (
                    <p>
                      <CheckCircle size={20} aria-hidden="true" /> Running as an installed app.
                    </p>
                  ) : install ? (
                    <button
                      type="button"
                      className="primary"
                      onClick={async () => {
                        await install.prompt();
                        const choice = await install.userChoice;
                        setAnnouncement(
                          choice.outcome === 'accepted'
                            ? 'Installation accepted'
                            : 'Installation dismissed'
                        );
                        setInstall(undefined);
                      }}
                    >
                      Install Zine Next
                    </button>
                  ) : (
                    <div className="settings-group">
                      <h3>Keep it close</h3>
                      <p>
                        On iPad or iPhone, open in Safari and choose Share → Add to Home Screen. On
                        desktop, use your browser’s install option.
                      </p>
                    </div>
                  )}
                  {update && (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        waitingToReload.current = true;
                        update.waiting?.postMessage('ACTIVATE_UPDATE');
                      }}
                    >
                      Update and reload
                    </button>
                  )}
                  <p className="small secondary">
                    Haptics are requested only where the browser supports vibration. Safari does not
                    provide the native app’s selection feedback. Search by meaning and retained
                    passages remain illustrative mocks; no AI or provider sync runs here.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}

function SearchView({
  items,
  open,
  query,
  setQuery,
  mode,
  setMode,
}: {
  items: Item[];
  open: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
  mode: SearchMode;
  setMode: (mode: SearchMode) => void;
}) {
  const results = search(items, query, mode);
  return (
    <div className="stack">
      <label className="search-input">
        <Search size={20} aria-hidden="true" />
        <input
          type="search"
          autoFocus
          placeholder="A title, a note, or an idea"
          aria-label="Search your saves"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <fieldset className="segmented">
        <legend className="sr-only">Match mode</legend>
        {(['keyword', 'semantic', 'hybrid'] as const).map((value, index) => (
          <label key={value}>
            <input
              type="radio"
              name="match"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            <span>{['Words', 'Meaning', 'Both'][index]}</span>
          </label>
        ))}
      </fieldset>
      {!query.trim() ? (
        <section>
          <h3>Try an idea</h3>
          <div className="list">
            {fixtures.searches.map((s) => (
              <button
                type="button"
                key={s.query}
                className="list-row"
                onClick={() => setQuery(s.query)}
              >
                <Sparkles size={20} aria-hidden="true" />
                {s.query}
              </button>
            ))}
          </div>
        </section>
      ) : results.length ? (
        <div className="list" aria-label="Search results">
          {results.map(({ item, evidence }) => (
            <button
              type="button"
              className="search-result"
              key={item.id}
              onClick={() => open(item.id)}
            >
              <strong>{item.title}</strong>
              <span className="secondary">{item.author}</span>
              <span>{evidence[0].excerpt}</span>
              <span className="small secondary">
                {evidence[0].field === 'context'
                  ? 'Matches a saved note'
                  : `Matches ${evidence[0].field}`}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Search aria-hidden="true" />
          <h3>No matches yet</h3>
          <p>Try another title, a saved note, or one of the sample ideas.</p>
        </div>
      )}
      <p className="small secondary">
        Words searches titles, creators, tags, and notes locally. Meaning matches are scripted for
        “designing with AI” and “attention and craft”. This preview does not run AI search.
      </p>
    </div>
  );
}

function CollectionView({
  id,
  items,
  open,
  explore,
}: {
  id: string;
  items: Item[];
  open: (id: string) => void;
  explore: () => void;
}) {
  const collection = fixtures.collectionList.collections.find((c) => c.id === id);
  if (!collection) return <p>Collection not available.</p>;
  return (
    <div className="stack">
      <p className="lede">{collection.description}</p>
      <button type="button" className="primary" onClick={explore}>
        Explore this collection
      </button>
      {collection.notes.map((note) => (
        <section key={note.id}>
          <h3>Connections worth keeping</h3>
          <p>{note.text}</p>
          <div className="list">
            {note.itemIds.map((itemId) => {
              const item = items.find((i) => i.api.id === itemId);
              if (!item) return null;
              const Icon = icons[item.section];
              return (
                <button
                  type="button"
                  key={itemId}
                  className="list-row"
                  onClick={() => open(item.id)}
                >
                  <Icon aria-hidden="true" />
                  {item.title}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <section>
        <h3>In this collection</h3>
        <div className="list">
          {visibleItems(items, 'Home', 'saved', id).map((item) => (
            <button type="button" className="list-row" key={item.id} onClick={() => open(item.id)}>
              <span>
                <strong>{item.title}</strong>
                <span className="secondary">{item.author}</span>
              </span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
      <p className="small secondary">
        Collection notes and membership are mock examples. One item can belong to several
        collections.
      </p>
    </div>
  );
}

type Change = (id: string, mutate: (item: Item) => void, message?: string) => void;
function Detail({
  item,
  change,
  open,
}: {
  item: Item;
  change: Change;
  open: (id: string) => void;
}) {
  const api = item.api;
  const detail = fixtures.details[item.api.id as keyof typeof fixtures.details];
  const [note, setNote] = useState('');
  const [position, setPosition] = useState(progress(item) ?? 0);
  useEffect(() => {
    setPosition(progress(item) ?? 0);
  }, [item]);
  function addNote(event: FormEvent) {
    event.preventDefault();
    const value = note.trim();
    if (!value) return;
    change(
      item.id,
      (next) =>
        next.api.context.push({
          id: crypto.randomUUID(),
          text: value,
          origin: 'explicit',
          contributor: 'you',
        }),
      'Note kept on this device'
    );
    setNote('');
  }
  const material = detail && 'material' in detail ? detail.material : undefined;
  function savePosition(value: number) {
    change(item.id, (next) => setProgress(next, value), 'Saved position updated');
  }
  return (
    <article className="detail stack">
      {item.image && <img className="detail-art" src={`/artwork/${item.image}.jpg`} alt="" />}
      <h3 className="detail-title">{item.title}</h3>
      <p className="secondary">
        {item.author} · {item.duration}
      </p>
      {item.note && <p className="lede">{item.note}</p>}
      <hr />
      <p className="small secondary">
        Capability preview · Personal notes, summaries, and retained passages below are illustrative
        mock data.
      </p>
      {api.status === 'received' && (
        <section>
          <div className="action-row">
            <button
              type="button"
              className="primary"
              onClick={() =>
                change(
                  item.id,
                  (next) => {
                    next.api.status = 'saved';
                    next.api.archived = false;
                  },
                  'Arrival saved'
                )
              }
            >
              Keep this
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                change(
                  item.id,
                  (next) => {
                    next.api.status = 'dismissed';
                  },
                  'Arrival dismissed'
                )
              }
            >
              Dismiss
            </button>
          </div>
          <p className="secondary">An arrival from a followed source. The decision is yours.</p>
        </section>
      )}
      {api.status === 'dismissed' && (
        <button
          type="button"
          className="primary"
          onClick={() =>
            change(
              item.id,
              (next) => {
                next.api.status = 'saved';
                next.api.archived = false;
              },
              'Saved after all'
            )
          }
        >
          Save after all
        </button>
      )}
      {item.section !== 'Posts' && (
        <section>
          <div className="section-heading">
            <h4>Your place</h4>
            <span className="secondary">{resumeLabel(item)}</span>
          </div>
          <input
            type="range"
            aria-label="Saved position"
            min="0"
            max="1"
            step="0.01"
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            onPointerUp={(e) => savePosition(Number(e.currentTarget.value))}
            onKeyUp={(e) => savePosition(Number(e.currentTarget.value))}
            onBlur={(e) => {
              if (Number(e.currentTarget.value) !== (progress(item) ?? 0))
                savePosition(Number(e.currentTarget.value));
            }}
          />
          <p className="small secondary">
            Adjust your saved place. Completion is a separate choice.
          </p>
        </section>
      )}
      {api.content.summary && (
        <section>
          <h4>
            <Sparkles size={22} aria-hidden="true" />
            At a glance
          </h4>
          <p>{api.content.summary}</p>
          <p className="small secondary">
            {api.enrichment.fields.summary?.provenance.coverage === 'metadata_only'
              ? 'Based on metadata only · Full source not analyzed'
              : 'Based on retained source text'}
          </p>
          <p className="accent">{api.content.topics?.join(' · ')}</p>
        </section>
      )}
      <section>
        <h4>Why keep it?</h4>
        <div className="notes">
          {api.context.map((c) => (
            <div key={c.id}>
              <p>{c.text}</p>
              <p className="small secondary">
                {c.contributor === 'you'
                  ? 'Your note · Kept on this device'
                  : 'Sample saved context'}
              </p>
            </div>
          ))}
        </div>
        <form onSubmit={addNote} className="note-form">
          <label className="sr-only" htmlFor="note">
            Add a thought for later
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a thought for later"
            rows={2}
            maxLength={20000}
          />
          <button type="submit" className="text-action" disabled={!note.trim()}>
            Keep this note
          </button>
        </form>
      </section>
      <section>
        <div className="section-heading">
          <h4>Collections</h4>
          <details className="organize">
            <summary>Organize</summary>
            <fieldset>
              <legend className="sr-only">Collection membership</legend>
              {fixtures.collectionList.collections.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={api.collectionIds.includes(c.id)}
                    onChange={(e) =>
                      change(
                        item.id,
                        (next) => {
                          next.api.collectionIds = e.target.checked
                            ? [...next.api.collectionIds, c.id]
                            : next.api.collectionIds.filter((id) => id !== c.id);
                        },
                        'Collection membership updated'
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </fieldset>
          </details>
        </div>
        {api.collectionIds.length ? (
          api.collectionIds.map((id) => (
            <p key={id} className="status-line">
              <Layers size={18} aria-hidden="true" />
              {fixtures.collectionList.collections.find((c) => c.id === id)?.name}
            </p>
          ))
        ) : (
          <p className="secondary">Give this save a home in one or more collections.</p>
        )}
        {!!api.tags.length && (
          <p className="secondary">{api.tags.map((t) => '#' + t).join('  ')}</p>
        )}
      </section>
      {material && (
        <details className="disclosure">
          <summary>
            {material.field === 'article'
              ? 'Saved text · Partial preview'
              : 'Transcript · Sample passages'}
          </summary>
          <div className="stack">
            <p className="small secondary">{material.provenance.description}</p>
            {'text' in material.value && <p className="retained-text">{material.value.text}</p>}
            {'segments' in material.value &&
              material.value.segments.map((segment, index) => (
                <div key={index}>
                  <button
                    type="button"
                    className="text-action timestamp"
                    onClick={() =>
                      savePosition(segment.startSeconds / (api.content.durationSeconds ?? 1))
                    }
                  >
                    {timestamp(segment.startSeconds)}
                  </button>
                  <p>{segment.text}</p>
                </div>
              ))}
            {material.field === 'transcript' && (
              <p className="small secondary">
                Timestamp buttons update your saved place. Media playback stays at the original
                source.
              </p>
            )}
          </div>
        </details>
      )}
      {!!detail?.annotations.annotations.length && (
        <section>
          <h4>Marked for later</h4>
          {detail.annotations.annotations.map((a) => (
            <div key={a.id} className="annotation">
              {'exact' in a.anchor && <blockquote>{a.anchor.exact}</blockquote>}
              {'startSeconds' in a.anchor && (
                <button
                  type="button"
                  className="text-action timestamp"
                  onClick={() =>
                    savePosition(
                      Number('startSeconds' in a.anchor ? a.anchor.startSeconds : 0) /
                        (api.content.durationSeconds ?? 1)
                    )
                  }
                >
                  <Bookmark size={18} aria-hidden="true" />
                  {timestamp(a.anchor.startSeconds)}
                </button>
              )}
              <p className="secondary">{a.text}</p>
            </div>
          ))}
        </section>
      )}
      {!!detail?.relationships.relationships.length && (
        <section>
          <h4>A connection to follow</h4>
          {detail.relationships.relationships.map((relationship) => {
            const related = itemsById(relationship.target.itemId);
            return (
              related && (
                <button
                  type="button"
                  className="text-action"
                  key={relationship.id}
                  onClick={() => open(related.id)}
                >
                  <ArrowUpRight size={18} aria-hidden="true" />
                  {related.title}
                </button>
              )
            );
          })}
        </section>
      )}
      <details className="disclosure">
        <summary>What’s available</summary>
        <div className="stack">
          {api.enrichment.components.map((component) => (
            <div className="status-line" key={component.component}>
              {component.status === 'available' ? (
                <CheckCircle size={20} aria-hidden="true" />
              ) : (
                <Clock size={20} aria-hidden="true" />
              )}
              <span>
                <strong>
                  {component.component[0].toUpperCase() + component.component.slice(1)}
                </strong>
                <span className="small secondary">
                  {component.status === 'available'
                    ? 'Available in this preview'
                    : component.status === 'pending'
                      ? 'Waiting to be prepared'
                      : component.status === 'processing'
                        ? 'Being prepared · Your save is already kept'
                        : component.status === 'failed'
                          ? 'Couldn’t prepare this yet · Your save is safe'
                          : 'Source material isn’t available · Open the original instead'}
                </span>
              </span>
            </div>
          ))}
          <p className="small secondary">
            A save is kept even when extraction or understanding is pending or unavailable.
          </p>
        </div>
      </details>
      <hr />
      <a className="text-action" href={item.url} target="_blank" rel="noopener noreferrer">
        Open original
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
      <p className="small secondary">
        The original content stays at its source. This local preview is not connected to your
        account on the new API.
      </p>
      <div className="action-row">
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            change(
              item.id,
              (next) => {
                next.api.progress.completedAt = isComplete(next) ? null : new Date().toISOString();
              },
              'Completion updated'
            )
          }
        >
          <Check size={18} aria-hidden="true" />
          {isComplete(item) ? 'Mark unfinished' : 'Mark finished'}
        </button>
        <button
          type="button"
          className="text-action"
          onClick={() =>
            change(
              item.id,
              (next) => {
                next.api.archived = !next.api.archived;
              },
              'Archive updated'
            )
          }
        >
          <Archive size={18} aria-hidden="true" />
          {api.archived ? 'Unarchive' : 'Archive'}
        </button>
      </div>
    </article>
  );
  function itemsById(id: string) {
    const sample = fixtures.itemList.items.find((i) => i.id === id);
    return sample ? { id: sample.id, title: sample.content.title } : undefined;
  }
}

function Capture({
  section,
  save,
}: {
  section: Section;
  save: (input: {
    url: string;
    title: string;
    section: Item['section'];
    context: string;
    tags: string[];
    collection: string;
  }) => void;
}) {
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      save({
        url: String(data.get('url')),
        title: String(data.get('title')),
        section: String(data.get('section')) as Item['section'],
        context: String(data.get('context')),
        tags: String(data.get('tags')).split(','),
        collection: String(data.get('collection')),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this link.');
    }
  }
  return (
    <form className="capture-form stack" onSubmit={submit} noValidate>
      <label>
        Link
        <input name="url" type="url" autoFocus placeholder="https://…" required maxLength={8192} />
      </label>
      <label>
        Give it a name <span className="secondary">(optional)</span>
        <input name="title" maxLength={2000} />
      </label>
      <label>
        Save to
        <select name="section" defaultValue={section === 'Home' ? 'Articles' : section}>
          {sections
            .filter((s) => s !== 'Home')
            .map((s) => (
              <option key={s}>{s}</option>
            ))}
        </select>
      </label>
      <label>
        Why do you want to keep it?
        <textarea name="context" rows={3} maxLength={20000} />
      </label>
      <label>
        Tags <span className="secondary">(separated by commas)</span>
        <input name="tags" />
      </label>
      <label>
        Collection
        <select name="collection" defaultValue="">
          <option value="">No collection yet</option>
          {fixtures.collectionList.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Save
      </button>
      <p className="small secondary">
        Kept on this device. Saving the same link again adds your new context and keeps one
        reference. No account or connection is needed.
      </p>
    </form>
  );
}
