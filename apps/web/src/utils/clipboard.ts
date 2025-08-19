export async function readClipboard(): Promise<string | null> {
  try {
    // Check if clipboard API is available
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      return null
    }

    // Try to read the clipboard
    const text = await navigator.clipboard.readText()
    return text.trim()
  } catch (error) {
    // Permission denied or other error
    console.warn('Failed to read clipboard:', error)
    return null
  }
}

export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    // Check for valid protocols
    return ['http:', 'https:'].includes(urlObj.protocol)
  } catch {
    return false
  }
}

export async function getClipboardUrlIfValid(): Promise<string | null> {
  const text = await readClipboard()
  if (!text) return null
  
  // Check if the text looks like a URL
  if (isValidUrl(text)) {
    return text
  }
  
  // Also check if adding https:// makes it valid
  if (!text.includes('://') && isValidUrl(`https://${text}`)) {
    return `https://${text}`
  }
  
  return null
}