import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { saveBookmark } from '@/lib/api'
import type { SaveBookmark, Bookmark } from '@zine/shared'
import { toast } from 'sonner'

export function useCreateBookmark() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  return useMutation<Bookmark, Error, SaveBookmark>({
    mutationFn: async (bookmarkData) => {
      const token = await getToken()
      return saveBookmark(bookmarkData, token)
    },
    onSuccess: (data) => {
      // Invalidate and refetch bookmarks list
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      
      // Show success toast
      toast.success('Bookmark saved successfully', {
        description: data.title,
      })
    },
    onError: (error) => {
      // Check if it's a duplicate error
      if (error.message.includes('already exists')) {
        toast.error('Bookmark already exists', {
          description: error.message.replace('Bookmark already exists: ', ''),
        })
      } else {
        toast.error('Failed to save bookmark', {
          description: error.message,
        })
      }
    },
  })
}