/**
 * URL normalization utilities for bookmark deduplication
 */

export interface NormalizedUrl {
  normalized: string
  original: string
  domain: string
  platform?: string
}

// Tracking parameters to remove
const TRACKING_PARAMS = [
  // UTM parameters
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  // Social media tracking
  'fbclid', 'gclid', 'igshid', 'twclid',
  // Analytics
  'ref', 'source', '_ga', '_gid',
  // Other common tracking
  'si', 'feature', 'context', 'app'
]

/**
 * Normalizes a URL for deduplication purposes
 */
export function normalizeUrl(url: string): NormalizedUrl {
  try {
    // Parse the URL
    const parsed = new URL(url.trim())
    
    // Force HTTPS where possible (except for localhost)
    if (parsed.protocol === 'http:' && !parsed.hostname.includes('localhost')) {
      parsed.protocol = 'https:'
    }
    
    // Normalize domain
    let domain = parsed.hostname.toLowerCase()
    if (domain.startsWith('www.')) {
      domain = domain.slice(4)
      parsed.hostname = domain
    }
    
    // Remove trailing slash from pathname
    if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }
    
    // Remove tracking parameters
    const searchParams = new URLSearchParams(parsed.search)
    TRACKING_PARAMS.forEach(param => {
      searchParams.delete(param)
    })
    
    // Apply platform-specific normalization
    const platformNormalized = applyPlatformNormalization(parsed, searchParams)
    
    // Rebuild the URL
    parsed.search = searchParams.toString()
    parsed.hash = '' // Remove hash fragments
    
    return {
      normalized: parsed.toString(),
      original: url,
      domain,
      platform: platformNormalized.platform
    }
  } catch (error) {
    // If URL parsing fails, return original
    return {
      normalized: url,
      original: url,
      domain: '',
      platform: undefined
    }
  }
}

/**
 * Apply platform-specific URL normalization
 */
function applyPlatformNormalization(
  parsed: URL, 
  searchParams: URLSearchParams
): { platform?: string } {
  const domain = parsed.hostname.toLowerCase()
  
  // YouTube normalization
  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    if (domain.includes('youtu.be')) {
      // Convert youtu.be to youtube.com
      const videoId = parsed.pathname.slice(1)
      parsed.hostname = 'youtube.com'
      parsed.pathname = '/watch'
      searchParams.set('v', videoId)
    }
    
    // Remove YouTube-specific tracking params
    const youtubeParams = ['t', 'start', 'end', 'list', 'index', 'ab_channel']
    youtubeParams.forEach(param => {
      if (param === 't' || param === 'start') {
        // Keep time parameters as they're meaningful
        return
      }
      searchParams.delete(param)
    })
    
    return { platform: 'youtube' }
  }
  
  // Spotify normalization
  if (domain.includes('spotify.com')) {
    // Remove Spotify-specific tracking
    const spotifyParams = ['highlight', 'context', 'go', 'nd']
    spotifyParams.forEach(param => {
      searchParams.delete(param)
    })
    
    return { platform: 'spotify' }
  }
  
  // Twitter/X normalization
  if (domain.includes('twitter.com') || domain.includes('x.com')) {
    // Normalize to x.com
    parsed.hostname = 'x.com'
    
    // Remove Twitter-specific tracking
    const twitterParams = ['s', 'ref_src', 'ref_url', 'twgr']
    twitterParams.forEach(param => {
      searchParams.delete(param)
    })
    
    return { platform: 'x' }
  }
  
  // Substack normalization
  if (domain.includes('substack.com')) {
    // Remove Substack-specific tracking
    const substackParams = ['r', 'utm_source', 'utm_medium']
    substackParams.forEach(param => {
      searchParams.delete(param)
    })
    
    return { platform: 'substack' }
  }
  
  return { platform: 'web' }
}

/**
 * Check if two URLs are likely duplicates
 */
export function areUrlsDuplicates(url1: string, url2: string): boolean {
  const normalized1 = normalizeUrl(url1)
  const normalized2 = normalizeUrl(url2)
  
  return normalized1.normalized === normalized2.normalized
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url)
    let domain = parsed.hostname.toLowerCase()
    if (domain.startsWith('www.')) {
      domain = domain.slice(4)
    }
    return domain
  } catch {
    return ''
  }
}

/**
 * Detect the platform/source from a URL
 */
export function detectPlatform(url: string): string {
  const normalized = normalizeUrl(url)
  return normalized.platform || 'web'
}

/**
 * Check if URL is valid and reachable
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}