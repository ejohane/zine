/**
 * Cross-platform crypto utilities
 * Works in both Node.js and browser environments
 */

let nodeCrypto: typeof import('node:crypto') | null = null

try {
  nodeCrypto = require('node:crypto')
} catch {
  // Running in browser, nodeCrypto will remain null
}

export function sha256HashSync(text: string): string {
  if (!nodeCrypto) {
    throw new Error('sha256HashSync is only available in Node.js environment')
  }
  return nodeCrypto.createHash('sha256').update(text).digest('hex')
}
