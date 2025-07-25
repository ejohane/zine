/**
 * Save Bookmark Form Component - Phase 4 implementation
 * Features: URL input, metadata preview, validation, enhanced save experience
 */

import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { saveBookmark, previewBookmark } from '../lib/api'
import { validateAndNormalizeUrl, getUrlSuggestions } from '../lib/url-validation'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useAuth } from '../lib/auth'
import type { Bookmark, SaveBookmark } from '../lib/api'
import type { UrlValidationResult } from '../lib/url-validation'

interface SaveBookmarkFormProps {
  initialUrl?: string
  onSuccess?: (bookmark: Bookmark) => void
  onCancel?: () => void
  className?: string
}

interface PreviewState {
  bookmark: Bookmark | null
  isLoading: boolean
  error: string | null
}

export function SaveBookmarkForm({ 
  initialUrl = '', 
  onSuccess, 
  onCancel,
  className = ''
}: SaveBookmarkFormProps) {
  const { getToken } = useAuth()
  const [url, setUrl] = useState(initialUrl)
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<PreviewState>({
    bookmark: null,
    isLoading: false,
    error: null
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [urlValidation, setUrlValidation] = useState<UrlValidationResult | null>(null)
  const [urlSuggestions, setUrlSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  
  // Refs for focusing inputs
  const urlInputRef = useRef<HTMLInputElement>(null)
  const notesInputRef = useRef<HTMLTextAreaElement>(null)

  // URL validation with enhanced features
  useEffect(() => {
    if (url.trim()) {
      const validation = validateAndNormalizeUrl(url)
      setUrlValidation(validation)
      
      // Get suggestions for incomplete URLs
      if (!validation.isValid && url.length > 2) {
        const suggestions = getUrlSuggestions(url)
        setUrlSuggestions(suggestions)
        setShowSuggestions(suggestions.length > 0)
      } else {
        setUrlSuggestions([])
        setShowSuggestions(false)
      }
    } else {
      setUrlValidation(null)
      setUrlSuggestions([])
      setShowSuggestions(false)
    }
  }, [url])

  // Auto-preview when URL changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (urlValidation?.isValid && urlValidation.normalized !== preview.bookmark?.originalUrl) {
        handlePreview()
      }
    }, 1000) // Debounce for 1 second

    return () => clearTimeout(timer)
  }, [urlValidation])

  // Handle metadata preview
  const handlePreview = async () => {
    if (!urlValidation?.isValid || !urlValidation.normalized) {
      setPreview({ bookmark: null, isLoading: false, error: 'Invalid URL' })
      return
    }

    setPreview({ bookmark: null, isLoading: true, error: null })

    try {
      const token = await getToken()
      const bookmarkPreview = await previewBookmark(urlValidation.normalized, token)
      setPreview({ bookmark: bookmarkPreview, isLoading: false, error: null })
    } catch (error) {
      setPreview({ 
        bookmark: null, 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to preview bookmark' 
      })
    }
  }

  // Handle save bookmark
  const handleSave = async () => {
    if (!urlValidation?.isValid || !urlValidation.normalized) {
      setSaveError('Please enter a valid URL')
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const saveData: SaveBookmark = {
        url: urlValidation.normalized,
        notes: notes.trim() || undefined
      }

      const token = await getToken()
      const savedBookmark = await saveBookmark(saveData, token)
      onSuccess?.(savedBookmark)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save bookmark')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle URL suggestion selection
  const handleSuggestionSelect = (suggestion: string) => {
    setUrl(suggestion)
    setShowSuggestions(false)
  }

  // Keyboard shortcuts
  const { shortcuts } = useKeyboardShortcuts({
    onSave: () => {
      if (urlValidation?.isValid && !isSaving) {
        handleSave()
      }
    },
    onPreview: () => {
      if (urlValidation?.isValid && !preview.isLoading) {
        handlePreview()
      }
    },
    onCancel: onCancel,
    onFocusUrl: () => urlInputRef.current?.focus(),
    onFocusNotes: () => notesInputRef.current?.focus()
  })

  // Format duration for video content
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Render content-specific metadata
  const renderContentMetadata = (bookmark: Bookmark) => {
    const components = []

    if (bookmark.videoMetadata?.duration) {
      components.push(
        <div key="video" className="flex items-center gap-2 text-sm text-gray-600">
          <span className="w-4 h-4">📹</span>
          <span>Duration: {formatDuration(bookmark.videoMetadata.duration)}</span>
        </div>
      )
    }

    if (bookmark.podcastMetadata?.episodeTitle) {
      components.push(
        <div key="podcast" className="flex items-center gap-2 text-sm text-gray-600">
          <span className="w-4 h-4">🎧</span>
          <span>{bookmark.podcastMetadata.episodeTitle}</span>
          {bookmark.podcastMetadata.seriesName && (
            <span className="text-gray-500">from {bookmark.podcastMetadata.seriesName}</span>
          )}
        </div>
      )
    }

    if (bookmark.articleMetadata?.wordCount) {
      components.push(
        <div key="article" className="flex items-center gap-2 text-sm text-gray-600">
          <span className="w-4 h-4">📰</span>
          <span>{bookmark.articleMetadata.wordCount} words</span>
          {bookmark.articleMetadata.readingTime && (
            <span className="text-gray-500">({bookmark.articleMetadata.readingTime} min read)</span>
          )}
        </div>
      )
    }

    if (bookmark.postMetadata?.postText) {
      components.push(
        <div key="post" className="flex items-center gap-2 text-sm text-gray-600">
          <span className="w-4 h-4">💬</span>
          <span className="truncate">"{bookmark.postMetadata.postText.substring(0, 80)}..."</span>
        </div>
      )
    }

    return components
  }

  return (
    <div className={`max-w-2xl mx-auto space-y-6 ${className}`}>
      {/* URL Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="w-6 h-6">🔖</span>
            Save Bookmark
          </CardTitle>
          <CardDescription>
            Enter a URL to save it to your bookmark collection with automatic metadata extraction
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL Input */}
          <div className="space-y-2">
            <label htmlFor="url" className="text-sm font-medium">
              URL <span className="text-red-500">*</span>
              {urlValidation?.platform && urlValidation.platform !== 'web' && (
                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {urlValidation.platform}
                </span>
              )}
            </label>
            <div className="relative">
              <input
                ref={urlInputRef}
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onFocus={() => setShowSuggestions(urlSuggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="https://example.com/article"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                  urlValidation?.isValid === false ? 'border-red-500 focus:ring-red-500' :
                  urlValidation?.isValid === true ? 'border-green-500 focus:ring-green-500' :
                  'border-gray-300 focus:ring-blue-500'
                }`}
                autoFocus
              />
              {urlValidation?.isValid && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePreview}
                  disabled={preview.isLoading}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                >
                  {preview.isLoading ? 'Loading...' : 'Preview'}
                </Button>
              )}

              {/* URL Suggestions Dropdown */}
              {showSuggestions && urlSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                  {urlSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none first:rounded-t-md last:rounded-b-md"
                      onMouseDown={() => handleSuggestionSelect(suggestion)}
                    >
                      <div className="text-sm text-blue-600">{suggestion}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Validation Messages */}
            {urlValidation && (
              <div className="space-y-1">
                {/* Errors */}
                {urlValidation.errors.map((error, index) => (
                  <p key={index} className="text-sm text-red-600">❌ {error}</p>
                ))}

                {/* Warnings */}
                {urlValidation.warnings.map((warning, index) => (
                  <p key={index} className="text-sm text-yellow-600">⚠️ {warning}</p>
                ))}

                {/* Suggestions */}
                {urlValidation.suggestions && urlValidation.suggestions.map((suggestion, index) => (
                  <p key={index} className="text-sm text-blue-600">💡 {suggestion}</p>
                ))}

                {/* Success message with normalized URL */}
                {urlValidation.isValid && urlValidation.normalized !== url && (
                  <p className="text-sm text-green-600">
                    ✅ Normalized to: {urlValidation.normalized}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notes Input */}
          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium">
              Notes (optional)
            </label>
            <textarea
              ref={notesInputRef}
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add personal notes about this bookmark..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Metadata Preview Section */}
      {(preview.isLoading || preview.bookmark || preview.error) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preview</CardTitle>
            <CardDescription>
              Extracted metadata from the URL
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview.isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="ml-2">Extracting metadata...</span>
              </div>
            )}

            {preview.error && (
              <div className="text-red-600 py-4">
                <p className="font-medium">Preview failed</p>
                <p className="text-sm">{preview.error}</p>
              </div>
            )}

            {preview.bookmark && (
              <div className="space-y-4">
                {/* Main content preview */}
                <div className="flex gap-3 sm:gap-4">
                  {/* Thumbnail */}
                  {preview.bookmark.thumbnailUrl && (
                    <div className="flex-shrink-0">
                      <img
                        src={preview.bookmark.thumbnailUrl}
                        alt="Thumbnail"
                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-md border"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                        }}
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg line-clamp-2 mb-2">
                      {preview.bookmark.title}
                    </h3>
                    
                    {preview.bookmark.description && (
                      <p className="text-gray-600 text-sm line-clamp-2 sm:line-clamp-3 mb-3">
                        {preview.bookmark.description}
                      </p>
                    )}

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1 sm:gap-2 mb-3">
                      {preview.bookmark.source && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {preview.bookmark.source}
                        </span>
                      )}
                      {preview.bookmark.contentType && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {preview.bookmark.contentType}
                        </span>
                      )}
                      {preview.bookmark.language && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {preview.bookmark.language}
                        </span>
                      )}
                    </div>

                    {/* Creator */}
                    {preview.bookmark.creator && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <span className="w-4 h-4">👤</span>
                        <span>{preview.bookmark.creator.name}</span>
                        {preview.bookmark.creator.handle && (
                          <span className="text-gray-500">{preview.bookmark.creator.handle}</span>
                        )}
                      </div>
                    )}

                    {/* Content-specific metadata */}
                    <div className="space-y-1">
                      {renderContentMetadata(preview.bookmark)}
                    </div>

                    {/* Published date */}
                    {preview.bookmark.publishedAt && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                        <span className="w-4 h-4">📅</span>
                        <span>
                          Published: {new Date(preview.bookmark.publishedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Advanced metadata toggle */}
                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm text-gray-600"
                  >
                    {showAdvanced ? 'Hide' : 'Show'} advanced metadata
                  </Button>

                  {showAdvanced && (
                    <div className="mt-3 text-xs text-gray-500 space-y-1">
                      <div>URL: {preview.bookmark.url}</div>
                      {preview.bookmark.originalUrl !== preview.bookmark.url && (
                        <div>Original: {preview.bookmark.originalUrl}</div>
                      )}
                      {preview.bookmark.faviconUrl && (
                        <div className="flex items-center gap-2">
                          <span>Favicon:</span>
                          <img src={preview.bookmark.faviconUrl} alt="Favicon" className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save Error */}
      {saveError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700">
              <span className="w-5 h-5">⚠️</span>
              <span className="font-medium">Save failed</span>
            </div>
            <p className="text-sm text-red-600 mt-1">{saveError}</p>
          </CardContent>
        </Card>
      )}

      {/* Keyboard Shortcuts Help */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5">⌨️</span>
              <span className="font-medium text-blue-900">Keyboard Shortcuts</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowShortcutsHelp(!showShortcutsHelp)}
              className="text-blue-700 hover:text-blue-900"
            >
              {showShortcutsHelp ? 'Hide' : 'Show'}
            </Button>
          </div>
          
          {showShortcutsHelp && (
            <div className="mt-4 space-y-2 sm:grid sm:grid-cols-1 md:grid-cols-2 sm:gap-3 sm:space-y-0">
              {shortcuts.map((shortcut, index) => (
                <div key={index} className="flex justify-between items-center text-sm gap-2">
                  <span className="text-blue-800 flex-1">{shortcut.description}</span>
                  <code className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono flex-shrink-0">
                    {shortcut.key}
                  </code>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="order-2 sm:order-1">
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSave}
          disabled={!urlValidation?.isValid || isSaving}
          className="min-w-24 order-1 sm:order-2"
        >
          {isSaving ? 'Saving...' : 'Save Bookmark'}
        </Button>
      </div>
    </div>
  )
}