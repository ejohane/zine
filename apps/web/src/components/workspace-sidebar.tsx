import { Folder, Home, Inbox, Library, Rss, Search, Settings, UserRound } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { AppWordmark } from '../app-wordmark';
import { cn } from '../components';
import { trpc } from '../lib/trpc';

const workspaceLinks = [
  { label: 'Today', to: '/home', icon: Home },
  { label: 'Inbox', to: '/inbox', icon: Inbox },
  { label: 'Library', to: '/library/bookmarks', icon: Library },
  { label: 'Search', to: '/search', icon: Search },
  { label: 'People', to: '/library/people', icon: UserRound },
  { label: 'Sources', to: '/library/sources', icon: Rss },
] as const;

export function WorkspaceSidebar() {
  const location = useLocation();
  const collectionsQuery = trpc.collections.list.useQuery();
  const collections = collectionsQuery.data?.collections ?? [];

  return (
    <aside className="new-page-sidebar" aria-label="Workspace navigation">
      <div className="new-page-sidebar__rail">
        <div className="new-page-sidebar__rail-top">
          <div className="new-page-sidebar__rail-header">
            <Link to="/home" className="new-page-sidebar__brand" aria-label="Go to Today">
              <div className="new-page-sidebar__brand-icon">
                <AppWordmark compact />
              </div>
            </Link>
          </div>

          <p className="workspace-sidebar__label">Workspace</p>
          <nav className="new-page-sidebar__rail-nav" aria-label="Primary">
            {workspaceLinks.map(({ label, to, icon: Icon }) => {
              const libraryActive =
                label === 'Library' &&
                (location.pathname === '/library/bookmarks' ||
                  location.pathname.startsWith('/item/'));

              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/home'}
                  className={({ isActive }) =>
                    cn(
                      'new-page-sidebar__rail-btn',
                      (isActive || libraryActive) && 'new-page-sidebar__rail-btn--active'
                    )
                  }
                  aria-label={label}
                >
                  <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="workspace-sidebar__collections">
            <p className="workspace-sidebar__label">Collections</p>
            <nav aria-label="Collections">
              <NavLink
                to="/library/collections"
                className={({ isActive }) =>
                  cn(
                    'new-page-sidebar__rail-btn workspace-sidebar__collection',
                    isActive && 'new-page-sidebar__rail-btn--active'
                  )
                }
              >
                <Folder size={17} strokeWidth={1.9} aria-hidden="true" />
                <span>All collections</span>
              </NavLink>
              {collections.slice(0, 5).map((collection, index) => (
                <Link
                  key={collection.id}
                  to={`/library/bookmarks?collection=${encodeURIComponent(collection.id)}`}
                  className="new-page-sidebar__rail-btn workspace-sidebar__collection"
                >
                  <span
                    className={`workspace-sidebar__collection-dot workspace-sidebar__collection-dot--${index % 4}`}
                    aria-hidden="true"
                  />
                  <span>{collection.name}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="new-page-sidebar__rail-footer">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
            }
            aria-label="Settings"
          >
            <Settings size={18} strokeWidth={1.9} aria-hidden="true" />
            <span>Settings</span>
          </NavLink>
        </div>
      </div>
    </aside>
  );
}
