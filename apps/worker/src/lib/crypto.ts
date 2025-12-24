/**
 * Encryption utilities for secure OAuth token storage
 *
 * Uses AES-256-GCM for authenticated encryption:
 * - AES-256: Industry standard, 256-bit key provides excellent security
 * - GCM mode: Provides confidentiality AND integrity (authenticated encryption)
 * - Web Crypto API: Available in Cloudflare Workers, no external dependencies
 */

/**
 * Error codes for crypto operations
 */
export type CryptoErrorCode =
  | 'INVALID_FORMAT'
  | 'INVALID_KEY'
  | 'DECRYPTION_FAILED'
  | 'KEY_VERSION_NOT_FOUND';

/**
 * Versioned encryption key configuration
 */
export interface VersionedKey {
  version: number;
  keyHex: string;
}

/**
 * Multi-key configuration for encryption key rotation
 */
export interface EncryptionKeys {
  current: VersionedKey;
  previous?: VersionedKey;
}

/**
 * Custom error class for crypto operations
 */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

/**
 * Convert a Uint8Array to a hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a hex string to a Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new CryptoError('INVALID_FORMAT', 'Hex string must have even length');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new CryptoError('INVALID_FORMAT', 'Invalid hex character');
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

/**
 * Import a hex-encoded key for AES-256-GCM
 */
async function importKey(keyHex: string): Promise<CryptoKey> {
  if (keyHex.length !== 64) {
    throw new CryptoError('INVALID_KEY', 'Key must be 64 hex characters (256 bits)');
  }

  const keyBytes = hexToBytes(keyHex);

  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string using AES-256-GCM
 *
 * Returns format: {iv}:{ciphertext} (both hex-encoded)
 *
 * The ciphertext includes the GCM authentication tag (16 bytes),
 * which provides integrity verification during decryption.
 *
 * @param plaintext - The string to encrypt
 * @param keyHex - A 64-character hex string (256-bit key)
 * @returns Encrypted string in format "iv:ciphertext"
 *
 * @example
 * ```typescript
 * const encrypted = await encrypt('my-secret-token', env.ENCRYPTION_KEY);
 * // Returns: "a1b2c3d4e5f6...:f8e7d6c5b4a3..."
 * ```
 */
export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);

  // 96-bit (12-byte) IV is recommended for GCM
  // MUST be unique for each encryption with the same key
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypt a string encrypted with encrypt()
 *
 * Throws on invalid format, wrong key, or tampering.
 * GCM mode automatically verifies the authentication tag,
 * ensuring the data hasn't been modified.
 *
 * @param encrypted - The encrypted string in format "iv:ciphertext"
 * @param keyHex - A 64-character hex string (256-bit key)
 * @returns The decrypted plaintext string
 * @throws {CryptoError} On invalid format, wrong key, or data tampering
 *
 * @example
 * ```typescript
 * const decrypted = await decrypt(encrypted, env.ENCRYPTION_KEY);
 * // Returns: "my-secret-token"
 * ```
 */
export async function decrypt(encrypted: string, keyHex: string): Promise<string> {
  const parts = encrypted.split(':');

  if (parts.length !== 2) {
    throw new CryptoError('INVALID_FORMAT', 'Encrypted data must be in format "iv:ciphertext"');
  }

  const [ivHex, ciphertextHex] = parts;

  if (!ivHex || !ciphertextHex) {
    throw new CryptoError('INVALID_FORMAT', 'Encrypted data has invalid format');
  }

  // IV should be 12 bytes (24 hex chars) for GCM
  if (ivHex.length !== 24) {
    throw new CryptoError('INVALID_FORMAT', 'Invalid IV length');
  }

  const key = await importKey(keyHex);

  let iv: Uint8Array;
  let ciphertext: Uint8Array;

  try {
    iv = hexToBytes(ivHex);
    ciphertext = hexToBytes(ciphertextHex);
  } catch (e) {
    if (e instanceof CryptoError) {
      throw e;
    }
    throw new CryptoError('INVALID_FORMAT', 'Failed to decode encrypted data');
  }

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // GCM decryption fails if:
    // - The key is wrong
    // - The data has been tampered with (auth tag mismatch)
    // - The IV is wrong
    throw new CryptoError('DECRYPTION_FAILED', 'Failed to decrypt - wrong key or corrupted data');
  }
}

/**
 * Generate a random 256-bit encryption key
 *
 * Use this to generate a new ENCRYPTION_KEY for your environment.
 * Store the result securely (e.g., in Cloudflare Workers secrets).
 *
 * @returns A 64-character hex string suitable for use with encrypt/decrypt
 *
 * @example
 * ```typescript
 * const key = generateKey();
 * // Store this in your wrangler.toml secrets or environment
 * console.log(key); // e.g., "a1b2c3d4e5f6..."
 * ```
 */
export function generateKey(): string {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(keyBytes);
}

// ============================================================================
// Versioned Encryption Support
// ============================================================================
// These functions support encryption key rotation with zero downtime.
//
// Ciphertext formats:
// - Legacy:    {iv}:{ciphertext}
// - Versioned: v{version}:{iv}:{ciphertext}
//
// Migration strategy:
// 1. Deploy new key (current) alongside old key (previous)
// 2. Run migration job to re-encrypt all tokens with new key
// 3. Verify migration complete
// 4. Remove old key after grace period
// ============================================================================

/**
 * Get encryption keys from environment variables
 *
 * Reads the current and optional previous encryption keys from env.
 * Uses a simple versioning scheme based on env variable naming.
 *
 * @param env - Environment object containing encryption key secrets
 * @returns EncryptionKeys configuration
 * @throws {CryptoError} If ENCRYPTION_KEY is missing
 *
 * @example
 * ```typescript
 * const keys = getEncryptionKeys(env);
 * const encrypted = await encryptWithVersion('secret', keys);
 * ```
 */
export function getEncryptionKeys(env: {
  ENCRYPTION_KEY: string;
  ENCRYPTION_KEY_VERSION?: number;
  ENCRYPTION_KEY_PREVIOUS?: string;
  ENCRYPTION_KEY_VERSION_PREVIOUS?: number;
}): EncryptionKeys {
  if (!env.ENCRYPTION_KEY) {
    throw new CryptoError('INVALID_KEY', 'ENCRYPTION_KEY environment variable is required');
  }

  const keys: EncryptionKeys = {
    current: {
      version: env.ENCRYPTION_KEY_VERSION ?? 1,
      keyHex: env.ENCRYPTION_KEY,
    },
  };

  // Add previous key if available for decryption of old data
  if (env.ENCRYPTION_KEY_PREVIOUS) {
    keys.previous = {
      version: env.ENCRYPTION_KEY_VERSION_PREVIOUS ?? 0,
      keyHex: env.ENCRYPTION_KEY_PREVIOUS,
    };
  }

  return keys;
}

/**
 * Encrypt a string using AES-256-GCM with version prefix
 *
 * Returns format: v{version}:{iv}:{ciphertext} (version as decimal, rest hex-encoded)
 *
 * The ciphertext includes the GCM authentication tag (16 bytes),
 * which provides integrity verification during decryption.
 *
 * @param plaintext - The string to encrypt
 * @param keys - Versioned encryption keys (uses current key)
 * @returns Encrypted string in format "v{version}:iv:ciphertext"
 *
 * @example
 * ```typescript
 * const keys = getEncryptionKeys(env);
 * const encrypted = await encryptWithVersion('my-secret-token', keys);
 * // Returns: "v1:a1b2c3d4e5f6...:f8e7d6c5b4a3..."
 * ```
 */
export async function encryptWithVersion(plaintext: string, keys: EncryptionKeys): Promise<string> {
  const { version, keyHex } = keys.current;
  const key = await importKey(keyHex);

  // 96-bit (12-byte) IV is recommended for GCM
  // MUST be unique for each encryption with the same key
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return `v${version}:${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

/**
 * Parse versioned ciphertext format
 *
 * @param encrypted - Encrypted string (legacy or versioned format)
 * @returns Parsed components { version: number | null, ivHex, ciphertextHex }
 */
function parseVersionedFormat(encrypted: string): {
  version: number | null;
  ivHex: string;
  ciphertextHex: string;
} {
  const parts = encrypted.split(':');

  // Check for versioned format: v{version}:{iv}:{ciphertext}
  if (parts.length === 3 && parts[0]?.startsWith('v')) {
    const versionStr = parts[0].slice(1); // Remove 'v' prefix
    const version = parseInt(versionStr, 10);

    if (isNaN(version)) {
      throw new CryptoError('INVALID_FORMAT', `Invalid version number: ${versionStr}`);
    }

    return {
      version,
      ivHex: parts[1]!,
      ciphertextHex: parts[2]!,
    };
  }

  // Legacy format: {iv}:{ciphertext} (no version prefix)
  if (parts.length === 2) {
    return {
      version: null, // Indicates legacy format
      ivHex: parts[0]!,
      ciphertextHex: parts[1]!,
    };
  }

  throw new CryptoError(
    'INVALID_FORMAT',
    'Encrypted data must be in format "v{version}:iv:ciphertext" or "iv:ciphertext"'
  );
}

/**
 * Decrypt a versioned or legacy encrypted string
 *
 * Handles both formats:
 * - Legacy: {iv}:{ciphertext} - tries current key, then previous
 * - Versioned: v{version}:{iv}:{ciphertext} - uses key matching version
 *
 * Throws on invalid format, unknown version, or decryption failure.
 * GCM mode automatically verifies the authentication tag.
 *
 * @param encrypted - The encrypted string (versioned or legacy format)
 * @param keys - Versioned encryption keys
 * @returns The decrypted plaintext string
 * @throws {CryptoError} On invalid format, unknown version, or data corruption
 *
 * @example
 * ```typescript
 * const keys = getEncryptionKeys(env);
 * const decrypted = await decryptWithVersion(encrypted, keys);
 * // Returns: "my-secret-token"
 * ```
 */
export async function decryptWithVersion(encrypted: string, keys: EncryptionKeys): Promise<string> {
  const parsed = parseVersionedFormat(encrypted);

  // Determine which key to use
  let keyHex: string;

  if (parsed.version === null) {
    // Legacy format: try current key first, then previous
    // This handles data encrypted before key versioning was implemented
    try {
      return await decryptWithKey(parsed.ivHex, parsed.ciphertextHex, keys.current.keyHex);
    } catch (e) {
      if (keys.previous) {
        try {
          return await decryptWithKey(parsed.ivHex, parsed.ciphertextHex, keys.previous.keyHex);
        } catch {
          // Fall through to throw original error
        }
      }
      throw e;
    }
  }

  // Versioned format: find matching key
  if (parsed.version === keys.current.version) {
    keyHex = keys.current.keyHex;
  } else if (keys.previous && parsed.version === keys.previous.version) {
    keyHex = keys.previous.keyHex;
  } else {
    throw new CryptoError(
      'KEY_VERSION_NOT_FOUND',
      `No key found for version ${parsed.version}. Available versions: ${keys.current.version}${keys.previous ? `, ${keys.previous.version}` : ''}`
    );
  }

  return decryptWithKey(parsed.ivHex, parsed.ciphertextHex, keyHex);
}

/**
 * Internal helper to decrypt with a specific key
 */
async function decryptWithKey(
  ivHex: string,
  ciphertextHex: string,
  keyHex: string
): Promise<string> {
  if (!ivHex || !ciphertextHex) {
    throw new CryptoError('INVALID_FORMAT', 'Encrypted data has invalid format');
  }

  // IV should be 12 bytes (24 hex chars) for GCM
  if (ivHex.length !== 24) {
    throw new CryptoError('INVALID_FORMAT', 'Invalid IV length');
  }

  const key = await importKey(keyHex);

  let iv: Uint8Array;
  let ciphertext: Uint8Array;

  try {
    iv = hexToBytes(ivHex);
    ciphertext = hexToBytes(ciphertextHex);
  } catch (e) {
    if (e instanceof CryptoError) {
      throw e;
    }
    throw new CryptoError('INVALID_FORMAT', 'Failed to decode encrypted data');
  }

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // GCM decryption fails if:
    // - The key is wrong
    // - The data has been tampered with (auth tag mismatch)
    // - The IV is wrong
    throw new CryptoError('DECRYPTION_FAILED', 'Failed to decrypt - wrong key or corrupted data');
  }
}

/**
 * Check if a ciphertext uses the current key version
 *
 * Useful for migration jobs to identify data needing re-encryption.
 *
 * @param encrypted - The encrypted string to check
 * @param keys - Versioned encryption keys
 * @returns true if encrypted with current version, false otherwise
 *
 * @example
 * ```typescript
 * if (!isCurrentVersion(encrypted, keys)) {
 *   // Re-encrypt with current key
 *   const decrypted = await decryptWithVersion(encrypted, keys);
 *   const reEncrypted = await encryptWithVersion(decrypted, keys);
 * }
 * ```
 */
export function isCurrentVersion(encrypted: string, keys: EncryptionKeys): boolean {
  try {
    const parsed = parseVersionedFormat(encrypted);
    return parsed.version === keys.current.version;
  } catch {
    return false; // Invalid format is not current version
  }
}

/**
 * Re-encrypt a value with the current key version
 *
 * Decrypts with available keys and re-encrypts with current version.
 * This is idempotent - already current-version data is still re-encrypted
 * (with a new IV for forward secrecy).
 *
 * @param encrypted - The encrypted string to migrate
 * @param keys - Versioned encryption keys
 * @returns Re-encrypted string with current version
 *
 * @example
 * ```typescript
 * const migrated = await reEncryptWithCurrentVersion(oldEncrypted, keys);
 * ```
 */
export async function reEncryptWithCurrentVersion(
  encrypted: string,
  keys: EncryptionKeys
): Promise<string> {
  const plaintext = await decryptWithVersion(encrypted, keys);
  return encryptWithVersion(plaintext, keys);
}
