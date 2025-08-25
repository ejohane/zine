import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, BookmarkCreateInput, BookmarkUpdateInput } from '@/lib/api'
import { cacheUtils, StorageKeys } from '@/lib/storage'

// Query keys
export const bookmarkKeys = {
  all: ['bookmarks'] as const,
  lists: () => [...bookmarkKeys.all, 'list'] as const,
  list: (filters: any) => [...bookmarkKeys.lists(), filters] as const,
  details: () => [...bookmarkKeys.all, 'detail'] as const,
  detail: (id: string) => [...bookmarkKeys.details(), id] as const,
}

// Mock data for development
const MOCK_BOOKMARKS = {
  items: [
    {
      id: '1',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: '19 - The Human Edge w. Bethan Winn',
      description: 'A fascinating conversation about the future of human-AI collaboration',
      thumbnailUrl: 'https://picsum.photos/seed/1/400/300',
      contentType: 'podcast' as const,
      source: 'The Good Stuff',
      platform: 'spotify',
      creator: { name: 'The Good Stuff Podcast', url: 'https://thegoodstuff.com' },
      status: 'active' as const,
      tags: ['podcast', 'AI', 'technology'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: '2',
      url: 'https://www.youtube.com/watch?v=example',
      title: 'The Hidden Art Of Reinventing Yourself - Matthew McConaughey',
      description: 'Matthew McConaughey shares insights on personal transformation',
      thumbnailUrl: 'https://picsum.photos/seed/2/400/300',
      contentType: 'video' as const,
      source: 'YouTube',
      platform: 'youtube',
      creator: { name: 'Change Your Reality', url: 'https://youtube.com' },
      videoMetadata: { duration: 3600 },
      status: 'active' as const,
      tags: ['video', 'self-improvement'],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: '3',
      url: 'https://medium.com/article',
      title: 'How to Build Better Mobile Apps with React Native',
      description: 'Best practices and patterns for React Native development',
      thumbnailUrl: 'https://picsum.photos/seed/3/400/300',
      contentType: 'article' as const,
      source: 'Dev.to',
      platform: 'medium',
      articleMetadata: { readingTime: 8 },
      status: 'active' as const,
      tags: ['React Native', 'Mobile', 'Tutorial'],
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: '4',
      url: 'https://spotify.com/podcast',
      title: 'The Future of AI in Software Development',
      description: 'Exploring how AI is changing the landscape of software engineering',
      thumbnailUrl: 'https://picsum.photos/seed/4/400/300',
      contentType: 'article' as const,
      source: 'Medium',
      platform: 'medium',
      articleMetadata: { readingTime: 12 },
      status: 'active' as const,
      tags: ['AI', 'Future', 'Development'],
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      updatedAt: new Date(Date.now() - 259200000).toISOString(),
    },
    {
      id: '5',
      url: 'https://spotify.com/show/design',
      title: 'Design Systems at Scale',
      description: 'Building and maintaining design systems for large organizations',
      thumbnailUrl: 'https://picsum.photos/seed/5/400/300',
      contentType: 'podcast' as const,
      source: 'Spotify',
      platform: 'spotify',
      creator: { name: 'Design Better', url: 'https://spotify.com' },
      status: 'active' as const,
      tags: ['Design', 'Scale', 'Systems'],
      createdAt: new Date(Date.now() - 345600000).toISOString(),
      updatedAt: new Date(Date.now() - 345600000).toISOString(),
    },
  ],
  total: 5,
}

// Fetch bookmarks
export function useBookmarks(options?: {
  sortBy?: 'date' | 'title' | 'source'
  search?: string
}) {
  return useQuery({
    queryKey: bookmarkKeys.list(options || {}),
    queryFn: async () => {
      // TEMPORARY: Return mock data for development
      const USE_MOCK_DATA = true;
      
      if (USE_MOCK_DATA) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return MOCK_BOOKMARKS;
      }
      
      // Try to get from cache first
      const cached = await cacheUtils.getWithExpiry(
        StorageKeys.BOOKMARKS_CACHE,
        1000 * 60 * 5 // 5 minutes
      )
      
      if (cached) {
        return cached
      }
      
      // Fetch from API
      const data = await api.bookmarks.getAll()
      
      // Save to cache
      await cacheUtils.saveWithTimestamp(StorageKeys.BOOKMARKS_CACHE, data)
      
      return data
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Fetch single bookmark
export function useBookmark(id: string) {
  return useQuery({
    queryKey: bookmarkKeys.detail(id),
    queryFn: () => api.bookmarks.getById(id),
    enabled: !!id,
  })
}

// Create bookmark mutation
export function useCreateBookmark() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: BookmarkCreateInput) => api.bookmarks.create(data),
    onSuccess: async () => {
      // Invalidate and refetch bookmarks
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() })
      // Clear cache
      await cacheUtils.clearCache()
    },
    onError: (error) => {
      console.error('Error creating bookmark:', error)
      // Could add offline queue here
    },
  })
}

// Update bookmark mutation
export function useUpdateBookmark(id: string) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: BookmarkUpdateInput) => api.bookmarks.update(id, data),
    onSuccess: async () => {
      // Invalidate specific bookmark and list
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() })
      // Clear cache
      await cacheUtils.clearCache()
    },
    onError: (error) => {
      console.error('Error updating bookmark:', error)
    },
  })
}

// Delete bookmark mutation
export function useDeleteBookmark() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => api.bookmarks.delete(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: bookmarkKeys.lists() })
      
      // Snapshot previous value
      const previousBookmarks = queryClient.getQueryData(bookmarkKeys.lists())
      
      // Optimistically update
      queryClient.setQueryData(bookmarkKeys.lists(), (old: any) => {
        if (!old) return old
        return {
          ...old,
          items: old.items?.filter((item: any) => item.id !== id) || [],
        }
      })
      
      return { previousBookmarks }
    },
    onError: (err, _id, context) => {
      // Rollback on error
      if (context?.previousBookmarks) {
        queryClient.setQueryData(bookmarkKeys.lists(), context.previousBookmarks)
      }
      console.error('Error deleting bookmark:', err)
    },
    onSettled: async () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() })
      // Clear cache
      await cacheUtils.clearCache()
    },
  })
}

// Save bookmark mutation (for quick save from feed items)
export function useSaveBookmark() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (url: string) => {
      // Extract metadata first (you might want to do this client-side)
      const response = await fetch(url)
      const html = await response.text()
      
      // Basic metadata extraction (enhance this)
      const titleMatch = html.match(/<title>(.*?)<\/title>/i)
      const title = titleMatch ? titleMatch[1] : url
      
      return api.bookmarks.create({
        url,
        title,
        description: '',
      })
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() })
      await cacheUtils.clearCache()
    },
    onError: (error) => {
      console.error('Error saving bookmark:', error)
    },
  })
}