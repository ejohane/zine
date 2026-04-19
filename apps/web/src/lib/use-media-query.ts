import { useEffect, useState } from 'react';

function getMatches(query: string) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(query)?.matches ?? false;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => getMatches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setMatches(false);
      return;
    }

    const mediaQueryList = window.matchMedia(query);
    if (!mediaQueryList) {
      setMatches(false);
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    setMatches(mediaQueryList.matches);
    mediaQueryList.addEventListener?.('change', handleChange);
    mediaQueryList.addListener?.(handleChange);

    return () => {
      mediaQueryList.removeEventListener?.('change', handleChange);
      mediaQueryList.removeListener?.(handleChange);
    };
  }, [query]);

  return matches;
}
