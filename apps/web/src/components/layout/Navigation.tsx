import { useEffect, useState } from 'react'
import { DesktopNav } from './DesktopNav'
import { MobileNav } from './MobileNav'

export function Navigation() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)

    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  return isMobile ? <MobileNav /> : <DesktopNav />
}