import { z } from 'zod';

/**
 * Custom Zod validator for Unix timestamps (seconds since epoch)
 * Validates that the value is a number within a reasonable date range
 */
export const unixTimestamp = () => 
  z.number()
    .int()
    .positive()
    .max(4102444800) // Max date: 2100-01-01
    .describe('Unix timestamp in seconds');

/**
 * Optional Unix timestamp validator
 */
export const optionalUnixTimestamp = () => 
  unixTimestamp().optional().nullable();

/**
 * Transform various date formats to Unix timestamp
 * Accepts: Date, ISO string, number (unix timestamp or milliseconds)
 */
export const dateToUnixTimestamp = () =>
  z.union([
    z.date(),
    z.string().datetime(),
    z.number()
  ]).transform((val) => {
    if (typeof val === 'number') {
      // If already a unix timestamp in seconds, return it
      if (val > 0 && val < 10000000000) {
        return Math.floor(val);
      }
      // If in milliseconds, convert to seconds
      if (val > 10000000000) {
        return Math.floor(val / 1000);
      }
    }
    
    if (val instanceof Date) {
      return Math.floor(val.getTime() / 1000);
    }
    
    if (typeof val === 'string') {
      return Math.floor(new Date(val).getTime() / 1000);
    }
    
    throw new Error('Invalid date format');
  }).pipe(unixTimestamp());

/**
 * Optional date to Unix timestamp transformer
 */
export const optionalDateToUnixTimestamp = () =>
  z.union([
    z.date(),
    z.string().datetime(),
    z.number(),
    z.null(),
    z.undefined()
  ]).transform((val) => {
    if (val === null || val === undefined) {
      return null;
    }
    
    if (typeof val === 'number') {
      // If already a unix timestamp in seconds, return it
      if (val > 0 && val < 10000000000) {
        return Math.floor(val);
      }
      // If in milliseconds, convert to seconds
      if (val > 10000000000) {
        return Math.floor(val / 1000);
      }
    }
    
    if (val instanceof Date) {
      return Math.floor(val.getTime() / 1000);
    }
    
    if (typeof val === 'string') {
      return Math.floor(new Date(val).getTime() / 1000);
    }
    
    return null;
  }).pipe(optionalUnixTimestamp());