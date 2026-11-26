import { useEffect, useRef, useState } from 'react';
import {
  House,
  Inbox,
  LibraryBig,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react';

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

export const sidebarCollapsedKey = 'zine-next-web-sidebar-collapsed';

export function parseSidebarCollapsed(value: string | null | undefined): boolean {
  return value === 'true';
}

// Storage is passed lazily because merely touching `localStorage` can throw
// when the browser blocks site data.
export function readSidebarCollapsed(
  storage: () => Pick<Storage, 'getItem'> = () => localStorage
): boolean {
  try {
    return parseSidebarCollapsed(storage().getItem(sidebarCollapsedKey));
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(
  collapsed: boolean,
  storage: () => Pick<Storage, 'setItem'> = () => localStorage
): void {
  try {
    storage().setItem(sidebarCollapsedKey, String(collapsed));
  } catch {
    // The preference just lasts for this visit.
  }
}

export function DestinationNav({
  current,
  choose,
}: {
  current: Destination;
  choose: (next: Destination) => void;
}) {
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());
  const toggle = () => {
    writeSidebarCollapsed(!collapsed);
    setCollapsed(!collapsed);
  };
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const wide = matchMedia('(min-width: 720px) and (orientation: landscape)');
    const close = () => {
      if (wide.matches) drawer.current?.close();
    };
    wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, []);
  const links = (rail = false) => (
    <nav aria-label="Destinations" className="destination-links">
      {(Object.entries(destinations) as [Destination, typeof House][]).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          title={rail ? name : undefined}
          aria-current={current === name ? 'page' : undefined}
          onClick={() => {
            drawer.current?.close();
            choose(name);
          }}
        >
          <Icon aria-hidden="true" />
          <span className="destination-label">{name}</span>
        </button>
      ))}
    </nav>
  );
  return (
    <>
      <aside className="destination-sidebar" data-collapsed={collapsed}>
        <div className="destination-sidebar-header">
          <p className="destination-brand">
            Z<span className="destination-label">ine</span>
          </p>
          <button
            type="button"
            className="icon-button"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            aria-controls="destination-sidebar-links"
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={toggle}
          >
            <Toggle aria-hidden="true" />
          </button>
        </div>
        <div id="destination-sidebar-links">{links(collapsed)}</div>
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
