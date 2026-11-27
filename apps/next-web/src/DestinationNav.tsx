import { useEffect, useRef, useState } from 'react';
import {
  House,
  Inbox,
  LibraryBig,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
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

export function parseSidebarCollapsed(value: unknown): boolean {
  return value === 'true';
}

// Storage is resolved inside the try block: reading `localStorage` itself can throw.
export function readSidebarCollapsed(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    return parseSidebarCollapsed((storage ?? localStorage).getItem(sidebarCollapsedKey));
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean, storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? localStorage).setItem(sidebarCollapsedKey, String(collapsed));
  } catch {
    // The preference is best effort; the sidebar still toggles for this visit.
  }
}

/**
 * The app's navigation: a left sidebar that collapses to an icon rail on wide screens, and on
 * upright ones a single menu button that opens a drawer. The button sits at the top of the page
 * and scrolls away with it. Save lives in the sidebar and in the drawer.
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
  const drawer = useRef<HTMLDialogElement>(null);
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());
  const toggle = () => {
    writeSidebarCollapsed(!collapsed);
    setCollapsed(!collapsed);
  };
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
          aria-current={current === name ? 'page' : undefined}
          title={rail ? name : undefined}
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
            className="icon-button destination-toggle"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            aria-controls="destination-sidebar-links"
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={toggle}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </button>
        </div>
        <button
          type="button"
          className="destination-save"
          aria-label="Save a link"
          title={collapsed ? 'Save a link' : undefined}
          onClick={capture}
        >
          <Plus aria-hidden="true" />
          <span className="destination-label">Save</span>
        </button>
        <div id="destination-sidebar-links">{links(collapsed)}</div>
      </aside>
      <div className="destination-mobile">
        <button
          type="button"
          className="destination-trigger"
          aria-label={`Open navigation, current page ${current}`}
          aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
        >
          <Menu aria-hidden="true" />
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
          <button
            type="button"
            className="destination-save"
            aria-label="Save a link"
            onClick={() => {
              drawer.current?.close();
              capture();
            }}
          >
            <Plus aria-hidden="true" />
            <span className="destination-label">Save</span>
          </button>
          {links()}
        </div>
      </dialog>
    </>
  );
}
