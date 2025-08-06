import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

interface PageWrapperProps {
  children: ReactNode
  className?: string
}

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut' as const
    }
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: {
      duration: 0.2,
      ease: 'easeIn' as const
    }
  }
}

export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <motion.div
      className={cn(
        'min-h-screen bg-background safe-top',
        'pb-20 md:pt-16 md:pb-0', // Account for fixed nav (top on desktop, bottom on mobile)
        className
      )}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
    >
      <main id="main-content" className="container mx-auto px-4 py-4 md:py-8">
        {children}
      </main>
    </motion.div>
  )
}