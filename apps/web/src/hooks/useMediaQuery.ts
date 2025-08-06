import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    
    const updateMatches = () => {
      setMatches(media.matches)
    }
    
    updateMatches()
    
    if (media.addEventListener) {
      media.addEventListener('change', updateMatches)
      return () => media.removeEventListener('change', updateMatches)
    } else {
      // Fallback for older browsers
      media.addListener(updateMatches)
      return () => media.removeListener(updateMatches)
    }
  }, [query])

  return matches
}

// Preset breakpoints matching Tailwind's default breakpoints
export const useIsMobile = () => useMediaQuery('(max-width: 639px)')
export const useIsTablet = () => useMediaQuery('(min-width: 640px) and (max-width: 1023px)')
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)')