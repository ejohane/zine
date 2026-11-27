import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemCard, packBento, readsTall } from '@zine/next-ui';
import type { BentoCell, CardSize, ItemKind } from '@zine/next-ui';
import {
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
  Sun,
} from 'lucide-react';
import { count, loadLab } from './data';
import type { Lab, LabItem } from './data';

type Shell = (props: { lab: Lab }) => ReactNode;

/* ---------- The real cards ---------- */

function Card(props: { lab: Lab; item: LabItem; size: CardSize; narrow?: boolean }) {
  return (
    <ItemCard
      item={props.item}
      size={props.size}
      tallWidth={props.narrow ? 'narrow' : 'wide'}
      now={props.lab.now}
      newTab
    />
  );
}

/** One column of a bento band, as `@zine/next-ui` lays it out. */
function Cell({ lab, cell }: { lab: Lab; cell: BentoCell<LabItem> }) {
  const { kind, items } = cell;
  const card = (item: LabItem, size: CardSize, narrow = false) => (
    <Card key={item.id} lab={lab} item={item} size={size} narrow={narrow} />
  );
  const list = (from: number) => (
    <div className="zn-bento__list">{items.slice(from).map((item) => card(item, 'compact'))}</div>
  );
  let content: ReactNode;
  if (kind === 'large') content = card(items[0]!, 'large');
  else if (kind === 'tall') content = card(items[0]!, 'tall');
  else if (kind === 'stack') content = items.map((item) => card(item, 'large'));
  else if (kind === 'list') content = list(0);
  else if (kind === 'feature')
    content = (
      <>
        {card(items[0]!, 'large')}
        {list(1)}
      </>
    );
  else if (kind === 'tiles') content = items.map((item) => card(item, 'tile'));
  else if (kind === 'pair') content = items.map((item) => card(item, 'tall', true));
  else
    content = (
      <>
        {card(items[0]!, 'tall', true)}
        <div className="zn-bento__column">{items.slice(1).map((item) => card(item, 'tile'))}</div>
      </>
    );
  return <div className={`zn-bento__cell zn-bento__cell--${kind}`}>{content}</div>;
}

/** How many columns fit: wide cards stay between about 300 and 430 across, on any screen. */
function useColumns(widest: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () =>
      setColumns(Math.min(widest, Math.max(1, Math.ceil((box.clientWidth + 16) / 446))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [widest]);
  return [ref, columns] as const;
}

/** The package's bento packing at any column count, with room to slip something between bands. */
function Bands(props: {
  lab: Lab;
  items: LabItem[];
  canBeTall: (item: LabItem) => boolean;
  between?: (afterBand: number) => ReactNode;
}) {
  const [ref, columns] = useColumns(6);
  const bands = packBento(props.items, columns, props.canBeTall);
  return (
    <div ref={ref} className="zn-bento" style={{ '--zn-bento-columns': columns } as CSSProperties}>
      {bands.map((band, index) => (
        <Fragment key={band.cells[0]!.items[0]!.id}>
          <div className={`zn-bento__band zn-bento__band--${band.height}`}>
            {band.cells.map((cell) => (
              <Cell key={cell.items[0]!.id} lab={props.lab} cell={cell} />
            ))}
          </div>
          {props.between?.(index)}
        </Fragment>
      ))}
    </div>
  );
}

/** The inbox, sideways. */
function InboxRail({
  lab,
  items,
  tone,
}: {
  lab: Lab;
  items: LabItem[];
  tone?: 'accent' | 'badge';
}) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) =>
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: 'smooth',
    });
  return (
    <section className={tone ? `rail rail--${tone}` : 'rail'} aria-label="Inbox">
      <header>
        <h2>Inbox</h2>
        <span className="rail__count">{count(lab.counts.inbox)}</span>
        <button type="button" aria-label="Back" onClick={() => scroll(-1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" aria-label="More" onClick={() => scroll(1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </header>
      <div className="rail__track" ref={track} tabIndex={0}>
        {items.map((item) => (
          <Card key={item.id} lab={lab} item={item} size="tile" />
        ))}
      </div>
    </section>
  );
}

const icon = (Icon: typeof Play, label: string, extra?: string, current?: boolean) => (
  <button
    type="button"
    className={extra}
    aria-label={label}
    title={label}
    aria-current={current ? 'page' : undefined}
  >
    <Icon aria-hidden="true" />
  </button>
);

/** Things in progress lead, then everything else, newest first. */
function bookmarks(lab: Lab, limit: number) {
  const started = new Set(lab.resume.map((item) => item.id));
  const resume = lab.resume.slice(0, 4);
  // Open on a picture: started things that have one go first.
  const opening = [
    ...resume.filter((item) => item.picture),
    ...resume.filter((item) => !item.picture),
  ];
  return [...opening, ...lab.saved.filter((item) => !started.has(item.id))].slice(0, limit);
}

/* ---------- A. Plain: nothing but the bento ---------- */

const formats: [ItemKind, typeof Play, string][] = [
  ['article', BookOpen, 'Articles'],
  ['video', Play, 'Videos'],
  ['podcast', Headphones, 'Podcasts'],
  ['post', MessageSquare, 'Posts'],
];

const Plain: Shell = ({ lab }) => {
  const [kind, setKind] = useState<ItemKind>();
  const items = bookmarks(lab, 400)
    .filter((item) => !kind || item.kind === kind)
    .slice(0, 72);
  const inbox = lab.inbox.filter((item) => !kind || item.kind === kind);
  return (
    <div className="plain">
      <header className="plain-top">
        <span className="brand">Zine</span>
        <div role="group" aria-label="Format">
          {formats.map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={kind === id}
              onClick={() => setKind(kind === id ? undefined : id)}
            >
              <Icon aria-hidden="true" />
            </button>
          ))}
        </div>
        {icon(Search, 'Search')}
      </header>
      <Bands
        lab={lab}
        items={items}
        canBeTall={() => false}
        between={(index) =>
          index === 0 && inbox.length > 3 ? (
            <InboxRail lab={lab} items={inbox.slice(0, 16)} />
          ) : index === 4 && inbox.length > 20 ? (
            <InboxRail lab={lab} items={inbox.slice(16, 32)} />
          ) : null
        }
      />
      {icon(Plus, 'Save a link', 'fab')}
    </div>
  );
};

/* ---------- B. Mosaic: small, dense, picture-first ---------- */

const Mosaic: Shell = ({ lab }) => {
  const items = bookmarks(lab, 96);
  let sinceTall = 3;
  return (
    <div className="mosaic">
      <span className="brand">Zine</span>
      <div className="mosaic-grid">
        {items.map((item, index) => {
          // Now and then, something worth reading gets a card two tiles high.
          const tall = sinceTall >= 5 && readsTall(item) && (item.kind === 'post' || !item.picture);
          sinceTall = tall ? 0 : sinceTall + 1;
          return (
            <Fragment key={item.id}>
              {index === 10 ? (
                <InboxRail lab={lab} items={lab.inbox.slice(0, 18)} tone="badge" />
              ) : null}
              {index === 52 ? (
                <InboxRail lab={lab} items={lab.inbox.slice(18, 36)} tone="badge" />
              ) : null}
              <Card lab={lab} item={item} size={tall ? 'tall' : 'tile'} narrow />
            </Fragment>
          );
        })}
      </div>
      <nav className="dock" aria-label="Destinations">
        {icon(House, 'Home', undefined, true)}
        {icon(Inbox, 'Inbox')}
        {icon(LibraryBig, 'Library')}
        {icon(Search, 'Search')}
        {icon(Plus, 'Save a link', 'dock__save')}
      </nav>
    </div>
  );
};

/* ---------- C. Lead: a front page with one big story ---------- */

const Lead: Shell = ({ lab }) => {
  const all = bookmarks(lab, 70);
  // One lead story: the first save with both a picture and enough words gets the tall card.
  const lead = all.slice(0, 8).find((item) => readsTall(item) && item.picture);
  const items = lead ? [lead, ...all.filter((item) => item !== lead)] : all;
  const canBeTall = (item: LabItem) => item === lead;
  return (
    <div className="lead">
      <nav className="lead-nav" aria-label="Destinations">
        <span className="brand">Z</span>
        {icon(House, 'Home', undefined, true)}
        {icon(Inbox, 'Inbox')}
        {icon(LibraryBig, 'Library')}
        {icon(Search, 'Search')}
        {icon(Plus, 'Save a link', 'lead-nav__save')}
      </nav>
      <main className="lead-page">
        <p className="lead-date">
          {lab.now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <Bands
          lab={lab}
          items={items}
          canBeTall={canBeTall}
          between={(index) =>
            index === 0 ? (
              <InboxRail lab={lab} items={lab.inbox.slice(0, 16)} tone="accent" />
            ) : index === 3 ? (
              <InboxRail lab={lab} items={lab.inbox.slice(16, 32)} tone="accent" />
            ) : null
          }
        />
      </main>
    </div>
  );
};

/* ---------- The lab ---------- */

const options: { id: string; name: string; Shell: Shell }[] = [
  { id: 'plain', name: 'Plain', Shell: Plain },
  { id: 'mosaic', name: 'Mosaic', Shell: Mosaic },
  { id: 'lead', name: 'Lead', Shell: Lead },
];

function readHash() {
  const id = location.hash.slice(1);
  return options.some((option) => option.id === id) ? id : options[0]!.id;
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
  const option = options.find((o) => o.id === current)!;
  return (
    <div className="lab">
      <header className="lab-bar">
        <div className="lab-tabs" role="tablist" aria-label="Options">
          {options.map((o, index) => (
            <a key={o.id} role="tab" aria-selected={o.id === current} href={'#' + o.id}>
              <span>{'ABC'[index]}</span>
              {o.name}
            </a>
          ))}
        </div>
        <button
          type="button"
          className="lab-theme"
          onClick={flip}
          aria-label={dark ? 'Switch to day' : 'Switch to night'}
        >
          {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </header>
      <div className="frame" key={current}>
        {lab ? (
          <option.Shell lab={lab} />
        ) : (
          <p className="lab-wait">
            {failed ? 'Your saves did not load. Reload to try again.' : 'Loading…'}
          </p>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
