import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemCard } from '@zine/next-ui';
import type { CardSize, ItemKind } from '@zine/next-ui';
import {
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Headphones,
  House,
  Inbox,
  LibraryBig,
  MessageSquare,
  Moon,
  Play,
  Plus,
  Search,
  Shuffle,
  Sun,
} from 'lucide-react';
import { byCreator, byDay, count, loadLab } from './data';
import type { Lab, LabItem } from './data';

type Shell = (props: { lab: Lab }) => ReactNode;

/* ---------- Shared pieces: the real cards, laid out by each direction ---------- */

function Card({
  lab,
  item,
  size,
  narrow,
}: {
  lab: Lab;
  item: LabItem;
  size: CardSize;
  narrow?: boolean;
}) {
  return (
    <ItemCard item={item} size={size} tallWidth={narrow ? 'narrow' : 'wide'} now={lab.now} newTab />
  );
}

/** Four compact cards share the height of one large card. */
function Briefs({ lab, items, fixed }: { lab: Lab; items: LabItem[]; fixed?: boolean }) {
  return (
    <div className={fixed ? 'briefs briefs--fixed' : 'briefs'}>
      {items.map((item) => (
        <Card key={item.id} lab={lab} item={item} size="compact" />
      ))}
    </div>
  );
}

const kinds: { kind: ItemKind; label: string; verb: string; Icon: typeof Play }[] = [
  { kind: 'article', label: 'Articles', verb: 'Read', Icon: BookOpen },
  { kind: 'video', label: 'Videos', verb: 'Watch', Icon: Play },
  { kind: 'podcast', label: 'Podcasts', verb: 'Listen', Icon: Headphones },
  { kind: 'post', label: 'Posts', verb: 'Read', Icon: MessageSquare },
];

function Pill(props: {
  on?: boolean;
  onClick?: () => void;
  children: ReactNode;
  accent?: boolean;
  label?: string;
}) {
  const classes = ['pill', props.on ? 'pill--on' : '', props.accent ? 'pill--accent' : ''];
  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-pressed={props.on}
      aria-label={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

const SaveButton = ({ short }: { short?: boolean }) => (
  <Pill accent label="Save a link">
    <Plus aria-hidden="true" />
    {short ? null : 'Save'}
  </Pill>
);

/* ---------- 1. Front page: a finite daily edition ---------- */

type Place = 'home' | 'inbox' | 'library';

function Row({ lab, items, flip }: { lab: Lab; items: LabItem[]; flip?: boolean }) {
  const [a, b, ...rest] = items;
  const leads = [a, b].filter((item): item is LabItem => !!item);
  return (
    <div className={flip ? 'fp-row fp-row--flip' : 'fp-row'}>
      {leads.map((item) => (
        <Card key={item.id} lab={lab} item={item} size="large" />
      ))}
      {rest.length ? <Briefs lab={lab} items={rest.slice(0, 4)} fixed /> : null}
    </div>
  );
}

const FrontPage: Shell = ({ lab }) => {
  const [place, setPlace] = useState<Place>('home');
  const today = lab.now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const week = lab.saved.filter(
    (item) => lab.now.getTime() - new Date(item.at).getTime() < 7 * 86_400_000
  );
  const used = new Set(lab.resume.slice(0, 6).map((item) => item.id));
  const fresh = lab.saved.filter((item) => !used.has(item.id));
  const withPicture = (items: LabItem[]) => [
    ...items.filter((item) => item.picture),
    ...items.filter((item) => !item.picture),
  ];
  const posts = lab.saved.filter((item) => item.kind === 'post' && (item.body?.length ?? 0) > 60);
  const pages = (items: LabItem[]) =>
    Array.from({ length: Math.min(5, Math.ceil(items.length / 6)) }, (_, i) =>
      items.slice(i * 6, i * 6 + 6)
    );
  const nav: [Place, string, number?][] = [
    ['home', 'Today'],
    ['inbox', 'Inbox', lab.counts.inbox],
    ['library', 'Library', lab.counts.saved],
  ];
  return (
    <div className="fp">
      <header className="fp-mast">
        <span className="brand">Zine</span>
        <nav aria-label="Destinations">
          {nav.map(([id, label, n]) => (
            <Pill key={id} on={place === id} onClick={() => setPlace(id)}>
              {label}
              {n ? <span className="pill__count">{count(n)}</span> : null}
            </Pill>
          ))}
        </nav>
        <span className="fp-mast__end">
          <Pill label="Search">
            <Search aria-hidden="true" />
          </Pill>
          <SaveButton />
        </span>
      </header>
      {place === 'home' ? (
        <main className="fp-page">
          <div className="fp-date">
            <h1>{today}</h1>
            <p>
              {count(lab.counts.started)} in progress · {week.length} saved this week ·{' '}
              {count(lab.counts.inbox)} waiting in your inbox
            </p>
          </div>
          <section>
            <h2 className="continue">Continue</h2>
            <Row lab={lab} items={lab.resume.slice(0, 6)} />
          </section>
          <section>
            <h2>Saved this week</h2>
            <Row lab={lab} items={withPicture(fresh.slice(0, 6))} flip />
          </section>
          <section>
            <div className="heading">
              <h2>New from people you follow</h2>
              <button type="button" className="quiet" onClick={() => setPlace('inbox')}>
                Open inbox · {count(lab.counts.inbox)}
              </button>
            </div>
            <div className="tiles">
              {lab.inbox.slice(0, 6).map((item) => (
                <Card key={item.id} lab={lab} item={item} size="tile" />
              ))}
            </div>
          </section>
          <section>
            <h2>Posts you kept</h2>
            <div className="fp-row">
              {posts.slice(0, 3).map((item) => (
                <Card key={item.id} lab={lab} item={item} size="large" />
              ))}
            </div>
          </section>
          <section>
            <div className="heading">
              <h2>From Faves</h2>
              <span className="quiet">
                {count(lab.counts.collections.Faves ?? 0)} in the collection
              </span>
            </div>
            <div className="tiles">
              {lab.faves.slice(6, 12).map((item) => (
                <Card key={item.id} lab={lab} item={item} size="tile" />
              ))}
            </div>
          </section>
          <footer className="fp-end">
            <p>
              That is the edition for {lab.now.toLocaleDateString('en-US', { weekday: 'long' })}.
            </p>
            <Pill onClick={() => setPlace('library')}>
              Browse all {count(lab.counts.saved)} saves
            </Pill>
          </footer>
        </main>
      ) : (
        <main className="fp-page">
          <div className="fp-date">
            <h1>{place === 'inbox' ? 'Inbox' : 'Library'}</h1>
            <p>
              {place === 'inbox'
                ? `${count(lab.counts.inbox)} new from ${lab.counts.sources} sources`
                : `${count(lab.counts.saved)} saves`}
            </p>
          </div>
          {byDay(place === 'inbox' ? lab.inbox : lab.saved, lab.now)
            .slice(0, 6)
            .map((group) => (
              <section key={group.label}>
                <h2>{group.label}</h2>
                {pages(group.items).map((page, index) => (
                  <Row
                    key={page[0]!.id}
                    lab={lab}
                    items={withPicture(page)}
                    flip={index % 2 === 1}
                  />
                ))}
              </section>
            ))}
        </main>
      )}
    </div>
  );
};

/* ---------- 2. Workbench: three panes, built for triage ---------- */

type Bench = 'inbox' | 'queue' | 'started' | 'faves' | ItemKind;

const Workbench: Shell = ({ lab }) => {
  const [view, setView] = useState<Bench>('inbox');
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const base =
      view === 'inbox'
        ? lab.inbox
        : view === 'queue'
          ? lab.saved
          : view === 'started'
            ? lab.resume
            : view === 'faves'
              ? lab.faves
              : lab.saved.filter((item) => item.kind === view);
    const text = query.trim().toLowerCase();
    return text
      ? base.filter((item) =>
          `${item.title ?? ''} ${item.body ?? ''} ${item.creator.name}`.toLowerCase().includes(text)
        )
      : base;
  }, [lab, view, query]);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const list = useRef<HTMLDivElement>(null);
  const move = useCallback(
    (step: number) => {
      const index = Math.max(
        0,
        items.findIndex((item) => item.id === selected?.id)
      );
      const next = items[Math.min(items.length - 1, Math.max(0, index + step))];
      if (!next) return;
      setSelectedId(next.id);
      list.current?.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
    },
    [items, selected]
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).tagName === 'INPUT') return;
      if (event.key === 'j') move(1);
      if (event.key === 'k') move(-1);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [move]);
  const link = (id: Bench, label: string, n: number, Icon?: typeof Play) => (
    <button
      key={id}
      type="button"
      className={Icon ? 'wb-link' : 'wb-link wb-link--plain'}
      aria-current={view === id ? 'page' : undefined}
      onClick={() => setView(id)}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span>{label}</span>
      <span className="wb-link__count">{count(n)}</span>
    </button>
  );
  const titles: Record<string, string> = {
    inbox: 'Inbox',
    queue: 'Queue',
    started: 'In progress',
    faves: 'Faves',
  };
  const title = titles[view] ?? kinds.find((k) => k.kind === view)!.label;
  const totals: Record<string, number> = {
    inbox: lab.counts.inbox,
    queue: lab.counts.saved,
    started: lab.counts.started,
    faves: lab.counts.collections.Faves ?? 0,
    ...lab.counts.savedBy,
  };
  const more = selected
    ? [...lab.saved, ...lab.inbox]
        .filter((item) => item.creator.name === selected.creator.name && item.id !== selected.id)
        .slice(0, 4)
    : [];
  const sources = byCreator(lab.inbox).slice(0, 7);
  return (
    <div className="wb">
      <aside className="wb-side">
        <div className="wb-side__top">
          <span className="brand">Zine</span>
          <SaveButton />
        </div>
        <nav aria-label="Destinations">
          {link('inbox', 'Inbox', lab.counts.inbox, Inbox)}
          {link('queue', 'Queue', lab.counts.saved, LibraryBig)}
          {link('started', 'In progress', lab.counts.started, Play)}
          <h3>Collections</h3>
          {link('faves', 'Faves', lab.counts.collections.Faves ?? 0)}
          <button type="button" className="wb-link wb-link--plain">
            <span>Car Ride</span>
            <span className="wb-link__count">{lab.counts.collections['Car Ride'] ?? 0}</span>
          </button>
          <h3>Formats</h3>
          {kinds.map((k) => link(k.kind, k.label, lab.counts.savedBy[k.kind], k.Icon))}
          <h3>Following · {lab.counts.sources}</h3>
          {sources.map((source) => (
            <button
              key={source.name}
              type="button"
              className="wb-link"
              onClick={() => {
                setView('inbox');
                setQuery(source.name);
              }}
            >
              {source.avatarUrl ? (
                <img src={source.avatarUrl} alt="" />
              ) : (
                <span className="wb-dot">{source.name.slice(0, 1).toUpperCase()}</span>
              )}
              <span>{source.name}</span>
              <span className="wb-link__count">{source.items.length}</span>
            </button>
          ))}
        </nav>
      </aside>
      <section className="wb-list" aria-label={title}>
        <header>
          <div className="heading">
            <h1>{title}</h1>
            <span className="quiet">
              {count(query ? items.length : (totals[view] ?? items.length))}
            </span>
          </div>
          <label className="wb-search">
            <Search aria-hidden="true" />
            <input
              id="wb-search"
              type="search"
              placeholder={`Search ${title.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>
        <div className="wb-rows" ref={list}>
          {byDay(items, lab.now).map((group) => (
            <div key={group.label + group.items[0]!.id}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  data-id={item.id}
                  className="wb-row"
                  aria-selected={item.id === selected?.id}
                >
                  <Card lab={lab} item={item} size="compact" />
                  <button
                    type="button"
                    className="wb-row__pick"
                    aria-label={`Show ${item.title ?? 'post'}`}
                    onClick={() => setSelectedId(item.id)}
                  />
                </div>
              ))}
            </div>
          ))}
          {items.length === 0 ? <p className="quiet wb-empty">Nothing matches “{query}”.</p> : null}
        </div>
      </section>
      <section className="wb-detail" aria-label="Selected item">
        {selected ? (
          <>
            <div className="wb-actions">
              <a
                className="pill pill--accent"
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open original <ArrowUpRight aria-hidden="true" />
              </a>
              {selected.inbox ? (
                <>
                  <Pill>Save to queue</Pill>
                  <Pill>Dismiss</Pill>
                </>
              ) : (
                <>
                  <Pill>Mark finished</Pill>
                  <Pill>Add to collection</Pill>
                  <Pill>Archive</Pill>
                </>
              )}
              <span className="quiet wb-keys">
                <kbd>J</kbd> <kbd>K</kbd> to move
              </span>
            </div>
            <div className="wb-open">
              <Card lab={lab} item={selected} size="large" />
              <div className="wb-about">
                {selected.summary ? (
                  <>
                    <h3>What it is about</h3>
                    <p>{selected.summary}</p>
                  </>
                ) : null}
                {selected.topics.length ? (
                  <div className="wb-topics">
                    {selected.topics.map((topic) => (
                      <span key={topic}>{topic}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {more.length ? (
              <>
                <h3>More from {selected.creator.name}</h3>
                <div className="wb-more">
                  {more.map((item) => (
                    <Card key={item.id} lab={lab} item={item} size="compact" />
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
};

/* ---------- 3. Shelves: sideways rails by mood, length and source ---------- */

function Rail(props: {
  lab: Lab;
  title: ReactNode;
  note?: string;
  items: LabItem[];
  size?: CardSize;
  accent?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  if (props.items.length === 0) return null;
  const scroll = (direction: number) =>
    scroller.current?.scrollBy({
      left: direction * scroller.current.clientWidth * 0.8,
      behavior: 'smooth',
    });
  return (
    <section className="rail">
      <div className="heading">
        <h2 className={props.accent ? 'continue' : undefined}>{props.title}</h2>
        {props.note ? <span className="quiet">{props.note}</span> : null}
        <span className="rail__arrows">
          <Pill label="Scroll back" onClick={() => scroll(-1)}>
            <ChevronLeft aria-hidden="true" />
          </Pill>
          <Pill label="Scroll on" onClick={() => scroll(1)}>
            <ChevronRight aria-hidden="true" />
          </Pill>
        </span>
      </div>
      <div
        className={`rail__track rail__track--${props.size ?? 'tile'}`}
        ref={scroller}
        tabIndex={0}
      >
        {props.items.map((item) => (
          <Card key={item.id} lab={props.lab} item={item} size={props.size ?? 'tile'} />
        ))}
      </div>
    </section>
  );
}

type Lens = 'all' | 'read' | 'watch' | 'listen';
const inLens = (lens: Lens) => (item: LabItem) =>
  lens === 'all' ||
  (lens === 'read' && (item.kind === 'article' || item.kind === 'post')) ||
  (lens === 'watch' && item.kind === 'video') ||
  (lens === 'listen' && item.kind === 'podcast');

const lenses: [Lens, string, typeof Play][] = [
  ['all', 'Everything', House],
  ['read', 'Read', BookOpen],
  ['watch', 'Watch', Play],
  ['listen', 'Listen', Headphones],
];

function FloatingNav({
  place,
  setPlace,
  lab,
  names,
}: {
  place: Place;
  setPlace: (place: Place) => void;
  lab: Lab;
  names: [string, string, string];
}) {
  const tabs: [Place, string, typeof Play, number?][] = [
    ['home', names[0], House],
    ['inbox', names[1], Inbox, lab.counts.inbox],
    ['library', names[2], LibraryBig],
  ];
  return (
    <nav className="dock" aria-label="Destinations">
      {tabs.map(([id, label, Icon, n]) => (
        <button
          key={id}
          type="button"
          aria-current={place === id ? 'page' : undefined}
          onClick={() => setPlace(id)}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
          {n ? <span className="pill__count">{count(n)}</span> : null}
        </button>
      ))}
      <button type="button" aria-label="Search">
        <Search aria-hidden="true" />
      </button>
      <button type="button" className="dock__save" aria-label="Save a link">
        <Plus aria-hidden="true" />
      </button>
    </nav>
  );
}

const Shelves: Shell = ({ lab }) => {
  const [place, setPlace] = useState<Place>('home');
  const [lens, setLens] = useState<Lens>('all');
  const fits = inLens(lens);
  const saved = lab.saved.filter(fits);
  const inbox = lab.inbox.filter(fits);
  const sources = byCreator(inbox).filter((source) => source.items.length > 1);
  const source = (group: (typeof sources)[number]) => (
    <Rail
      key={group.name}
      lab={lab}
      items={group.items}
      note={`${group.items.length} new`}
      title={
        <span className="rail__source">
          {group.avatarUrl ? <img src={group.avatarUrl} alt="" /> : null}
          {group.name}
        </span>
      }
    />
  );
  return (
    <div className="sh">
      <div className="sh-top">
        <span className="brand">Zine</span>
        <div className="sh-lens" role="group" aria-label="What are you in the mood for">
          {lenses.map(([id, label, Icon]) => (
            <Pill key={id} on={lens === id} onClick={() => setLens(id)}>
              <Icon aria-hidden="true" />
              {label}
            </Pill>
          ))}
        </div>
      </div>
      <main className="sh-page">
        {place === 'home' ? (
          <>
            <Rail
              lab={lab}
              title="Continue"
              accent
              note={`${count(lab.counts.started)} started`}
              items={lab.resume.filter(fits)}
              size="large"
            />
            <Rail lab={lab} title="Just saved" items={saved.slice(0, 14)} />
            <Rail
              lab={lab}
              title="Under 15 minutes"
              note="Quick ones"
              items={saved.filter((item) => (item.minutesLeft ?? 99) <= 15).slice(0, 14)}
            />
            {sources.slice(0, 2).map(source)}
            <Rail
              lab={lab}
              title="Settle in"
              note="An hour or more"
              items={saved.filter((item) => (item.minutesLeft ?? 0) >= 60).slice(0, 14)}
            />
            <Rail
              lab={lab}
              title="Faves"
              note={`${count(lab.counts.collections.Faves ?? 0)} in the collection`}
              items={lab.faves.filter(fits)}
            />
            <Rail
              lab={lab}
              title="Posts you kept"
              items={saved.filter((item) => item.kind === 'post')}
              size="large"
            />
          </>
        ) : place === 'inbox' ? (
          <>
            <div className="sh-title">
              <h1>Inbox</h1>
              <p className="quiet">
                {count(lab.counts.inbox)} new from {lab.counts.sources} sources, one shelf each
              </p>
            </div>
            {sources.slice(0, 9).map(source)}
          </>
        ) : (
          <>
            <div className="sh-title">
              <h1>Library</h1>
              <p className="quiet">{count(lab.counts.saved)} saves</p>
            </div>
            {kinds.map((k) => (
              <Rail
                key={k.kind}
                lab={lab}
                title={k.label}
                note={count(lab.counts.savedBy[k.kind])}
                items={saved.filter((item) => item.kind === k.kind).slice(0, 16)}
                size={k.kind === 'post' ? 'large' : 'tile'}
              />
            ))}
          </>
        )}
      </main>
      <FloatingNav
        place={place}
        setPlace={setPlace}
        lab={lab}
        names={['Home', 'Inbox', 'Library']}
      />
    </div>
  );
};

/* ---------- 4. Stream: one column, newest first, with the calendar in the margin ---------- */

const Stream: Shell = ({ lab }) => {
  const [source, setSource] = useState<'saved' | 'inbox'>('saved');
  const [kind, setKind] = useState<ItemKind | 'all'>('all');
  const items = (source === 'saved' ? lab.saved : lab.inbox).filter(
    (item) => kind === 'all' || item.kind === kind
  );
  const following = byCreator(lab.inbox)
    .filter((group) => group.avatarUrl)
    .slice(0, 12);
  return (
    <div className="st">
      <aside className="st-nav">
        <span className="brand">Zine</span>
        <nav aria-label="Destinations">
          <button
            type="button"
            aria-current={source === 'saved' ? 'page' : undefined}
            onClick={() => setSource('saved')}
          >
            Saved <span className="quiet">{count(lab.counts.saved)}</span>
          </button>
          <button
            type="button"
            aria-current={source === 'inbox' ? 'page' : undefined}
            onClick={() => setSource('inbox')}
          >
            Inbox <span className="quiet">{count(lab.counts.inbox)}</span>
          </button>
          <button type="button">Collections</button>
          <button type="button">Search</button>
        </nav>
        <SaveButton />
      </aside>
      <main className="st-main">
        <div className="st-filters">
          <Pill on={kind === 'all'} onClick={() => setKind('all')}>
            All
          </Pill>
          {kinds.map((k) => (
            <Pill key={k.kind} on={kind === k.kind} onClick={() => setKind(k.kind)} label={k.label}>
              <k.Icon aria-hidden="true" />
              <span className="st-filters__word">{k.label}</span>
            </Pill>
          ))}
        </div>
        {byDay(items, lab.now)
          .slice(0, 14)
          .map((group) => (
            <section key={group.label + group.items[0]!.id} className="st-day">
              <header>
                <span className="st-day__number">{group.date.getDate()}</span>
                <span className="st-day__name">
                  {group.label === 'Today' || group.label === 'Yesterday'
                    ? group.label
                    : group.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short' })}
                </span>
                <span className="quiet">
                  {group.items.length} {source === 'saved' ? 'saved' : 'new'}
                </span>
              </header>
              <div className="st-cards">
                {group.items.map((item) => (
                  <Card key={item.id} lab={lab} item={item} size="large" />
                ))}
              </div>
            </section>
          ))}
      </main>
      <aside className="st-side">
        <h2 className="continue">Continue</h2>
        <Briefs lab={lab} items={lab.resume.slice(0, 4)} />
        <h2>This month</h2>
        <p className="st-stat">
          <span>{count(lab.counts.month)}</span> saved in{' '}
          {lab.now.toLocaleDateString('en-US', { month: 'long' })}
        </p>
        <h2>Following</h2>
        <div className="st-faces">
          {following.map((group) => (
            <img key={group.name} src={group.avatarUrl} alt={group.name} title={group.name} />
          ))}
          <span className="quiet">+{lab.counts.sources - following.length}</span>
        </div>
      </aside>
    </div>
  );
};

/* ---------- 5. Focus: one question, one pick ---------- */

const budgets: [number, string][] = [
  [10, '10 min'],
  [20, '20 min'],
  [45, '45 min'],
  [999, 'An hour or more'],
];

const Focus: Shell = ({ lab }) => {
  const [place, setPlace] = useState<Place>('home');
  const [budget, setBudget] = useState(20);
  const [lens, setLens] = useState<Lens>('all');
  const [turn, setTurn] = useState(0);
  const pool = useMemo(() => {
    const started = new Set(lab.resume.map((item) => item.id));
    const all = [...lab.resume, ...lab.saved.filter((item) => !started.has(item.id))];
    return all
      .filter(inLens(lens))
      .filter(
        (item) =>
          item.minutesLeft &&
          (budget === 999
            ? item.minutesLeft >= 45
            : item.minutesLeft <= budget && item.minutesLeft > budget / 4)
      );
  }, [lab, budget, lens]);
  const pick = pool.length ? pool[turn % pool.length] : undefined;
  const others = pool
    .filter((item) => item !== pick)
    .slice(turn % Math.max(1, pool.length - 4), (turn % Math.max(1, pool.length - 4)) + 4);
  const browse = place === 'inbox' ? lab.inbox : lab.saved;
  return (
    <div className="fo">
      {place === 'home' ? (
        <main className="fo-page">
          <h1>What do you have time for?</h1>
          <div className="fo-ask">
            <div role="group" aria-label="How long">
              {budgets.map(([value, label]) => (
                <Pill
                  key={value}
                  on={budget === value}
                  onClick={() => {
                    setBudget(value);
                    setTurn(0);
                  }}
                >
                  {label}
                </Pill>
              ))}
            </div>
            <div role="group" aria-label="Doing what">
              {lenses.map(([id, label, Icon]) => (
                <Pill
                  key={id}
                  on={lens === id}
                  onClick={() => {
                    setLens(id);
                    setTurn(0);
                  }}
                >
                  <Icon aria-hidden="true" />
                  {id === 'all' ? 'Anything' : label}
                </Pill>
              ))}
            </div>
          </div>
          {pick ? (
            <div className="fo-answer">
              <div>
                <div className="heading">
                  <h2 className={pick.progress ? 'continue' : undefined}>
                    {pick.progress ? 'Continue' : 'Start with this'}
                  </h2>
                  <Pill onClick={() => setTurn(turn + 1)}>
                    <Shuffle aria-hidden="true" />
                    Another
                  </Pill>
                </div>
                <Card lab={lab} item={pick} size="large" />
              </div>
              <div>
                <div className="heading">
                  <h2>Also fits</h2>
                  <span className="quiet">{pool.length} of your saves fit</span>
                </div>
                <Briefs lab={lab} items={others} fixed />
              </div>
            </div>
          ) : (
            <p className="fo-none">
              Nothing in your queue fits that. Try a longer window or a different kind.
            </p>
          )}
          <div className="fo-rest">
            <button type="button" onClick={() => setPlace('inbox')}>
              <strong>{count(lab.counts.inbox)}</strong> new in your inbox
            </button>
            <button type="button" onClick={() => setPlace('library')}>
              <strong>{count(lab.counts.saved)}</strong> saves in your library
            </button>
            <span>
              <strong>{count(lab.counts.started)}</strong> in progress
            </span>
          </div>
        </main>
      ) : (
        <main className="fo-page">
          <h1>{place === 'inbox' ? 'Inbox' : 'Library'}</h1>
          {byDay(browse, lab.now)
            .slice(0, 8)
            .map((group) => (
              <section key={group.label + group.items[0]!.id} className="fo-day">
                <h2>{group.label}</h2>
                <div className="fo-list">
                  {group.items.map((item) => (
                    <Card key={item.id} lab={lab} item={item} size="compact" />
                  ))}
                </div>
              </section>
            ))}
        </main>
      )}
      <FloatingNav
        place={place}
        setPlace={setPlace}
        lab={lab}
        names={['Now', 'Inbox', 'Library']}
      />
    </div>
  );
};

/* ---------- The lab itself ---------- */

const directions: { id: string; name: string; premise: string; Shell: Shell }[] = [
  {
    id: 'front-page',
    name: 'Front page',
    premise: 'A daily edition with a fixed order and an end. Two features and four briefs per row.',
    Shell: FrontPage,
  },
  {
    id: 'workbench',
    name: 'Workbench',
    premise:
      'Three panes for working through 3,027 inbox items: places, a dense list, the selected item.',
    Shell: Workbench,
  },
  {
    id: 'shelves',
    name: 'Shelves',
    premise: 'Sideways shelves by mood, length and source. One lens switch: read, watch or listen.',
    Shell: Shelves,
  },
  {
    id: 'stream',
    name: 'Stream',
    premise:
      'One column, newest first, with the calendar in the margin. Every item gets a full card.',
    Shell: Stream,
  },
  {
    id: 'focus',
    name: 'Focus',
    premise:
      'Home asks how long you have and answers with one pick. Everything else is one tap away.',
    Shell: Focus,
  },
];

function readHash() {
  const id = location.hash.slice(1);
  return directions.some((direction) => direction.id === id) ? id : directions[0]!.id;
}

function App() {
  const [lab, setLab] = useState<Lab>();
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(readHash);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme);
  useEffect(() => {
    loadLab().then(setLab, () => setFailed(true));
    const onHash = () => setCurrent(readHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };
  const direction = directions.find((d) => d.id === current)!;
  return (
    <div className="lab">
      <header className="lab-bar">
        <div className="lab-tabs" role="tablist" aria-label="Directions">
          {directions.map((d, index) => (
            <a key={d.id} role="tab" aria-selected={d.id === current} href={'#' + d.id}>
              <span>{index + 1}</span>
              {d.name}
            </a>
          ))}
        </div>
        <p className="lab-premise">{direction.premise}</p>
        <button
          type="button"
          className="lab-theme"
          onClick={flip}
          aria-label={dark ? 'Switch to day' : 'Switch to night'}
        >
          {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </header>
      <div className="frame fluid" key={current}>
        {lab ? (
          <direction.Shell lab={lab} />
        ) : (
          <p className="lab-wait">
            {failed
              ? 'The saved items for this page did not load. Reload to try again.'
              : 'Loading your saves…'}
          </p>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
