import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemCard } from '../src/index';
import type { CardItem, CardSize } from '../src/index';
import { find, NOW, posts } from './data';

const card = (item: CardItem, size: CardSize, tallWidth?: 'wide' | 'narrow') => (
  <ItemCard
    key={`${item.id}-${size}-${tallWidth ?? ''}`}
    item={item}
    size={size}
    tallWidth={tallWidth}
    now={NOW}
  />
);

const ROWS: [string, CardItem][] = [
  ['Video', find('Coding Isn')],
  ['Podcast', find('How Cisco')],
  ['Article with a picture', find('The Running Novelist')],
  ['Article without a picture', find('Working with designers')],
  ['Post with a title', find('Designing for Agents')],
  ['Post, text only', posts.text],
  ['Post with a wide video', posts.wide],
  ['Post with a tall video', posts.tall],
  ['Post quoting another post', posts.quote],
  ['Post with a link', posts.link],
];

function Sheet() {
  return (
    <section>
      <h2>Every kind at Large, Compact and Tile</h2>
      {ROWS.map(([label, item]) => (
        <div key={label}>
          <h3>{label}</h3>
          <div className="row">
            {card(item, 'large')}
            {card(item, 'compact')}
            {card(item, 'tile')}
          </div>
        </div>
      ))}
    </section>
  );
}

function Together() {
  const cell = (column: string, row: string, node: ReactNode) => (
    <div style={{ gridColumn: column, gridRow: row }}>{node}</div>
  );
  return (
    <section>
      <h2>Together</h2>
      <h3>Tiles in a row</h3>
      <div className="row">
        {[
          find('Good Taste'),
          posts.wide,
          find('How Cisco'),
          find('The Running Novelist'),
          find('Designing for Agents'),
          posts.quote,
        ].map((item) => card(item, 'tile'))}
      </div>
      <h3>Large cards</h3>
      <div className="row">
        {[find('Good Taste'), find('The Running Novelist'), posts.wide].map((item) =>
          card(item, 'large')
        )}
      </div>
      <div className="row split">
        <div>
          <h3>Compact list</h3>
          <div className="list">
            {[
              find('Good Taste'),
              posts.quote,
              find('The Running Novelist'),
              find('How Cisco'),
              find('Loops You Can Trust'),
              posts.wide,
            ].map((item) => card(item, 'compact'))}
          </div>
        </div>
        <div>
          <h3>Bento with a tall article</h3>
          <div className="bento">
            {cell('1', '1 / span 2', card(find('Working with designers'), 'tall', 'narrow'))}
            {cell('2', '1', card(posts.tall, 'tile'))}
            {cell('3', '1', card(find('Good Taste'), 'tile'))}
            {cell('4', '1', card(posts.quote, 'tile'))}
            {cell('2', '2', card(find('How Cisco'), 'tile'))}
            {cell('3', '2', card(posts.link, 'tile'))}
            {cell('4', '2', card(find('Why books'), 'tile'))}
          </div>
        </div>
      </div>
      <h3>Tall cards</h3>
      <div className="row">
        {card(find('Working with designers'), 'tall')}
        {card(posts.quote, 'tall')}
        {card(posts.tall, 'tall')}
      </div>
    </section>
  );
}

function Gallery() {
  return (
    <>
      {(['light', 'dark'] as const).map((mode) => (
        <main key={mode} className="mode" style={{ colorScheme: mode }}>
          <h1>Item cards · {mode === 'light' ? 'Day' : 'Night'}</h1>
          <Sheet />
          <Together />
        </main>
      ))}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
