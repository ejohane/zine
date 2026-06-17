import { BookmarkCheck, Home, Inbox, Search, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { cn } from '../components';
import { useMediaQuery } from '../lib/use-media-query';

export function MobileTabBar() {
  const isPhoneLayout = useMediaQuery('(max-width: 700px)');

  if (!isPhoneLayout) {
    return null;
  }

  return (
    <nav className="mobile-tab-bar" aria-label="Tab bar">
      <NavLink
        to="/home"
        className={({ isActive }) =>
          cn('mobile-tab-bar__tab', isActive && 'mobile-tab-bar__tab--active')
        }
        aria-label="Home"
      >
        <Home size={20} strokeWidth={2} />
        <span className="mobile-tab-bar__label">Home</span>
      </NavLink>
      <NavLink
        to="/inbox"
        className={({ isActive }) =>
          cn('mobile-tab-bar__tab', isActive && 'mobile-tab-bar__tab--active')
        }
        aria-label="Inbox"
      >
        <Inbox size={20} strokeWidth={2} />
        <span className="mobile-tab-bar__label">Inbox</span>
      </NavLink>
      <NavLink
        to="/search"
        className={({ isActive }) =>
          cn('mobile-tab-bar__tab', isActive && 'mobile-tab-bar__tab--active')
        }
        aria-label="Search"
      >
        <Search size={20} strokeWidth={2} />
        <span className="mobile-tab-bar__label">Search</span>
      </NavLink>
      <NavLink
        to="/library/bookmarks"
        className={({ isActive }) =>
          cn('mobile-tab-bar__tab', isActive && 'mobile-tab-bar__tab--active')
        }
        aria-label="Library"
      >
        <BookmarkCheck size={20} strokeWidth={2} />
        <span className="mobile-tab-bar__label">Library</span>
      </NavLink>
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          cn('mobile-tab-bar__tab', isActive && 'mobile-tab-bar__tab--active')
        }
        aria-label="Settings"
      >
        <Settings size={20} strokeWidth={2} />
        <span className="mobile-tab-bar__label">Settings</span>
      </NavLink>
    </nav>
  );
}
