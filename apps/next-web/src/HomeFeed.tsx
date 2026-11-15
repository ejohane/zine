import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StoryCard } from './Feed';
import { plan } from './model';
import type { Item } from './model';
import type { Home, RemoteItem } from './live-api';
import { composeGrid, composePhone, isPhone } from './homeLayout';
import { homeSource } from './homeEntries';
import { Feature, GridCard, ListCard, Tile } from './HomeCards';

export function BentoFeed({
  cards,
  label,
  open,
}: {
  cards: Item[];
  label: string;
  open: (id: string) => void;
}) {
  return (
    <div className="bento" aria-label={label}>
      {plan(cards).map(({ index, ...placement }) => (
        <StoryCard
          key={cards[index].id}
          item={cards[index]}
          placement={placement}
          onOpen={() => open(cards[index].id)}
        />
      ))}
    </div>
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => {
      // Ignore sub-pixel jitter so packing only reruns on real size changes.
      setWidth((previous) =>
        Math.abs(previous - element.clientWidth) > 2 ? element.clientWidth : previous
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function ShelfHead({ title, count }: { title: string; count?: string }) {
  return (
    <div className="shelf-head">
      <h2>{title}</h2>
      {count && <span>{count}</span>}
    </div>
  );
}

function GridEdition({
  source,
  width,
  open,
}: {
  source: ReturnType<typeof homeSource>;
  width: number;
  open: (id: string) => void;
}) {
  const edition = useMemo(() => composeGrid(source, width), [source, width]);
  return (
    <>
      {edition.shelves.map((shelf) => (
        <section
          className={shelf.title ? 'shelf' : 'shelf lead'}
          key={shelf.id}
          aria-label={shelf.title ?? 'Top picks'}
        >
          {shelf.title && <ShelfHead title={shelf.title} count={`${shelf.placed.length} picks`} />}
          <div
            className="home-grid"
            style={{
              gridTemplateColumns: `repeat(${edition.columns}, minmax(0, 1fr))`,
              gridAutoRows: `${edition.rowH}px`,
            }}
          >
            {shelf.placed.map((p) => (
              <GridCard
                key={p.entry.id}
                entry={p.entry}
                variant={p.variant}
                open={open}
                style={{
                  gridColumn: `${p.column + 1} / span ${p.columns}`,
                  gridRow: `${p.row + 1} / span ${p.rows}`,
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function PhoneEdition({
  source,
  open,
}: {
  source: ReturnType<typeof homeSource>;
  open: (id: string) => void;
}) {
  const edition = useMemo(() => composePhone(source), [source]);
  return (
    <>
      {edition.lead && (
        <section className="sec" aria-label="Top pick">
          <Feature entry={edition.lead} open={open} />
        </section>
      )}
      {edition.resume.length > 0 && (
        <section className="sec" aria-label="Pick up where you left off">
          <ShelfHead title="Pick up where you left off" count={String(edition.resume.length)} />
          <ListCard entries={edition.resume} open={open} />
        </section>
      )}
      {edition.recent.length > 0 && (
        <section className="sec" aria-label="Just saved">
          <ShelfHead title="Just saved" count={`${edition.recent.length} new`} />
          <div className="rail" role="list">
            {edition.recent.map((entry) => (
              <div role="listitem" key={entry.id}>
                <Tile entry={entry} open={open} />
              </div>
            ))}
          </div>
        </section>
      )}
      {edition.shelves.map((shelf) => (
        <section className="sec" key={shelf.id} aria-label={shelf.title}>
          <ShelfHead
            title={shelf.title}
            count={`${shelf.tiles.length + shelf.list.length} picks`}
          />
          {shelf.tiles.length > 0 && (
            <div className="tiles">
              {shelf.tiles.map((entry) => (
                <Tile key={entry.id} entry={entry} open={open} />
              ))}
            </div>
          )}
          {shelf.list.length > 0 && <ListCard entries={shelf.list} open={open} />}
        </section>
      ))}
    </>
  );
}

/** Lays out a Home source for the current width: the phone edition or the packed grid. */
export function HomeEdition({
  source,
  open,
}: {
  source: ReturnType<typeof homeSource>;
  open: (id: string) => void;
}) {
  const [ref, width] = useWidth();
  return (
    <div className="home-edition" ref={ref} aria-label="Home">
      {width > 0 &&
        (isPhone(width) ? (
          <div className="m3">
            <PhoneEdition source={source} open={open} />
          </div>
        ) : (
          <GridEdition source={source} width={width} open={open} />
        ))}
    </div>
  );
}

/** Home: a composed edition from `/v1/home`, filled out with the rest of the loaded library. */
export function HomeFeed({
  home,
  items,
  open,
}: {
  home: Home | undefined;
  items: RemoteItem[];
  open: (id: string) => void;
}) {
  const source = useMemo(() => homeSource(home, items), [home, items]);
  return <HomeEdition source={source} open={open} />;
}
