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

// Fetch bookmarks
export function useBookmarks(options?: {
  sortBy?: 'date' | 'title' | 'source'
  search?: string
}) {
  return useQuery({
    queryKey: bookmarkKeys.list(options || {}),
    queryFn: async () => {
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