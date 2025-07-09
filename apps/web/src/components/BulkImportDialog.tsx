/**
 * Bulk Import Dialog - Import multiple bookmarks at once
 */

import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { saveBookmark } from '../lib/api'
import { validateAndNormalizeUrl } from '../lib/url-validation'
import type { Bookmark, SaveBookmark } from '../lib/api'

interface BulkImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (bookmarks: Bookmark[]) => void
  className?: string
}

interface ImportItem {
  url: string
  notes?: string
  status: 'pending' | 'processing' | 'success' | 'error'
  error?: string
  bookmark?: Bookmark
}

export function BulkImportDialog({ isOpen, onClose, onSuccess, className = '' }: BulkImportDialogProps) {
  const { getToken } = useAuth()
  const [urlsText, setUrlsText] = useState('')
  const [importItems, setImportItems] = useState<ImportItem[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0 })

  const parseUrls = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !line.startsWith('#')) // Allow comments
  }

  const handleStartImport = async () => {
    const urls = parseUrls(urlsText)
    
    if (urls.length === 0) {
      return
    }

    // Validate all URLs first
    const items: ImportItem[] = []
    for (const url of urls) {
      const validation = validateAndNormalizeUrl(url)
      if (validation.isValid && validation.normalized) {
        items.push({
          url: validation.normalized,
          status: 'pending'
        })
      } else {
        items.push({
          url,
          status: 'error',
          error: validation.errors.join(', ') || 'Invalid URL'
        })
      }
    }

    setImportItems(items)
    setImportProgress({ completed: 0, total: items.filter(item => item.status === 'pending').length })
    setIsImporting(true)

    // Process imports with delay to avoid overwhelming the server
    const successfulBookmarks: Bookmark[] = []
    let completed = 0

    for (const item of items) {
      if (item.status !== 'pending') continue

      // Update status to processing
      setImportItems(current => 
        current.map(i => i.url === item.url ? { ...i, status: 'processing' } : i)
      )

      try {
        const saveData: SaveBookmark = {
          url: item.url,
          notes: item.notes
        }

        const token = await getToken()
        const bookmark = await saveBookmark(saveData, token)
        
        // Update to success
        setImportItems(current => 
          current.map(i => i.url === item.url ? { ...i, status: 'success', bookmark } : i)
        )
        
        successfulBookmarks.push(bookmark)
        completed++
        setImportProgress(prev => ({ ...prev, completed }))

      } catch (error) {
        // Update to error
        const errorMessage = error instanceof Error ? error.message : 'Failed to save bookmark'
        setImportItems(current => 
          current.map(i => i.url === item.url ? { ...i, status: 'error', error: errorMessage } : i)
        )
      }

      // Add delay between requests
      if (completed < importProgress.total) {
        await new Promise(resolve => setTimeout(resolve, 500)) // 500ms delay
      }
    }

    setIsImporting(false)
    
    if (successfulBookmarks.length > 0) {
      onSuccess(successfulBookmarks)
    }
  }

  const handleReset = () => {
    setUrlsText('')
    setImportItems([])
    setImportProgress({ completed: 0, total: 0 })
    setIsImporting(false)
  }

  const getStatusIcon = (status: ImportItem['status']) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'processing': return '🔄'
      case 'success': return '✅'
      case 'error': return '❌'
      default: return '❓'
    }
  }

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 ${className}`}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="w-6 h-6">📥</span>
                Bulk Import Bookmarks
              </CardTitle>
              <CardDescription>
                Import multiple bookmarks at once by entering URLs
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 overflow-y-auto">
          {/* URL Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              URLs (one per line)
            </label>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder="https://example.com/article1&#10;https://github.com/user/repo&#10;https://youtube.com/watch?v=abc123&#10;# You can add comments with #"
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              disabled={isImporting}
            />
            <p className="text-xs text-gray-500">
              {parseUrls(urlsText).length} URLs detected
            </p>
          </div>

          {/* Import Progress */}
          {importItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Import Progress</h3>
                {importProgress.total > 0 && (
                  <span className="text-sm text-gray-600">
                    {importProgress.completed} / {importProgress.total}
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              {importProgress.total > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(importProgress.completed / importProgress.total) * 100}%` }}
                  />
                </div>
              )}

              {/* Import Items */}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {importItems.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-3 p-3 border rounded-md"
                  >
                    <span className="text-lg flex-shrink-0">
                      {getStatusIcon(item.status)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {item.bookmark?.title || new URL(item.url).hostname}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {item.url}
                      </div>
                      {item.error && (
                        <div className="text-xs text-red-600 mt-1">
                          {item.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            
            {importItems.length > 0 && !isImporting && (
              <Button variant="outline" onClick={handleReset}>
                Reset
              </Button>
            )}
            
            <Button
              onClick={handleStartImport}
              disabled={parseUrls(urlsText).length === 0 || isImporting}
              className="min-w-24"
            >
              {isImporting ? 'Importing...' : `Import ${parseUrls(urlsText).length} URLs`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}