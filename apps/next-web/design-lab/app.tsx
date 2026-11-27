import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemCard, packBento } from '@zine/next-ui';
import type { BentoCell, CardSize } from '@zine/next-ui';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Headphones,
  House,
  Inbox,
  LayoutGrid,
  Moon,
  Play,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import { count, loadLab } from './data';
import type { Lab, LabItem } from './data';

/* ---------- The real cards, at any scale ---------- */

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

/**
 * A card enlarged to fill the width it is given. The card itself is untouched: it is laid out
 * at its designed width and the whole thing is magnified, so its proportions never change.
 */
function Scaled(props: { lab: Lab; item: LabItem; size: 'large' | 'compact'; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ zoom: 1, width: 392 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      // Never smaller than designed: a narrow screen gets the card at its own size, full width.
      const zoom = Math.min(props.max ?? 1.9, Math.max(1, element.clientWidth / 392));
      setBox({ zoom, width: element.clientWidth / zoom });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.max]);
  return (
    <div ref={ref} className="scaled">
      <div style={{ zoom: box.zoom, width: box.width }}>
        <Card lab={props.lab} item={props.item} size={props.size} />
      </div>
    </div>
  );
}

/* ---------- Chrome: value tabs on top, a small floating nav at the edge ---------- */

type Tab = 'all' | 'read' | 'watch' | 'listen' | 'inbox';

function useTab(lab: Lab) {
  const [tab, setTab] = useState<Tab>('all');
  const by = lab.counts.savedBy;
  const tabs: [Tab, string, number, typeof Play][] = [
    ['all', 'All', lab.counts.saved, LayoutGrid],
    ['read', 'Read', by.article + by.post, BookOpen],
    ['watch', 'Watch', by.video, Play],
    ['listen', 'Listen', by.podcast, Headphones],
    ['inbox', 'Inbox', lab.counts.inbox, Inbox],
  ];
  const started = new Set(lab.resume.map((item) => item.id));
  const resume = lab.resume.slice(0, 4);
  // Open on a picture: started things that have one go first.
  const opening = [
    ...resume.filter((item) => item.picture),
    ...resume.filter((item) => !item.picture),
  ];
  const saved = [...opening, ...lab.saved.filter((item) => !started.has(item.id))];
  const items =
    tab === 'inbox'
      ? lab.inbox
      : saved.filter(
          (item) =>
            tab === 'all' ||
            (tab === 'read' && (item.kind === 'article' || item.kind === 'post')) ||
            (tab === 'watch' && item.kind === 'video') ||
            (tab === 'listen' && item.kind === 'podcast')
        );
  const bar = (
    <nav className="tabs" aria-label="Show">
      <span className="tabs__mark" aria-label="Zine">
        Z
      </span>
      {tabs.map(([id, label, value, Icon]) => (
        <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
          <Icon aria-hidden="true" />
          <span>
            <small>{label}</small>
            <b>{count(value)}</b>
          </span>
        </button>
      ))}
    </nav>
  );
  return { tab, items, bar };
}

function InboxRail({ lab, items }: { lab: Lab; items: LabItem[] }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) =>
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: 'smooth',
    });
  if (items.length < 3) return null;
  return (
    <section className="rail" aria-label="Inbox">
      <header>
        <h2>Inbox</h2>
        <span>{count(lab.counts.inbox)}</span>
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

const MoreButton = ({ children }: { children: ReactNode }) => (
  <button type="button" className="more">
    <LayoutGrid aria-hidden="true" />
    <span>{children}</span>
    <ChevronRight aria-hidden="true" />
  </button>
);

/** Pictures lead: within each group of four, the first item with a picture becomes the hero. */
function spreads(items: LabItem[], limit: number) {
  const groups: { hero: LabItem; rows: LabItem[] }[] = [];
  for (let start = 0; start + 3 < items.length && groups.length < limit; start += 4) {
    const group = items.slice(start, start + 4);
    const hero = group.find((item) => item.picture) ?? group[0]!;
    groups.push({ hero, rows: group.filter((item) => item !== hero) });
  }
  return groups;
}

type Shell = (props: { lab: Lab }) => ReactNode;

/* ---------- A. Spotlight: one big bookmark, three beside it ---------- */

const Spotlight: Shell = ({ lab }) => {
  const { tab, items, bar } = useTab(lab);
  const groups = spreads(items, 7);
  return (
    <div className="page">
      {bar}
      {groups.map((group, index) => (
        <Fragment key={group.hero.id}>
          <section className={index % 2 ? 'spread spread--flip' : 'spread'}>
            <Scaled lab={lab} item={group.hero} size="large" />
            <div className="rows">
              {group.rows.map((item) => (
                <Scaled key={item.id} lab={lab} item={item} size="compact" max={1.5} />
              ))}
            </div>
          </section>
          {index === 0 && tab !== 'inbox' ? (
            <InboxRail lab={lab} items={lab.inbox.slice(0, 16)} />
          ) : null}
        </Fragment>
      ))}
      <MoreButton>{tab === 'inbox' ? 'Inbox' : `All ${count(lab.counts.saved)}`}</MoreButton>
    </div>
  );
};

/* ---------- B. Browse: the list drives the big picture ---------- */

const Browse: Shell = ({ lab }) => {
  const { tab, items, bar } = useTab(lab);
  const list = items.slice(0, 24);
  const [chosen, setChosen] = useState<string>();
  const hero =
    list.find((item) => item.id === chosen) ?? list.find((item) => item.picture) ?? list[0];
  return (
    <div className="page">
      {bar}
      <section className="browse">
        <div className="browse__hero">
          {hero ? <Scaled lab={lab} item={hero} size="large" /> : null}
        </div>
        <div className="rows">
          {list.map((item) => (
            <div
              key={item.id}
              className="rows__pick"
              aria-current={item === hero}
              onPointerEnter={() => setChosen(item.id)}
              onFocus={() => setChosen(item.id)}
            >
              <Scaled lab={lab} item={item} size="compact" max={1.35} />
            </div>
          ))}
        </div>
      </section>
      {tab !== 'inbox' ? <InboxRail lab={lab} items={lab.inbox.slice(0, 16)} /> : null}
      <MoreButton>{tab === 'inbox' ? 'Inbox' : `All ${count(lab.counts.saved)}`}</MoreButton>
    </div>
  );
};

/* ---------- C. Big bento: the bento, with everything larger ---------- */

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

const BigBento: Shell = ({ lab }) => {
  const { tab, items, bar } = useTab(lab);
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 3, zoom: 1.35 });
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const style = getComputedStyle(box);
      const width =
        box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      // Bigger cards on bigger screens: about 1.35x on a desktop, life-size on a phone.
      const zoom = width > 1000 ? 1.35 : width > 600 ? 1.15 : 1;
      setLayout({ zoom, columns: Math.max(1, Math.ceil((width / zoom + 16) / 446)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const bands = packBento(items.slice(0, 60), layout.columns, () => false);
  const bento = (from: number, to?: number) => (
    <div
      className="zn-bento"
      style={{ '--zn-bento-columns': layout.columns, zoom: layout.zoom } as CSSProperties}
    >
      {bands.slice(from, to).map((band) => (
        <div
          key={band.cells[0]!.items[0]!.id}
          className={`zn-bento__band zn-bento__band--${band.height}`}
        >
          {band.cells.map((cell) => (
            <Cell key={cell.items[0]!.id} lab={lab} cell={cell} />
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <div className="page" ref={ref}>
      {bar}
      {bento(0, 1)}
      {tab !== 'inbox' ? <InboxRail lab={lab} items={lab.inbox.slice(0, 16)} /> : null}
      {bento(1)}
    </div>
  );
};

/* ---------- The lab ---------- */

const options: { id: string; name: string; Shell: Shell }[] = [
  { id: 'spotlight', name: 'Spotlight', Shell: Spotlight },
  { id: 'browse', name: 'Browse', Shell: Browse },
  { id: 'big-bento', name: 'Big bento', Shell: BigBento },
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
      <div className="stage">
        <div className="frame" key={current}>
          {lab ? (
            <option.Shell lab={lab} />
          ) : (
            <p className="lab-wait">
              {failed ? 'Your saves did not load. Reload to try again.' : 'Loading…'}
            </p>
          )}
        </div>
        <nav className="edge" aria-label="Destinations">
          <button type="button" className="edge__save" aria-label="Save a link">
            <Plus aria-hidden="true" />
          </button>
          <div>
            <button type="button" aria-label="Home" aria-current="page">
              <House aria-hidden="true" />
            </button>
            <button type="button" aria-label="Inbox">
              <Inbox aria-hidden="true" />
            </button>
            <button type="button" aria-label="Search">
              <Search aria-hidden="true" />
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
