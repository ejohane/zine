/**
 * Keyboard shortcuts hook for bookmark saving interface
 */

import { useEffect, useCallback } from 'react'

export interface KeyboardShortcutHandlers {
  onSave?: () => void
  onPreview?: () => void
  onCancel?: () => void
  onFocusUrl?: () => void
  onFocusNotes?: () => void
}

export const useKeyboardShortcuts = (handlers: KeyboardShortcutHandlers) => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in form inputs (except for specific cases)
    const target = event.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
    
    // Cmd/Ctrl + S: Save bookmark
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault()
      handlers.onSave?.()
      return
    }

    // Cmd/Ctrl + Enter: Save bookmark (alternative)
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      handlers.onSave?.()
      return
    }

    // Cmd/Ctrl + P: Preview bookmark
    if ((event.metaKey || event.ctrlKey) && event.key === 'p') {
      event.preventDefault()
      handlers.onPreview?.()
      return
    }

    // Escape: Cancel or unfocus
    if (event.key === 'Escape') {
      if (isInput) {
        // Blur the input field
        target.blur()
      } else {
        // Cancel the form
        handlers.onCancel?.()
      }
      return
    }

    // Only allow these shortcuts when not in an input field
    if (!isInput) {
      // U: Focus URL input
      if (event.key === 'u' || event.key === 'U') {
        event.preventDefault()
        handlers.onFocusUrl?.()
        return
      }

      // N: Focus Notes input
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        handlers.onFocusNotes?.()
        return
      }
    }

    // Tab navigation enhancements
    if (event.key === 'Tab') {
      // Let default tab behavior work, but we could enhance it here if needed
    }
  }, [handlers])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  // Return keyboard shortcut information for help display
  return {
    shortcuts: [
      { key: 'Cmd/Ctrl + S', description: 'Save bookmark' },
      { key: 'Cmd/Ctrl + Enter', description: 'Save bookmark' },
      { key: 'Cmd/Ctrl + P', description: 'Preview bookmark' },
      { key: 'Escape', description: 'Cancel or unfocus' },
      { key: 'U', description: 'Focus URL input' },
      { key: 'N', description: 'Focus notes input' },
    ]
  }
}