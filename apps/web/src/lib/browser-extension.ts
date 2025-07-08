/**
 * Browser extension detection and integration utilities
 */

export interface ExtensionInfo {
  isInstalled: boolean
  version?: string
  canSave: boolean
  features: string[]
}

export interface ExtensionMessage {
  type: 'SAVE_BOOKMARK' | 'GET_CURRENT_TAB' | 'PING'
  data?: any
}

export const detectBrowserExtension = async (): Promise<ExtensionInfo> => {
  const defaultInfo: ExtensionInfo = {
    isInstalled: false,
    canSave: false,
    features: []
  }

  try {
    // Check if the extension is available
    if (typeof window !== 'undefined' && window.chrome?.runtime?.sendMessage) {
      // Try to ping the extension
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(defaultInfo)
        }, 1000) // 1 second timeout

        window.chrome.runtime.sendMessage(
          'zine-extension-id', // This would be the actual extension ID
          { type: 'PING' },
          (response) => {
            clearTimeout(timeout)
            
            if (chrome.runtime.lastError) {
              resolve(defaultInfo)
              return
            }

            if (response?.success) {
              resolve({
                isInstalled: true,
                version: response.version,
                canSave: true,
                features: response.features || ['save-current-tab', 'auto-fill-url']
              })
            } else {
              resolve(defaultInfo)
            }
          }
        )
      })
    }

    // Check for Firefox WebExtension API
    if (typeof window !== 'undefined' && window.browser?.runtime?.sendMessage) {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(defaultInfo)
        }, 1000)

        window.browser.runtime.sendMessage({ type: 'PING' })
          .then((response) => {
            clearTimeout(timeout)
            if (response?.success) {
              resolve({
                isInstalled: true,
                version: response.version,
                canSave: true,
                features: response.features || ['save-current-tab', 'auto-fill-url']
              })
            } else {
              resolve(defaultInfo)
            }
          })
          .catch(() => {
            clearTimeout(timeout)
            resolve(defaultInfo)
          })
      })
    }

    return defaultInfo
  } catch (error) {
    return defaultInfo
  }
}

export const saveCurrentTab = async (): Promise<{ success: boolean; url?: string; title?: string; error?: string }> => {
  try {
    if (typeof window !== 'undefined' && window.chrome?.runtime?.sendMessage) {
      return new Promise((resolve) => {
        window.chrome.runtime.sendMessage(
          'zine-extension-id',
          { type: 'GET_CURRENT_TAB' },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: 'Extension communication failed' })
              return
            }

            if (response?.success) {
              resolve({
                success: true,
                url: response.url,
                title: response.title
              })
            } else {
              resolve({ success: false, error: response?.error || 'Failed to get current tab' })
            }
          }
        )
      })
    }

    return { success: false, error: 'Browser extension API not available' }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export const getBrowserInstallUrl = (): string => {
  const userAgent = navigator.userAgent.toLowerCase()
  
  if (userAgent.includes('chrome') || userAgent.includes('chromium')) {
    return 'https://chrome.google.com/webstore/detail/zine-bookmark-manager/extension-id'
  }
  
  if (userAgent.includes('firefox')) {
    return 'https://addons.mozilla.org/firefox/addon/zine-bookmark-manager/'
  }
  
  if (userAgent.includes('edge')) {
    return 'https://microsoftedge.microsoft.com/addons/detail/zine-bookmark-manager/extension-id'
  }
  
  if (userAgent.includes('safari')) {
    return 'https://apps.apple.com/app/zine-bookmark-manager/id123456789'
  }

  // Default to Chrome Web Store
  return 'https://chrome.google.com/webstore/detail/zine-bookmark-manager/extension-id'
}

export const getBrowserName = (): string => {
  const userAgent = navigator.userAgent.toLowerCase()
  
  if (userAgent.includes('chrome') && !userAgent.includes('edge')) return 'Chrome'
  if (userAgent.includes('firefox')) return 'Firefox'
  if (userAgent.includes('edge')) return 'Edge'
  if (userAgent.includes('safari') && !userAgent.includes('chrome')) return 'Safari'
  if (userAgent.includes('opera')) return 'Opera'
  
  return 'Browser'
}