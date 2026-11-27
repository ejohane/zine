import { House, Inbox, LibraryBig, Plus, Search } from 'lucide-react';

const destinations = { Home: House, Inbox, Library: LibraryBig, Search };
export type Destination = keyof typeof destinations;

export function readDestination(): Destination {
  const value = new URLSearchParams(location.search).get('view');
  return (
    (Object.keys(destinations).find((name) => name.toLowerCase() === value) as
      | Destination
      | undefined) ?? 'Home'
  );
}

/**
 * The app's navigation: a small floating pill of destinations with Save above it. It sits at the
 * right edge on wide screens and along the bottom on upright ones (see `spotlight-home.css`).
 */
export function DestinationNav({
  current,
  choose,
  capture,
}: {
  current: Destination;
  choose: (next: Destination) => void;
  capture: () => void;
}) {
  return (
    <div className="edge-nav">
      <button type="button" className="edge-nav__save" aria-label="Save a link" onClick={capture}>
        <Plus aria-hidden="true" />
      </button>
      <nav aria-label="Destinations">
        {(Object.entries(destinations) as [Destination, typeof House][]).map(([name, Icon]) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            title={name}
            aria-current={current === name ? 'page' : undefined}
            onClick={() => choose(name)}
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
      </nav>
    </div>
  );
}
