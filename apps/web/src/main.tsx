import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { ClerkProvider } from '@clerk/clerk-react'
import { createRouter } from './router'
import { ThemeProvider } from '@zine/ui'
import { SetupPage } from './components/SetupPage'
import { registerSW } from 'virtual:pwa-register'
import './App.css'

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})

// Environment-based Clerk key selection
const getClerkPublishableKey = (): string | null => {
  // For production deployment
  if (import.meta.env.PROD && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION) {
    return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION
  }
  
  // Fallback for generic environment variable (commonly used in CI/CD)
  if (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
    return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  }
  
  // For development and preview deployments
  if (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV) {
    return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV
  }
  
  // Debug information in development
  if (import.meta.env.DEV) {
    console.warn("Available environment variables:", {
      PROD: import.meta.env.PROD,
      DEV: import.meta.env.DEV,
      VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION ? "Set" : "Not set",
      VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? "Set" : "Not set", 
      VITE_CLERK_PUBLISHABLE_KEY_DEV: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV ? "Set" : "Not set"
    })
  }
  
  return null
}

const PUBLISHABLE_KEY = getClerkPublishableKey()


const router = createRouter()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system">
      {PUBLISHABLE_KEY ? (
        <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
          <RouterProvider router={router} />
        </ClerkProvider>
      ) : (
        <SetupPage />
      )}
    </ThemeProvider>
  </React.StrictMode>,
)