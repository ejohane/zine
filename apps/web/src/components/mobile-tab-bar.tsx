import { BookmarkCheck, Settings } from 'lucide-react';
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
        to="/bookmarks"
        className={({ isActive }) =>
          cn('mobile-tab-bar__tab', isActive && 'mobile-tab-bar__tab--active')
        }
        aria-label="Bookmarks"
      >
        <BookmarkCheck size={20} strokeWidth={2} />
        <span className="mobile-tab-bar__label">Bookmarks</span>
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
