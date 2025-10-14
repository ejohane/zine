/**
 * Cross-platform crypto utilities
 * Works in both Node.js and browser environments
 */

type NodeCrypto = {
  createHash: (algorithm: string) => {
    update: (data: string) => {
      digest: (encoding: string) => string
    }
  }
}

let nodeCrypto: NodeCrypto | null = null

try {
  // Use eval to prevent TypeScript from seeing 'require' at compile time
  // This allows the code to work in both Node.js and browser environments
  // eslint-disable-next-line no-eval
  nodeCrypto = eval("require('node:crypto')")
} catch {
  // Running in browser, nodeCrypto will remain null
}

export function sha256HashSync(text: string): string {
  if (!nodeCrypto) {
    throw new Error('sha256HashSync is only available in Node.js environment')
  }
  return nodeCrypto.createHash('sha256').update(text).digest('hex')
}
