import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { previewBookmark } from '@/lib/api'
import type { Bookmark } from '@zine/shared'

export function useBookmarkPreview(url: string, enabled: boolean = true) {
  const { getToken } = useAuth()

  return useQuery<Bookmark, Error>({
    queryKey: ['bookmark-preview', url],
    queryFn: async ({ signal }) => {
      // Add timeout of 10 seconds
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', () => {})
        throw new Error('Preview request timed out after 10 seconds')
      }, 10000)

      try {
        const token = await getToken()
        const result = await previewBookmark(url, token)
        clearTimeout(timeoutId)
        return result
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    },
    enabled: enabled && !!url && url.length > 5,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 1,
    retryDelay: 1000,
  })
}