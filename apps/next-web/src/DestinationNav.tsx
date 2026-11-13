import { useEffect, useRef } from 'react';
import { House, Inbox, LibraryBig, Menu, Search, X } from 'lucide-react';

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

export function DestinationNav({
  current,
  choose,
}: {
  current: Destination;
  choose: (next: Destination) => void;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const wide = matchMedia('(min-width: 720px) and (orientation: landscape)');
    const close = () => {
      if (wide.matches) drawer.current?.close();
    };
    wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, []);
  const links = () => (
    <nav aria-label="Destinations" className="destination-links">
      {(Object.entries(destinations) as [Destination, typeof House][]).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          aria-current={current === name ? 'page' : undefined}
          onClick={() => {
            drawer.current?.close();
            choose(name);
          }}
        >
          <Icon aria-hidden="true" />
          {name}
        </button>
      ))}
    </nav>
  );
  return (
    <>
      <aside className="destination-sidebar">
        <p className="destination-brand">Zine</p>
        {links()}
      </aside>
      <div className="destination-mobile">
        <button
          type="button"
          className="destination-trigger glass"
          aria-label={`Open navigation, current page ${current}`}
          aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
        >
          <Menu aria-hidden="true" /> {current}
        </button>
        <button
          type="button"
          className="destination-trigger glass"
          aria-label="Search"
          onClick={() => choose('Search')}
        >
          <Search aria-hidden="true" />
        </button>
      </div>
      <dialog
        ref={drawer}
        className="destination-drawer"
        aria-label="Zine navigation"
        onClick={(event) => {
          if (event.target === event.currentTarget) drawer.current?.close();
        }}
      >
        <div className="destination-drawer-body">
          <div className="destination-drawer-title">
            <p className="destination-brand">Zine</p>
            <button
              type="button"
              className="icon-button"
              aria-label="Close navigation"
              onClick={() => drawer.current?.close()}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          {links()}
        </div>
      </dialog>
    </>
  );
}
