// URL validation utilities

// List of common file extensions that shouldn't be bookmarked directly
const BLOCKED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.exe', '.dmg', '.pkg', '.deb']

export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url) {
    return { valid: false, error: 'URL is required' }
  }

  // Trim whitespace
  const trimmedUrl = url.trim()

  // Check for malformed URLs with unencoded spaces
  if (trimmedUrl.includes(' ')) {
    return { valid: false, error: 'URL contains spaces. Please check the URL format.' }
  }

  // Check for blocked file extensions (but check the pathname, not the full URL with query params)
  try {
    const testUrl = trimmedUrl.includes('://') ? trimmedUrl : `https://${trimmedUrl}`
    const urlObj = new URL(testUrl)
    const pathname = urlObj.pathname.toLowerCase()
    
    for (const ext of BLOCKED_EXTENSIONS) {
      if (pathname.endsWith(ext)) {
        return { valid: false, error: `Direct file links (${ext}) are not supported. Please use the webpage URL instead.` }
      }
    }
  } catch {
    // Will validate properly below
  }

  // Try to parse as URL - this is the main validation
  try {
    const urlObj = new URL(trimmedUrl.includes('://') ? trimmedUrl : `https://${trimmedUrl}`)
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are supported' }
    }

    // Check for localhost and private IPs
    if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname.startsWith('192.168.')) {
      return { valid: false, error: 'Local URLs cannot be bookmarked' }
    }

    // Must have a valid hostname
    if (!urlObj.hostname || !urlObj.hostname.includes('.')) {
      return { valid: false, error: 'Please enter a valid URL' }
    }

    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

export function normalizeUrl(url: string): string {
  // Add https:// if no protocol is specified
  if (!url.includes('://')) {
    return `https://${url}`
  }
  return url
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return ''
  }
}