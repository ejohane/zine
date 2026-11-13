import { StoryCard } from './Feed';
import { composeHome, plan } from './model';
import type { Item } from './model';
import { libraryPageSize } from './live-api';

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

export function HomeFeed({ cards, open }: { cards: Item[]; open: (id: string) => void }) {
  return (
    <div className="home-feed" aria-label="Home feed">
      {composeHome(cards, libraryPageSize).map(({ layout, groups }) => (
        <div className={`home-row home-row-${layout}`} key={groups[0].items[0].id}>
          {groups.map(({ title, presentation, items }) => (
            <div className="home-group" key={presentation}>
              {title && <h2>{title}</h2>}
              <div className={`home-cards home-cards-${presentation}`}>
                {items.map((item) => (
                  <StoryCard
                    key={item.id}
                    item={item}
                    presentation={presentation}
                    onOpen={() => open(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
