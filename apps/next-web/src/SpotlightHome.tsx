import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ItemCard } from '@zine/next-ui';
import type { CardItem } from '@zine/next-ui';
import '@fontsource-variable/inter';
import '@zine/next-design/tokens.css';
import '@zine/next-ui/cards.css';
import { inboxCards, spotlightItems, toSpreads } from './spotlight';
import type { Home, RemoteItem } from './live-api';
import type { Section } from './model';

type Shape = { width: number; height: number } | 'missing';

/**
 * The API does not say how big a picture is, and a post card lays out differently for wide and
 * tall pictures. This loads each post picture once and reports its real shape.
 */
function usePostPictureShapes(items: CardItem[]) {
  const [shapes, setShapes] = useState<Record<string, Shape>>({});
  const urls = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((item) => (item.kind === 'post' && item.picture ? [item.picture.url] : []))
        ),
      ]
        .sort()
        .join('\n'),
    [items]
  );
  useEffect(() => {
    let active = true;
    for (const url of urls ? urls.split('\n') : []) {
      const image = new Image();
      const report = (shape: Shape) => {
        if (active) setShapes((previous) => ({ ...previous, [url]: shape }));
      };
      image.onload = () => report({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => report('missing');
      image.src = url;
    }
    return () => {
      active = false;
    };
  }, [urls]);
  return shapes;
}

function withShape(item: CardItem, shapes: Record<string, Shape>): CardItem {
  if (item.kind !== 'post' || !item.picture) return item;
  const shape = shapes[item.picture.url];
  if (!shape) return item;
  if (shape === 'missing' || !shape.width || !shape.height) return { ...item, picture: undefined };
  return { ...item, picture: { ...item.picture, ...shape } };
}

/** The designed width of a wide card (`--zn-size-card-wide`). */
const CARD_WIDTH = 392;
/**
 * Home shows every card a little under its designed size, so its type reads smaller (Erik found
 * it too big on 2026-11-28). The card is laid out wider to make up the width, never squeezed.
 */
const TYPE_SCALE = 0.88;

/**
 * A card enlarged to fill the width it is given. The card is laid out at its designed width and
 * magnified whole, so its proportions never change. A narrow screen gets the card at Home's
 * type scale, laid out to the full width.
 */
function Scaled(props: {
  item: CardItem;
  size: 'large' | 'compact';
  max: number;
  open: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ zoom: 1, width: CARD_WIDTH });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const zoom = Math.min(props.max, Math.max(1, element.clientWidth / CARD_WIDTH)) * TYPE_SCALE;
      setBox({ zoom, width: element.clientWidth / zoom });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.max]);
  return (
    <div ref={ref} className="sp-scaled">
      <div style={{ zoom: box.zoom, width: box.width }}>
        <ItemCard
          item={props.item}
          size={props.size}
          onAction={(item) => props.open(item.id)}
          newTab
        />
      </div>
    </div>
  );
}

function InboxRail(props: {
  items: CardItem[];
  open: (id: string) => void;
  openInbox: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) =>
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  return (
    <section className="sp-rail" aria-labelledby="home-inbox">
      <header>
        <button type="button" className="sp-rail__title" onClick={props.openInbox}>
          <h2 id="home-inbox">Inbox</h2>
        </button>
        <button
          type="button"
          className="sp-rail__arrow"
          aria-label="Back"
          onClick={() => scroll(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sp-rail__arrow"
          aria-label="More"
          onClick={() => scroll(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </header>
      <div className="sp-rail__track" ref={track} tabIndex={0} aria-label="New in your inbox">
        {props.items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            size="tile"
            onAction={(card) => props.open(card.id)}
            newTab
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Home: your saves, a few at a time. Each block is one big card beside three rows, sides swapping
 * from block to block, with the inbox as a sideways rail after the first. A card opens the
 * original in a new tab; its three dots open the item here.
 */
export function SpotlightHome({
  home,
  items,
  inbox,
  section,
  open,
  openInbox,
}: {
  home: Home | undefined;
  items: RemoteItem[];
  inbox: RemoteItem[];
  section: Section;
  open: (id: string) => void;
  openInbox: () => void;
}) {
  const saves = useMemo(() => spotlightItems(home, items, section), [home, items, section]);
  const waiting = useMemo(() => inboxCards(inbox).slice(0, 16), [inbox]);
  const shapes = usePostPictureShapes(saves);
  const spreads = toSpreads(saves.map((item) => withShape(item, shapes)));
  return (
    <div className="sp-home" aria-label="Home">
      {spreads.map((spread, index) => (
        <Fragment key={spread.hero.id}>
          <section className={index % 2 ? 'sp-spread sp-spread--flip' : 'sp-spread'}>
            <Scaled item={spread.hero} size="large" max={1.7} open={open} />
            {spread.rows.length ? (
              <div className="sp-rows">
                {spread.rows.map((item) => (
                  <Scaled key={item.id} item={item} size="compact" max={1.25} open={open} />
                ))}
              </div>
            ) : null}
          </section>
          {index === 0 && section === 'Home' && waiting.length >= 3 ? (
            <InboxRail items={waiting} open={open} openInbox={openInbox} />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
