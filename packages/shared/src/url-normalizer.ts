/**
 * URL normalization utilities for bookmark deduplication
 */

export interface NormalizedUrl {
  normalized: string
  original: string
  domain: string
  platform?: string
}

export type SpotifyResource = {
  type: string
  id: string
}

const SPOTIFY_SUPPORTED_TYPES = new Set([
  'track',
  'album',
  'artist',
  'playlist',
  'episode',
  'show'
])

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
    const original = url
    const trimmed = url.trim()

    // Handle spotify:* URIs by converting to canonical web form for normalization
    const spotifyResourceFromUri = parseSpotifyUri(trimmed)
    const urlForParsing = spotifyResourceFromUri
      ? `https://open.spotify.com/${spotifyResourceFromUri.type}/${spotifyResourceFromUri.id}`
      : trimmed

    // Parse the URL
    const parsed = new URL(urlForParsing)
    
    // Force HTTPS where possible (except for localhost)
    if (parsed.protocol === 'http:' && !parsed.hostname.includes('localhost')) {
      parsed.protocol = 'https:'
    }
    
    // Normalize domain
    parsed.hostname = parsed.hostname.toLowerCase()
    if (parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4)
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
    const hostForResource = parsed.hostname.toLowerCase()
    const spotifyResource = spotifyResourceFromUri || (hostForResource.includes('spotify.com') ? deriveSpotifyResourceFromUrl(parsed) : null)

    const platformNormalized = applyPlatformNormalization(parsed, searchParams, {
      spotifyResource
    })
    
    // Ensure trailing slash logic remains intact after platform adjustments
    if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }
    
    // Rebuild the URL
    parsed.search = searchParams.toString()
    parsed.hash = '' // Remove hash fragments
    
    return {
      normalized: parsed.toString(),
      original,
      domain: parsed.hostname,
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
  searchParams: URLSearchParams,
  options?: { spotifyResource?: SpotifyResource | null }
): { platform?: string } {
  const domain = parsed.hostname.toLowerCase()
  
  // YouTube normalization
  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    // Normalize m.youtube.com to youtube.com
    if (domain === 'm.youtube.com') {
      parsed.hostname = 'youtube.com'
    }
    
    if (domain.includes('youtu.be')) {
      // Convert youtu.be to youtube.com
      const videoId = parsed.pathname.slice(1)
      parsed.hostname = 'youtube.com'
      parsed.pathname = '/watch'
      searchParams.set('v', videoId)
    }
    
    // Preserve playlist parameter
    const playlistId = searchParams.get('list')
    
    // Remove YouTube-specific tracking params
    const youtubeParams = ['t', 'start', 'end', 'list', 'index', 'ab_channel']
    youtubeParams.forEach(param => {
      if (param === 't' || param === 'start') {
        // Keep time parameters as they're meaningful
        return
      }
      if (param === 'list' && playlistId) {
        // Keep playlist parameter
        return
      }
      searchParams.delete(param)
    })
    
    return { platform: 'youtube' }
  }
  
  // Spotify normalization
  if (domain.includes('spotify.com') || options?.spotifyResource) {
    parsed.hostname = 'open.spotify.com'

    const resource = options?.spotifyResource ?? deriveSpotifyResourceFromUrl(parsed)

    if (resource) {
      parsed.pathname = `/${resource.type}/${resource.id}`
    }

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
    const twitterParams = ['s', 't', 'ref_src', 'ref_url', 'twgr']
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

function parseSpotifyUri(input: string): SpotifyResource | null {
  if (!input.toLowerCase().startsWith('spotify:')) {
    return null
  }

  const parts = input.split(':').map(part => part.trim()).filter(Boolean)
  if (parts.length < 3) {
    return null
  }

  // Handle user playlist URIs: spotify:user:<userId>:playlist:<playlistId>
  if (parts[1]?.toLowerCase() === 'user' && parts.length >= 5 && parts[3]?.toLowerCase() === 'playlist') {
    const playlistId = extractSpotifyId(parts[4])
    return playlistId ? { type: 'playlist', id: playlistId } : null
  }

  const type = parts[1]?.toLowerCase()
  const idCandidate = parts[2] ?? ''

  if (!SPOTIFY_SUPPORTED_TYPES.has(type)) {
    return null
  }

  const id = extractSpotifyId(idCandidate)
  return id ? { type, id } : null
}

function deriveSpotifyResourceFromUrl(parsed: URL): SpotifyResource | null {
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (!segments.length) {
    return null
  }

  const sanitizedSegments = stripSpotifyPathPrefixes(segments)

  // Handle user playlist paths: /user/:userId/playlist/:playlistId
  if (
    sanitizedSegments.length >= 4 &&
    sanitizedSegments[0]?.toLowerCase() === 'user' &&
    sanitizedSegments[2]?.toLowerCase() === 'playlist'
  ) {
    const playlistId = sanitizedSegments[3]
    return playlistId ? { type: 'playlist', id: playlistId } : null
  }

  const [typeCandidate, idCandidate] = sanitizedSegments
  if (!typeCandidate || !idCandidate) {
    return null
  }

  const type = typeCandidate.toLowerCase()
  if (!SPOTIFY_SUPPORTED_TYPES.has(type)) {
    return null
  }

  return { type, id: idCandidate }
}

function stripSpotifyPathPrefixes(segments: string[]): string[] {
  const result = [...segments]

  while (result.length) {
    const head = result[0]?.toLowerCase()
    if (!head) {
      break
    }

    if (head.startsWith('intl-') || head === 'embed' || head === 'embed-podcast') {
      result.shift()
      continue
    }

    break
  }

  return result
}

function extractSpotifyId(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  const [id] = value.split('?')
  return id || null
}

export function resolveSpotifyResource(input: string): SpotifyResource | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const fromUri = parseSpotifyUri(trimmed)
  if (fromUri) {
    return fromUri
  }

  try {
    const parsed = new URL(trimmed)
    if (!parsed.hostname.toLowerCase().includes('spotify.com')) {
      return null
    }
    return deriveSpotifyResourceFromUrl(parsed)
  } catch {
    return null
  }
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
