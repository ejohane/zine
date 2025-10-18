/**
 * Article content extraction service
 * Implements a Readability-like algorithm to extract clean article content
 */

import { parseHTML } from 'linkedom'

// Type definitions for linkedom
type LinkedOMDocument = {
  querySelectorAll: (selector: string) => any[]
  querySelector: (selector: string) => any | null
  documentElement: any
  body: any | null
}

type LinkedOMElement = {
  textContent: string | null
  innerHTML: string
  outerHTML: string
  tagName: string
  className: string
  id: string
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
  querySelector: (selector: string) => any | null
  querySelectorAll: (selector: string) => any[]
  parentElement: any | null
  children: any[]
  remove: () => void
  cloneNode: (deep: boolean) => any
}

export interface ArticleContent {
  html: string
  plainText: string
  excerpt: string
  success: boolean
}

/**
 * Extract clean article content from HTML
 */
export async function extractArticleContent(
  _url: string,
  html: string
): Promise<ArticleContent> {
  try {
    // Parse HTML
    const parsed = parseHTML(html) as any
    const document = parsed.document as LinkedOMDocument

    if (!document.body) {
      return {
        html: '',
        plainText: '',
        excerpt: '',
        success: false
      }
    }

    // Clone the body to avoid modifying original
    const body = document.body.cloneNode(true) as LinkedOMElement

    // Remove unwanted elements
    removeUnwantedElements(body)

    // Find the main content area
    const mainContent = findMainContent(body, document)

    if (!mainContent) {
      return {
        html: '',
        plainText: '',
        excerpt: '',
        success: false
      }
    }

    // Clean the content
    const cleanedContent = cleanContent(mainContent)

    // Extract plain text
    const plainText = extractPlainText(cleanedContent)

    // Generate excerpt (first 200 chars)
    const excerpt = generateExcerpt(plainText)

    // Get cleaned HTML
    const cleanedHtml = cleanedContent.innerHTML || ''

    return {
      html: cleanedHtml,
      plainText,
      excerpt,
      success: true
    }
  } catch (error) {
    console.error('[ArticleContentExtractor] Extraction failed:', error)
    return {
      html: '',
      plainText: '',
      excerpt: '',
      success: false
    }
  }
}

/**
 * Remove unwanted elements from the document
 */
function removeUnwantedElements(body: LinkedOMElement): void {
  const selectorsToRemove = [
    // Scripts and styles
    'script',
    'style',
    'noscript',

    // Navigation and UI
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]',

    // Common class names
    '.nav',
    '.navigation',
    '.navbar',
    '.menu',
    '.sidebar',
    '.header',
    '.footer',
    '.advertisement',
    '.ad',
    '.ads',
    '.social-share',
    '.share-buttons',
    '.comments',
    '.comment',
    '.related-posts',
    '.recommended',
    '.subscribe',
    '.newsletter',
    '.popup',
    '.modal',
    '.cookie-banner',

    // Social media embeds (keep iframe content but remove widgets)
    '.twitter-tweet',
    '.instagram-media',
    '.fb-post',

    // Forms
    'form',

    // Hidden elements
    '[style*="display: none"]',
    '[style*="display:none"]',
    '[hidden]',
    '.hidden',

    // Buttons and CTAs
    'button',
    '.cta',
    '.call-to-action'
  ]

  selectorsToRemove.forEach(selector => {
    try {
      const elements = body.querySelectorAll(selector)
      elements.forEach((el: any) => {
        if (el && el.remove) {
          el.remove()
        }
      })
    } catch (e) {
      // Selector might not be valid, continue
    }
  })
}

/**
 * Find the main content area of the page
 */
function findMainContent(body: LinkedOMElement, document: LinkedOMDocument): LinkedOMElement | null {
  // Try common content selectors in priority order
  const contentSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.content',
    '#content',
    '.story-body',
    '.article-body',
    '.post-body'
  ]

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector) as LinkedOMElement | null
    if (element && hasSignificantContent(element)) {
      return element
    }
  }

  // If no specific content area found, score elements by content density
  return findContentByDensity(body)
}

/**
 * Check if element has significant content
 */
function hasSignificantContent(element: LinkedOMElement): boolean {
  const text = element.textContent || ''
  const wordCount = text.trim().split(/\s+/).length
  return wordCount > 100
}

/**
 * Find content area by analyzing text density
 */
function findContentByDensity(body: LinkedOMElement): LinkedOMElement | null {
  let bestCandidate: LinkedOMElement | null = null
  let bestScore = 0

  const candidates = body.querySelectorAll('div, article, section')

  candidates.forEach((element: any) => {
    const el = element as LinkedOMElement
    const score = scoreElement(el)

    if (score > bestScore) {
      bestScore = score
      bestCandidate = el
    }
  })

  return bestScore > 50 ? bestCandidate : body
}

/**
 * Score an element based on content quality indicators
 */
function scoreElement(element: LinkedOMElement): number {
  let score = 0
  const text = element.textContent || ''
  const className = element.className || ''
  const id = element.id || ''

  // Positive signals
  if (text.length > 500) score += 25
  if (className.match(/article|content|post|entry|story/i)) score += 25
  if (id.match(/article|content|post|entry|story/i)) score += 25

  // Count paragraphs
  const paragraphs = element.querySelectorAll('p')
  score += Math.min(paragraphs.length * 5, 50)

  // Negative signals
  if (className.match(/comment|sidebar|footer|nav|menu/i)) score -= 50
  if (id.match(/comment|sidebar|footer|nav|menu/i)) score -= 50

  // Check link density (too many links = not main content)
  const linkDensity = calculateLinkDensity(element)
  if (linkDensity > 0.5) score -= 25

  return score
}

/**
 * Calculate the ratio of link text to total text
 */
function calculateLinkDensity(element: LinkedOMElement): number {
  const textLength = (element.textContent || '').length
  if (textLength === 0) return 0

  const links = element.querySelectorAll('a')
  let linkTextLength = 0

  links.forEach((link: any) => {
    linkTextLength += (link.textContent || '').length
  })

  return linkTextLength / textLength
}

/**
 * Clean the content element
 */
function cleanContent(element: LinkedOMElement): LinkedOMElement {
  const clone = element.cloneNode(true) as LinkedOMElement

  // Remove empty elements
  removeEmptyElements(clone)

  // Clean attributes
  cleanAttributes(clone)

  return clone
}

/**
 * Remove empty paragraphs and divs
 */
function removeEmptyElements(element: LinkedOMElement): void {
  const emptySelectors = ['p', 'div', 'span', 'section']

  emptySelectors.forEach(tag => {
    const elements = element.querySelectorAll(tag)
    elements.forEach((el: any) => {
      const text = (el.textContent || '').trim()
      if (text.length === 0 && !hasMediaContent(el)) {
        if (el.remove) {
          el.remove()
        }
      }
    })
  })
}

/**
 * Check if element contains images or videos
 */
function hasMediaContent(element: any): boolean {
  if (!element.querySelectorAll) return false

  const images = element.querySelectorAll('img')
  const videos = element.querySelectorAll('video, iframe')

  return images.length > 0 || videos.length > 0
}

/**
 * Clean unnecessary attributes from elements
 */
function cleanAttributes(element: LinkedOMElement): void {
  const allowedAttributes = ['src', 'href', 'alt', 'title']

  const allElements = [element, ...element.querySelectorAll('*')]

  allElements.forEach((el: any) => {
    if (!el.attributes) return

    // Get all attribute names
    const attributes = Array.from(el.attributes || []).map((attr: any) => attr.name)

    attributes.forEach((attr: string) => {
      if (!allowedAttributes.includes(attr) && !attr.startsWith('data-')) {
        try {
          el.removeAttribute(attr)
        } catch (e) {
          // Ignore
        }
      }
    })
  })
}

/**
 * Extract plain text from HTML element
 */
function extractPlainText(element: LinkedOMElement): string {
  const text = element.textContent || ''

  // Normalize whitespace
  return text
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generate excerpt from plain text
 */
function generateExcerpt(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) {
    return text
  }

  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '...'
  }

  return truncated + '...'
}
