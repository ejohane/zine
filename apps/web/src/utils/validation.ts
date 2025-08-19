// URL validation utilities

const URL_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i

// List of common file extensions that shouldn't be bookmarked directly
const BLOCKED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.exe', '.dmg', '.pkg', '.deb']

export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url) {
    return { valid: false, error: 'URL is required' }
  }

  // Check for malformed URLs
  if (url.includes(' ') && !url.includes('%20')) {
    return { valid: false, error: 'URL contains spaces. Please check the URL format.' }
  }

  // Check for blocked file extensions
  const lowerUrl = url.toLowerCase()
  for (const ext of BLOCKED_EXTENSIONS) {
    if (lowerUrl.endsWith(ext)) {
      return { valid: false, error: `Direct file links (${ext}) are not supported. Please use the webpage URL instead.` }
    }
  }

  // Basic regex check for URL-like structure
  if (!URL_REGEX.test(url)) {
    return { valid: false, error: 'Please enter a valid URL' }
  }

  // Try to parse as URL
  try {
    const urlObj = new URL(url.includes('://') ? url : `https://${url}`)
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are supported' }
    }

    // Check for localhost and private IPs
    if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname.startsWith('192.168.')) {
      return { valid: false, error: 'Local URLs cannot be bookmarked' }
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