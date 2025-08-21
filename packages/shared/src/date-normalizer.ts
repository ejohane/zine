/**
 * Date Normalizer
 * Ensures consistent date format across the application
 * All dates are stored as Unix timestamps (seconds since epoch)
 */

export class DateNormalizer {
  /**
   * Convert various date formats to Unix timestamp (seconds)
   */
  static toUnixTimestamp(input: string | number | Date | null | undefined): number | null {
    if (input === null || input === undefined) {
      return null;
    }

    let date: Date;

    if (typeof input === 'number') {
      // Check if it's already a Unix timestamp (seconds)
      if (input > 0 && input < 10000000000) {
        // But also validate it's not beyond 2100
        if (input > 4102444800) {
          return null;
        }
        return Math.floor(input);
      }
      // If it's in milliseconds, convert to seconds
      if (input > 10000000000) {
        return Math.floor(input / 1000);
      }
      // Invalid number
      return null;
    }

    if (input instanceof Date) {
      date = input;
    } else if (typeof input === 'string') {
      // Try to parse ISO string or other date formats
      date = new Date(input);
    } else {
      return null;
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }

    // Validate date range (between 1970 and 2100)
    const timestamp = Math.floor(date.getTime() / 1000);
    if (timestamp < 0 || timestamp > 4102444800) { // 2100-01-01
      return null;
    }

    return timestamp;
  }

  /**
   * Convert Unix timestamp to ISO string
   */
  static toISOString(timestamp: number | null | undefined): string | null {
    if (timestamp === null || timestamp === undefined) {
      return null;
    }

    // Ensure it's in seconds (not milliseconds)
    const seconds = timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
    
    const date = new Date(seconds * 1000);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  /**
   * Convert Unix timestamp to Date object
   */
  static toDate(timestamp: number | null | undefined): Date | null {
    if (timestamp === null || timestamp === undefined) {
      return null;
    }

    // Ensure it's in seconds (not milliseconds)
    const seconds = timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
    
    const date = new Date(seconds * 1000);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  /**
   * Check if a value is a valid Unix timestamp
   */
  static isValidTimestamp(value: unknown): boolean {
    if (typeof value !== 'number') {
      return false;
    }

    // Check if it's a reasonable Unix timestamp (between 1970 and 2100)
    return value > 0 && value < 4102444800;
  }

  /**
   * Normalize date fields in an object
   */
  static normalizeObjectDates<T extends Record<string, any>>(
    obj: T,
    dateFields: (keyof T)[]
  ): T {
    const normalized = { ...obj };

    for (const field of dateFields) {
      if (field in normalized) {
        const value = normalized[field];
        normalized[field] = this.toUnixTimestamp(value) as any;
      }
    }

    return normalized;
  }

  /**
   * Get current Unix timestamp
   */
  static now(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Format timestamp for display (relative time)
   */
  static formatRelative(timestamp: number | null | undefined): string {
    if (!timestamp) return 'Unknown';

    const now = this.now();
    const diff = now - timestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
    
    return `${Math.floor(diff / 31536000)} years ago`;
  }
}

// Export convenience functions
export const toUnixTimestamp = DateNormalizer.toUnixTimestamp.bind(DateNormalizer);
export const toISOString = DateNormalizer.toISOString.bind(DateNormalizer);
export const toDate = DateNormalizer.toDate.bind(DateNormalizer);
export const isValidTimestamp = DateNormalizer.isValidTimestamp.bind(DateNormalizer);
export const normalizeObjectDates = DateNormalizer.normalizeObjectDates.bind(DateNormalizer);
export const now = DateNormalizer.now.bind(DateNormalizer);
export const formatRelative = DateNormalizer.formatRelative.bind(DateNormalizer);