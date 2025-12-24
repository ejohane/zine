/**
 * Tests for crypto utilities
 *
 * Tests AES-256-GCM encryption/decryption functionality including:
 * - Round-trip encrypt/decrypt
 * - Random IV generation (different ciphertext each time)
 * - Invalid key handling
 * - Wrong key decryption failures
 * - Tampered ciphertext detection
 */

import { describe, it, expect } from 'vitest';
import type { EncryptionKeys } from './crypto';
import {
  encrypt,
  decrypt,
  bytesToHex,
  hexToBytes,
  generateKey,
  CryptoError,
  getEncryptionKeys,
  encryptWithVersion,
  decryptWithVersion,
  isCurrentVersion,
  reEncryptWithCurrentVersion,
} from './crypto';

// ============================================================================
// Test Constants
// ============================================================================

// Valid 256-bit key (64 hex chars)
const VALID_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
// Different valid key for wrong key tests
const WRONG_KEY = 'f1e2d3c4b5a6978869504132a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';

// ============================================================================
// bytesToHex / hexToBytes Tests
// ============================================================================

describe('bytesToHex', () => {
  it('should convert empty array to empty string', () => {
    expect(bytesToHex(new Uint8Array([]))).toBe('');
  });

  it('should convert single byte correctly', () => {
    expect(bytesToHex(new Uint8Array([0]))).toBe('00');
    expect(bytesToHex(new Uint8Array([15]))).toBe('0f');
    expect(bytesToHex(new Uint8Array([255]))).toBe('ff');
  });

  it('should convert multiple bytes correctly', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 2, 255]))).toBe('000102ff');
  });

  it('should pad single-digit hex values with leading zero', () => {
    expect(bytesToHex(new Uint8Array([1, 2, 3]))).toBe('010203');
  });
});

describe('hexToBytes', () => {
  it('should convert empty string to empty array', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array([]));
  });

  it('should convert single byte correctly', () => {
    expect(hexToBytes('00')).toEqual(new Uint8Array([0]));
    expect(hexToBytes('0f')).toEqual(new Uint8Array([15]));
    expect(hexToBytes('ff')).toEqual(new Uint8Array([255]));
  });

  it('should convert multiple bytes correctly', () => {
    expect(hexToBytes('000102ff')).toEqual(new Uint8Array([0, 1, 2, 255]));
  });

  it('should handle uppercase hex', () => {
    expect(hexToBytes('FF')).toEqual(new Uint8Array([255]));
    expect(hexToBytes('ABCD')).toEqual(new Uint8Array([171, 205]));
  });

  it('should throw on odd-length string', () => {
    expect(() => hexToBytes('abc')).toThrow(CryptoError);
    expect(() => hexToBytes('abc')).toThrow('Hex string must have even length');
  });

  it('should throw on invalid hex characters', () => {
    expect(() => hexToBytes('zz')).toThrow(CryptoError);
    expect(() => hexToBytes('zz')).toThrow('Invalid hex character');
  });
});

describe('hexToBytes and bytesToHex round-trip', () => {
  it('should round-trip correctly', () => {
    const original = new Uint8Array([0, 128, 255, 1, 254]);
    const hex = bytesToHex(original);
    const result = hexToBytes(hex);
    expect(result).toEqual(original);
  });
});

// ============================================================================
// generateKey Tests
// ============================================================================

describe('generateKey', () => {
  it('should generate a 64-character hex string', () => {
    const key = generateKey();
    expect(key.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });

  it('should generate different keys each time', () => {
    const key1 = generateKey();
    const key2 = generateKey();
    expect(key1).not.toBe(key2);
  });

  it('should generate valid encryption keys', async () => {
    const key = generateKey();
    const plaintext = 'test message';

    // Should be able to encrypt and decrypt with generated key
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });
});

// ============================================================================
// encrypt Tests
// ============================================================================

describe('encrypt', () => {
  it('should return ciphertext in format "iv:ciphertext"', async () => {
    const encrypted = await encrypt('test', VALID_KEY);
    const parts = encrypted.split(':');

    expect(parts.length).toBe(2);
    // IV should be 24 hex chars (12 bytes)
    expect(parts[0].length).toBe(24);
    // Ciphertext should be non-empty
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('should generate different ciphertext for same plaintext (random IV)', async () => {
    const plaintext = 'same message';
    const encrypted1 = await encrypt(plaintext, VALID_KEY);
    const encrypted2 = await encrypt(plaintext, VALID_KEY);

    // IVs should be different
    const iv1 = encrypted1.split(':')[0];
    const iv2 = encrypted2.split(':')[0];
    expect(iv1).not.toBe(iv2);

    // Full ciphertexts should be different
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should encrypt empty string', async () => {
    const encrypted = await encrypt('', VALID_KEY);
    const decrypted = await decrypt(encrypted, VALID_KEY);
    expect(decrypted).toBe('');
  });

  it('should encrypt unicode characters', async () => {
    const plaintext = 'Hello 世界 🌍';
    const encrypted = await encrypt(plaintext, VALID_KEY);
    const decrypted = await decrypt(encrypted, VALID_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt long strings', async () => {
    const plaintext = 'a'.repeat(10000);
    const encrypted = await encrypt(plaintext, VALID_KEY);
    const decrypted = await decrypt(encrypted, VALID_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw on invalid key length', async () => {
    const shortKey = 'abc123';
    await expect(encrypt('test', shortKey)).rejects.toThrow(CryptoError);
    await expect(encrypt('test', shortKey)).rejects.toThrow('Key must be 64 hex characters');
  });

  it('should throw on invalid key characters', async () => {
    // Key with invalid hex characters (g, h, etc.)
    const invalidKey = 'ghijklmnopqrstuvwxyz'.repeat(4).slice(0, 64);
    await expect(encrypt('test', invalidKey)).rejects.toThrow(CryptoError);
  });
});

// ============================================================================
// decrypt Tests
// ============================================================================

describe('decrypt', () => {
  it('should decrypt what was encrypted', async () => {
    const plaintext = 'my secret token';
    const encrypted = await encrypt(plaintext, VALID_KEY);
    const decrypted = await decrypt(encrypted, VALID_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw on invalid format (no colon)', async () => {
    await expect(decrypt('nocolonseparator', VALID_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt('nocolonseparator', VALID_KEY)).rejects.toThrow(
      'Encrypted data must be in format "iv:ciphertext"'
    );
  });

  it('should throw on invalid format (too many colons)', async () => {
    await expect(decrypt('part1:part2:part3', VALID_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt('part1:part2:part3', VALID_KEY)).rejects.toThrow(
      'Encrypted data must be in format "iv:ciphertext"'
    );
  });

  it('should throw on invalid IV length', async () => {
    // IV should be 24 hex chars, this is only 12
    await expect(decrypt('abcdef123456:ciphertext', VALID_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt('abcdef123456:ciphertext', VALID_KEY)).rejects.toThrow(
      'Invalid IV length'
    );
  });

  it('should throw on wrong key', async () => {
    const encrypted = await encrypt('secret', VALID_KEY);
    await expect(decrypt(encrypted, WRONG_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt(encrypted, WRONG_KEY)).rejects.toThrow(
      'Failed to decrypt - wrong key or corrupted data'
    );
  });

  it('should throw on tampered ciphertext', async () => {
    const encrypted = await encrypt('secret', VALID_KEY);
    const [iv, ciphertext] = encrypted.split(':');

    // Modify one character of ciphertext
    const tamperedCiphertext =
      ciphertext.charAt(0) === 'a' ? 'b' + ciphertext.slice(1) : 'a' + ciphertext.slice(1);

    await expect(decrypt(`${iv}:${tamperedCiphertext}`, VALID_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt(`${iv}:${tamperedCiphertext}`, VALID_KEY)).rejects.toThrow(
      'Failed to decrypt - wrong key or corrupted data'
    );
  });

  it('should throw on tampered IV', async () => {
    const encrypted = await encrypt('secret', VALID_KEY);
    const [iv, ciphertext] = encrypted.split(':');

    // Modify one character of IV
    const tamperedIv = iv.charAt(0) === 'a' ? 'b' + iv.slice(1) : 'a' + iv.slice(1);

    await expect(decrypt(`${tamperedIv}:${ciphertext}`, VALID_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt(`${tamperedIv}:${ciphertext}`, VALID_KEY)).rejects.toThrow(
      'Failed to decrypt - wrong key or corrupted data'
    );
  });

  it('should throw on invalid hex in IV', async () => {
    await expect(decrypt('zzzzzzzzzzzzzzzzzzzzzzzz:abcd', VALID_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt('zzzzzzzzzzzzzzzzzzzzzzzz:abcd', VALID_KEY)).rejects.toThrow(
      'Invalid hex character'
    );
  });

  it('should throw on empty parts', async () => {
    await expect(decrypt(':', VALID_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt(':abc', VALID_KEY)).rejects.toThrow(CryptoError);
    await expect(decrypt('abc:', VALID_KEY)).rejects.toThrow(CryptoError);
  });
});

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('encrypt/decrypt round-trip', () => {
  const testCases = [
    { name: 'simple string', value: 'hello world' },
    { name: 'empty string', value: '' },
    { name: 'special characters', value: '!@#$%^&*()_+-=[]{}|;:,.<>?' },
    { name: 'unicode', value: '日本語 한국어 العربية' },
    { name: 'emojis', value: '🎉🚀💻🔐' },
    { name: 'newlines', value: 'line1\nline2\r\nline3' },
    { name: 'JSON', value: '{"access_token":"eyJ...","refresh_token":"dGh..."}' },
    { name: 'very long string', value: 'x'.repeat(50000) },
    { name: 'null bytes', value: 'before\x00after' },
  ];

  testCases.forEach(({ name, value }) => {
    it(`should round-trip ${name}`, async () => {
      const encrypted = await encrypt(value, VALID_KEY);
      const decrypted = await decrypt(encrypted, VALID_KEY);
      expect(decrypted).toBe(value);
    });
  });
});

// ============================================================================
// CryptoError Tests
// ============================================================================

describe('CryptoError', () => {
  it('should have correct name and code', () => {
    const error = new CryptoError('INVALID_KEY', 'Test message');
    expect(error.name).toBe('CryptoError');
    expect(error.code).toBe('INVALID_KEY');
    expect(error.message).toBe('Test message');
  });

  it('should be catchable as Error', () => {
    const error = new CryptoError('DECRYPTION_FAILED', 'Test');
    expect(error instanceof Error).toBe(true);
  });
});

// ============================================================================
// Versioned Encryption Tests
// ============================================================================

// Second key for rotation tests
const KEY_V2 = 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3';

describe('getEncryptionKeys', () => {
  it('should return current key with default version', () => {
    const env = { ENCRYPTION_KEY: VALID_KEY };
    const keys = getEncryptionKeys(env);

    expect(keys.current.keyHex).toBe(VALID_KEY);
    expect(keys.current.version).toBe(1);
    expect(keys.previous).toBeUndefined();
  });

  it('should use explicit version when provided', () => {
    const env = {
      ENCRYPTION_KEY: VALID_KEY,
      ENCRYPTION_KEY_VERSION: 5,
    };
    const keys = getEncryptionKeys(env);

    expect(keys.current.version).toBe(5);
  });

  it('should include previous key when provided', () => {
    const env = {
      ENCRYPTION_KEY: KEY_V2,
      ENCRYPTION_KEY_VERSION: 2,
      ENCRYPTION_KEY_PREVIOUS: VALID_KEY,
      ENCRYPTION_KEY_VERSION_PREVIOUS: 1,
    };
    const keys = getEncryptionKeys(env);

    expect(keys.current.keyHex).toBe(KEY_V2);
    expect(keys.current.version).toBe(2);
    expect(keys.previous?.keyHex).toBe(VALID_KEY);
    expect(keys.previous?.version).toBe(1);
  });

  it('should throw if ENCRYPTION_KEY is missing', () => {
    expect(() => getEncryptionKeys({} as { ENCRYPTION_KEY: string })).toThrow(CryptoError);
    expect(() => getEncryptionKeys({} as { ENCRYPTION_KEY: string })).toThrow(
      'ENCRYPTION_KEY environment variable is required'
    );
  });
});

describe('encryptWithVersion', () => {
  it('should return versioned format "v{version}:iv:ciphertext"', async () => {
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };
    const encrypted = await encryptWithVersion('test', keys);
    const parts = encrypted.split(':');

    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('v1');
    expect(parts[1].length).toBe(24); // IV: 12 bytes = 24 hex chars
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('should include correct version number', async () => {
    const keys: EncryptionKeys = {
      current: { version: 42, keyHex: VALID_KEY },
    };
    const encrypted = await encryptWithVersion('test', keys);

    expect(encrypted.startsWith('v42:')).toBe(true);
  });

  it('should generate different ciphertext each time (random IV)', async () => {
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };
    const encrypted1 = await encryptWithVersion('same message', keys);
    const encrypted2 = await encryptWithVersion('same message', keys);

    expect(encrypted1).not.toBe(encrypted2);
  });
});

describe('decryptWithVersion', () => {
  it('should decrypt versioned ciphertext', async () => {
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };
    const plaintext = 'my secret token';
    const encrypted = await encryptWithVersion(plaintext, keys);
    const decrypted = await decryptWithVersion(encrypted, keys);

    expect(decrypted).toBe(plaintext);
  });

  it('should decrypt with previous key when version matches', async () => {
    const keysV1: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };
    // Encrypt with v1
    const encrypted = await encryptWithVersion('secret', keysV1);

    // Now v2 is current, v1 is previous
    const keysV2: EncryptionKeys = {
      current: { version: 2, keyHex: KEY_V2 },
      previous: { version: 1, keyHex: VALID_KEY },
    };

    const decrypted = await decryptWithVersion(encrypted, keysV2);
    expect(decrypted).toBe('secret');
  });

  it('should decrypt legacy format (no version prefix)', async () => {
    // Create legacy format using original encrypt function
    const encrypted = await encrypt('legacy secret', VALID_KEY);
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };

    const decrypted = await decryptWithVersion(encrypted, keys);
    expect(decrypted).toBe('legacy secret');
  });

  it('should try previous key for legacy format if current fails', async () => {
    // Encrypt with old key (legacy format)
    const encrypted = await encrypt('old secret', VALID_KEY);

    // Current key is different, but previous matches
    const keys: EncryptionKeys = {
      current: { version: 2, keyHex: KEY_V2 },
      previous: { version: 1, keyHex: VALID_KEY },
    };

    const decrypted = await decryptWithVersion(encrypted, keys);
    expect(decrypted).toBe('old secret');
  });

  it('should throw KEY_VERSION_NOT_FOUND for unknown version', async () => {
    const keys: EncryptionKeys = {
      current: { version: 5, keyHex: VALID_KEY },
    };
    // Manually create a v99 ciphertext that we can't decrypt
    const encrypted = 'v99:abcdef123456789012345678:deadbeef';

    await expect(decryptWithVersion(encrypted, keys)).rejects.toThrow(CryptoError);
    await expect(decryptWithVersion(encrypted, keys)).rejects.toThrow(
      'No key found for version 99'
    );
  });

  it('should throw DECRYPTION_FAILED for wrong key', async () => {
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };
    const encrypted = await encryptWithVersion('secret', keys);

    const wrongKeys: EncryptionKeys = {
      current: { version: 1, keyHex: WRONG_KEY },
    };

    await expect(decryptWithVersion(encrypted, wrongKeys)).rejects.toThrow(CryptoError);
    await expect(decryptWithVersion(encrypted, wrongKeys)).rejects.toThrow(
      'Failed to decrypt - wrong key or corrupted data'
    );
  });

  it('should throw INVALID_FORMAT for malformed version', async () => {
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };

    await expect(decryptWithVersion('vXYZ:iv:ciphertext', keys)).rejects.toThrow(CryptoError);
    await expect(decryptWithVersion('vXYZ:iv:ciphertext', keys)).rejects.toThrow(
      'Invalid version number'
    );
  });
});

describe('isCurrentVersion', () => {
  it('should return true for current version', async () => {
    const keys: EncryptionKeys = {
      current: { version: 3, keyHex: VALID_KEY },
    };
    const encrypted = await encryptWithVersion('test', keys);

    expect(isCurrentVersion(encrypted, keys)).toBe(true);
  });

  it('should return false for older version', async () => {
    const keysV1: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };
    const encrypted = await encryptWithVersion('test', keysV1);

    const keysV2: EncryptionKeys = {
      current: { version: 2, keyHex: KEY_V2 },
      previous: { version: 1, keyHex: VALID_KEY },
    };

    expect(isCurrentVersion(encrypted, keysV2)).toBe(false);
  });

  it('should return false for legacy format', async () => {
    const legacyEncrypted = await encrypt('test', VALID_KEY);
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };

    expect(isCurrentVersion(legacyEncrypted, keys)).toBe(false);
  });

  it('should return false for invalid format', () => {
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };

    expect(isCurrentVersion('garbage', keys)).toBe(false);
    expect(isCurrentVersion('', keys)).toBe(false);
  });
});

describe('reEncryptWithCurrentVersion', () => {
  it('should re-encrypt with current key version', async () => {
    const keysV1: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };
    const originalEncrypted = await encryptWithVersion('my data', keysV1);

    const keysV2: EncryptionKeys = {
      current: { version: 2, keyHex: KEY_V2 },
      previous: { version: 1, keyHex: VALID_KEY },
    };

    const reEncrypted = await reEncryptWithCurrentVersion(originalEncrypted, keysV2);

    // Should now be v2
    expect(reEncrypted.startsWith('v2:')).toBe(true);
    // Should still decrypt to original value
    const decrypted = await decryptWithVersion(reEncrypted, keysV2);
    expect(decrypted).toBe('my data');
  });

  it('should handle legacy format', async () => {
    const legacyEncrypted = await encrypt('legacy data', VALID_KEY);
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };

    const reEncrypted = await reEncryptWithCurrentVersion(legacyEncrypted, keys);

    expect(reEncrypted.startsWith('v1:')).toBe(true);
    const decrypted = await decryptWithVersion(reEncrypted, keys);
    expect(decrypted).toBe('legacy data');
  });

  it('should generate new IV even if already current version', async () => {
    const keys: EncryptionKeys = {
      current: { version: 1, keyHex: VALID_KEY },
    };
    const original = await encryptWithVersion('test', keys);
    const reEncrypted = await reEncryptWithCurrentVersion(original, keys);

    // Same version but different ciphertext (different IV)
    expect(reEncrypted.startsWith('v1:')).toBe(true);
    expect(reEncrypted).not.toBe(original);
  });
});

describe('versioned encryption round-trip', () => {
  const testCases = [
    { name: 'simple string', value: 'hello world' },
    { name: 'empty string', value: '' },
    { name: 'unicode', value: '日本語 한국어 العربية' },
    { name: 'JSON token', value: '{"access_token":"eyJ...","refresh_token":"dGh..."}' },
  ];

  testCases.forEach(({ name, value }) => {
    it(`should round-trip ${name} with versioned encryption`, async () => {
      const keys: EncryptionKeys = {
        current: { version: 1, keyHex: VALID_KEY },
      };
      const encrypted = await encryptWithVersion(value, keys);
      const decrypted = await decryptWithVersion(encrypted, keys);
      expect(decrypted).toBe(value);
    });
  });
});
