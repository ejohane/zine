import { YouTubeAPI } from '../external/youtube-api'

/**
 * Platform-aware handle extraction from subscription URLs
 * Supports YouTube and Spotify platforms
 */

export interface HandleExtractionResult {
  handle?: string
  platform: 'youtube' | 'spotify' | 'unknown'
  requiresApiCall: boolean
}

/**
 * Extract handle from a subscription URL
 * 
 * YouTube:
 * - @username format: Extracts directly from URL
 * - Channel ID format: Returns undefined (requires API call via extractHandleWithApi)
 * 
 * Spotify:
 * - Always returns undefined (Spotify doesn't use handles)
 * 
 * @param url - The subscription URL to parse
 * @returns HandleExtractionResult with handle if found
 */
export function extractHandleFromUrl(url: string): HandleExtractionResult {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    // YouTube handle extraction
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      // Check for @username format in path
      const handleMatch = parsedUrl.pathname.match(/@([a-zA-Z0-9_-]+)/)
      
      if (handleMatch) {
        return {
          handle: `@${handleMatch[1]}`,
          platform: 'youtube',
          requiresApiCall: false
        }
      }

      // Check for /c/customname format (legacy custom URLs)
      const customUrlMatch = parsedUrl.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/)
      if (customUrlMatch) {
        return {
          handle: customUrlMatch[1],
          platform: 'youtube',
          requiresApiCall: false
        }
      }

      // Check for /channel/CHANNELID format - requires API call
      const channelIdMatch = parsedUrl.pathname.match(/\/channel\/([a-zA-Z0-9_-]+)/)
      if (channelIdMatch) {
        return {
          handle: undefined,
          platform: 'youtube',
          requiresApiCall: true
        }
      }

      return {
        handle: undefined,
        platform: 'youtube',
        requiresApiCall: false
      }
    }

    // Spotify - no handles
    if (hostname.includes('spotify.com')) {
      return {
        handle: undefined,
        platform: 'spotify',
        requiresApiCall: false
      }
    }

    return {
      handle: undefined,
      platform: 'unknown',
      requiresApiCall: false
    }
  } catch (error) {
    console.error('Error extracting handle from URL:', error)
    return {
      handle: undefined,
      platform: 'unknown',
      requiresApiCall: false
    }
  }
}

/**
 * Extract handle from subscription URL with API fallback
 * 
 * For YouTube channel IDs, fetches the customUrl from the YouTube API.
 * For Spotify, always returns undefined.
 * 
 * @param url - The subscription URL
 * @param youtubeApi - Optional YouTube API instance for channel ID lookups
 * @returns The handle if found, undefined otherwise
 */
export async function extractHandleFromSubscriptionUrl(
  url: string,
  youtubeApi?: YouTubeAPI
): Promise<string | undefined> {
  const result = extractHandleFromUrl(url)

  // If we already have a handle from URL parsing, return it
  if (result.handle) {
    return result.handle
  }

  // If it's YouTube and requires an API call, try to fetch it
  if (result.platform === 'youtube' && result.requiresApiCall && youtubeApi) {
    try {
      const parsedUrl = new URL(url)
      const channelIdMatch = parsedUrl.pathname.match(/\/channel\/([a-zA-Z0-9_-]+)/)
      
      if (channelIdMatch) {
        const channelId = channelIdMatch[1]
        const channel = await youtubeApi.getChannel(channelId)
        
        // Return customUrl if available (this is the @username format)
        if (channel.snippet.customUrl) {
          // customUrl might include @ or might not
          const customUrl = channel.snippet.customUrl
          return customUrl.startsWith('@') ? customUrl : `@${customUrl}`
        }
      }
    } catch (error) {
      console.error('Error fetching YouTube channel details:', error)
      // Fail gracefully - return undefined if API call fails
    }
  }

  return undefined
}
