/**
 * Browser Extension Detection and Install Banner
 */

import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { detectBrowserExtension, getBrowserInstallUrl, getBrowserName, saveCurrentTab } from '../lib/browser-extension'
import type { ExtensionInfo } from '../lib/browser-extension'

interface BrowserExtensionBannerProps {
  onUrlFromExtension?: (url: string, title?: string) => void
  className?: string
}

export function BrowserExtensionBanner({ onUrlFromExtension, className = '' }: BrowserExtensionBannerProps) {
  const [extensionInfo, setExtensionInfo] = useState<ExtensionInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isGettingCurrentTab, setIsGettingCurrentTab] = useState(false)

  useEffect(() => {
    // Check if banner was previously dismissed
    const dismissed = localStorage.getItem('zine-extension-banner-dismissed')
    if (dismissed === 'true') {
      setIsDismissed(true)
    }

    // Detect extension
    detectBrowserExtension()
      .then(info => {
        setExtensionInfo(info)
        setIsLoading(false)
      })
      .catch(() => {
        setExtensionInfo({
          isInstalled: false,
          canSave: false,
          features: []
        })
        setIsLoading(false)
      })
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('zine-extension-banner-dismissed', 'true')
  }

  const handleGetCurrentTab = async () => {
    setIsGettingCurrentTab(true)
    try {
      const result = await saveCurrentTab()
      if (result.success && result.url) {
        onUrlFromExtension?.(result.url, result.title)
      }
    } catch (error) {
      console.error('Failed to get current tab:', error)
    } finally {
      setIsGettingCurrentTab(false)
    }
  }

  const handleInstallExtension = () => {
    const installUrl = getBrowserInstallUrl()
    window.open(installUrl, '_blank', 'noopener,noreferrer')
  }

  if (isLoading || isDismissed) {
    return null
  }

  // Show install banner if extension is not installed
  if (!extensionInfo?.isInstalled) {
    return (
      <Card className={`border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 text-lg">🧩</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-blue-900 mb-1">
                  Get the Zine Browser Extension
                </h3>
                <p className="text-sm text-blue-700 mb-3">
                  Save bookmarks from any webpage with one click. Works on {getBrowserName()} and other browsers.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleInstallExtension}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Install Extension
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDismiss}
                    className="text-blue-700 border-blue-300"
                  >
                    Maybe Later
                  </Button>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-blue-600 hover:text-blue-800 flex-shrink-0"
            >
              ✕
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Show extension controls if installed
  return (
    <Card className={`border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600 text-lg">✅</span>
            </div>
            <div>
              <h3 className="font-semibold text-green-900">
                Extension Connected
              </h3>
              <p className="text-sm text-green-700">
                {extensionInfo.version && `v${extensionInfo.version} • `}
                Save from any webpage
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleGetCurrentTab}
            disabled={isGettingCurrentTab}
            className="bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
          >
            {isGettingCurrentTab ? 'Getting...' : 'Save Current Tab'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}