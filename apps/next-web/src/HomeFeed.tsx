import { StoryCard } from './Feed';
import { plan } from './model';
import type { Item } from './model';

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
