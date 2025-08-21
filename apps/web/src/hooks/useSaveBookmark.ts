import { useState, useEffect, useCallback } from 'react'
import { previewBookmark, saveBookmark as saveBookmarkApi } from '../lib/api'
import { validateAndNormalizeUrl } from '../lib/url-validation'
import { useAuth } from '../lib/auth'
import type { Bookmark, SaveBookmark } from '../lib/api'

export function useSaveBookmark() {
  const { getToken } = useAuth()
  const [preview, setPreview] = useState<Bookmark | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUrl, setLastUrl] = useState<string>('')
  const [previewedUrl, setPreviewedUrl] = useState<string>('')

  // Handle preview with debounce
  useEffect(() => {
    // Skip if we already have a preview for this URL
    if (lastUrl && lastUrl === previewedUrl) {
      return
    }

    const timer = setTimeout(async () => {
      if (!lastUrl) {
        setPreview(null)
        setError(null)
        setPreviewedUrl('')
        return
      }

      const validation = validateAndNormalizeUrl(lastUrl)
      if (!validation.isValid || !validation.normalized) {
        setError('Invalid URL')
        setPreview(null)
        setPreviewedUrl('')
        return
      }

      // Skip if we already previewed this normalized URL
      if (validation.normalized === previewedUrl) {
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const token = await getToken()
        const bookmarkPreview = await previewBookmark(validation.normalized, token)
        setPreview(bookmarkPreview)
        setPreviewedUrl(validation.normalized)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to preview bookmark')
        setPreview(null)
        setPreviewedUrl('')
      } finally {
        setIsLoading(false)
      }
    }, 1000) // Debounce for 1 second

    return () => clearTimeout(timer)
  }, [lastUrl, getToken, previewedUrl])

  const updateUrl = useCallback((url: string) => {
    // If URL is cleared, reset the previewed URL as well
    if (!url) {
      setPreviewedUrl('')
    }
    setLastUrl(url)
  }, [])

  const retry = useCallback(async (url: string) => {
    setPreviewedUrl('') // Reset the previewed URL to force a new preview
    setLastUrl('')
    setTimeout(() => setLastUrl(url), 100)
  }, [])

  const saveBookmark = useCallback(async (url: string): Promise<Bookmark | null> => {
    const validation = validateAndNormalizeUrl(url)
    if (!validation.isValid || !validation.normalized) {
      setError('Invalid URL')
      return null
    }

    setIsSaving(true)
    setError(null)

    try {
      const saveData: SaveBookmark = {
        url: validation.normalized
      }

      const token = await getToken()
      const savedBookmark = await saveBookmarkApi(saveData, token)
      return savedBookmark
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bookmark')
      return null
    } finally {
      setIsSaving(false)
    }
  }, [getToken])

  // Update URL when provided
  useEffect(() => {
    return () => {
      setPreview(null)
      setError(null)
      setIsLoading(false)
      setIsSaving(false)
    }
  }, [])

  return {
    preview,
    isLoading,
    isSaving,
    error,
    saveBookmark,
    updateUrl,
    retry
  }
}