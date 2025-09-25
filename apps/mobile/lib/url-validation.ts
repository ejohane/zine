/**
 * URL validation and normalization utilities for mobile app
 */

export function validateAndNormalizeUrl(input: string): { isValid: boolean; normalizedUrl: string | null; error?: string } {
  if (!input || input.trim() === '') {
    return { isValid: false, normalizedUrl: null, error: 'URL is required' };
  }

  const trimmedInput = input.trim();
  
  // Check if it's a valid URL pattern (with or without protocol)
  const urlPattern = /^(?:(?:https?|ftp):\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:[\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?$/i;
  
  if (!urlPattern.test(trimmedInput)) {
    return { isValid: false, normalizedUrl: null, error: 'Invalid URL format' };
  }

  // Add https:// if no protocol is specified
  let normalizedUrl = trimmedInput;
  if (!normalizedUrl.match(/^[a-zA-Z]+:\/\//)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    // Validate using URL constructor
    const url = new URL(normalizedUrl);
    
    // Ensure it's http or https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { isValid: false, normalizedUrl: null, error: 'Only HTTP and HTTPS URLs are supported' };
    }
    
    return { isValid: true, normalizedUrl: url.toString() };
  } catch (e) {
    return { isValid: false, normalizedUrl: null, error: 'Invalid URL' };
  }
}

/**
 * Check if a string looks like a URL (more lenient than validation)
 */
export function looksLikeUrl(text: string): boolean {
  if (!text) return false;
  
  const trimmed = text.trim();
  
  // Check for common URL patterns
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return true;
  }
  
  // Check for domain-like patterns
  const domainPattern = /^(?:www\.)?[\w-]+(?:\.[\w-]+)+/i;
  return domainPattern.test(trimmed);
}

/**
 * Extract domain from URL for display
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}