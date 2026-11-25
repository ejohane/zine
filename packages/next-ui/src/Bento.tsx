import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ItemCard } from './ItemCard';
import { bentoColumns, packBento, readsTall } from './packBento';
import type { BentoCell } from './packBento';
import type { CardItem } from './types';

export interface BentoProps {
  items: readonly CardItem[];
  /** Columns before the bento has been measured (server render, tests). The browser then counts its own. */
  columns?: number;
  now?: Date;
  onAction?: (item: CardItem) => void;
}

function Cell(props: {
  cell: BentoCell;
  now?: Date;
  onAction?: (item: CardItem) => void;
}): ReactNode {
  const { kind, items } = props.cell;
  const card = (item: CardItem, size: 'large' | 'compact' | 'tile' | 'tall', narrow = false) => (
    <ItemCard
      key={item.id}
      item={item}
      size={size}
      tallWidth={narrow ? 'narrow' : 'wide'}
      now={props.now}
      onAction={props.onAction}
    />
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

/** Lays items out as a bento: bands of mixed card sizes with no holes. See `packBento` for the rules. */
export function Bento({ items, columns = 1, now, onAction }: BentoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(columns);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const measure = () => setCount(bentoColumns(box.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const bands = packBento(items, count, readsTall);
  return (
    <div
      ref={ref}
      className="zn-bento"
      data-columns={count}
      style={{ '--zn-bento-columns': count } as CSSProperties}
    >
      {bands.map((band, index) => (
        <div key={index} className={`zn-bento__band zn-bento__band--${band.height}`}>
          {band.cells.map((cell) => (
            <Cell key={cell.items[0]!.id} cell={cell} now={now} onAction={onAction} />
          ))}
        </div>
      ))}
    </div>
  );
}
