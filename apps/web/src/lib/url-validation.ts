/**
 * URL validation utilities for bookmark saving
 */

export interface UrlValidationResult {
  isValid: boolean
  normalized?: string
  errors: string[]
  warnings: string[]
  suggestions?: string[]
  platform?: string
}

export const validateAndNormalizeUrl = (input: string): UrlValidationResult => {
  const result: UrlValidationResult = {
    isValid: false,
    errors: [],
    warnings: [],
    suggestions: []
  }

  // Trim whitespace
  const trimmed = input.trim()
  
  if (!trimmed) {
    result.errors.push('URL is required')
    return result
  }

  let urlToValidate = trimmed

  // Auto-prepend https:// if no protocol
  if (!urlToValidate.match(/^https?:\/\//i)) {
    if (urlToValidate.includes('.')) {
      urlToValidate = `https://${urlToValidate}`
      result.suggestions?.push(`Added https:// protocol`)
    } else {
      result.errors.push('Invalid URL format')
      return result
    }
  }

  try {
    const url = new URL(urlToValidate)
    
    // Basic URL validation passed
    result.isValid = true
    result.normalized = url.toString()

    // Platform detection
    result.platform = detectPlatform(url.hostname, url.pathname)

    // Domain validation
    if (!isValidDomain(url.hostname)) {
      result.errors.push('Invalid domain name')
      result.isValid = false
      return result
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /localhost(?::\d+)?$/i,
      /127\.0\.0\.1(?::\d+)?$/i,
      /0\.0\.0\.0(?::\d+)?$/i,
      /^\d+\.\d+\.\d+\.\d+(?::\d+)?$/i, // Raw IP addresses
    ]

    if (suspiciousPatterns.some(pattern => pattern.test(url.hostname))) {
      result.warnings.push('This appears to be a local or development URL')
    }

    // Check for common URL shorteners (might want to expand these)
    const shorteners = ['bit.ly', 't.co', 'tinyurl.com', 'short.link', 'ow.ly']
    if (shorteners.includes(url.hostname)) {
      result.warnings.push('This is a shortened URL - the full URL will be saved after expansion')
    }

    // Platform-specific validations
    if (result.platform === 'youtube') {
      if (!url.pathname.includes('/watch') && !url.hostname.includes('youtu.be')) {
        result.warnings.push('This YouTube URL might not be a video link')
      }
    }

    if (result.platform === 'twitter') {
      if (!url.pathname.includes('/status/')) {
        result.warnings.push('This Twitter/X URL might not be a tweet link')
      }
    }

    // Check for fragment-only URLs (e.g., just #section)
    if (url.pathname === '/' && !url.search && url.hash) {
      result.warnings.push('This URL only contains a fragment identifier')
    }

    return result

  } catch (error) {
    result.errors.push('Invalid URL format')
    
    // Provide helpful suggestions for common mistakes
    if (trimmed.includes(' ')) {
      result.suggestions?.push('URLs cannot contain spaces')
    }
    
    if (!trimmed.includes('.')) {
      result.suggestions?.push('URL should include a domain (e.g., example.com)')
    }

    if (trimmed.includes('://') && !trimmed.startsWith('http')) {
      result.suggestions?.push('Use http:// or https:// protocol')
    }

    return result
  }
}

const detectPlatform = (hostname: string, _pathname: string): string => {
  const domain = hostname.toLowerCase()
  
  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    return 'youtube'
  }
  
  if (domain.includes('spotify.com')) {
    return 'spotify'
  }
  
  if (domain.includes('twitter.com') || domain.includes('x.com')) {
    return 'twitter'
  }
  
  if (domain.includes('substack.com')) {
    return 'substack'
  }
  
  if (domain.includes('github.com')) {
    return 'github'
  }
  
  if (domain.includes('linkedin.com')) {
    return 'linkedin'
  }
  
  if (domain.includes('medium.com')) {
    return 'medium'
  }

  return 'web'
}

const isValidDomain = (hostname: string): boolean => {
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  
  if (!domainRegex.test(hostname)) {
    return false
  }

  // Must have at least one dot (except for localhost)
  if (!hostname.includes('.') && hostname !== 'localhost') {
    return false
  }

  // Can't start or end with a dot
  if (hostname.startsWith('.') || hostname.endsWith('.')) {
    return false
  }

  return true
}

export const getUrlSuggestions = (input: string): string[] => {
  const suggestions: string[] = []
  const trimmed = input.trim().toLowerCase()

  if (!trimmed) return suggestions

  // Common domain suggestions
  const commonDomains = [
    'github.com',
    'stackoverflow.com',
    'medium.com',
    'dev.to',
    'youtube.com',
    'twitter.com',
    'linkedin.com',
    'substack.com'
  ]

  // If user typed something that looks like a domain without extension
  if (trimmed.length > 2 && !trimmed.includes('.') && !trimmed.includes('/')) {
    commonDomains.forEach(domain => {
      if (domain.startsWith(trimmed)) {
        suggestions.push(`https://${domain}`)
      }
    })
  }

  // If user typed partial domain
  if (trimmed.includes('.') && !trimmed.includes('://')) {
    suggestions.push(`https://${trimmed}`)
    if (!trimmed.startsWith('www.')) {
      suggestions.push(`https://www.${trimmed}`)
    }
  }

  return suggestions.slice(0, 3) // Limit to 3 suggestions
}