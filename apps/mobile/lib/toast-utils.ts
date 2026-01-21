/**
 * Toast Utilities for Zine Mobile App
 *
 * Provides centralized toast notification helpers for success and error feedback.
 * Uses HeroUI Native's toast system.
 *
 * @example
 * ```tsx
 * import { useToast } from 'heroui-native';
 * import { showSuccess, showError } from '@/lib/toast-utils';
 *
 * function MyComponent() {
 *   const toast = useToast();
 *
 *   const handleAction = async () => {
 *     try {
 *       await doSomething();
 *       showSuccess(toast, 'Action completed');
 *     } catch (error) {
 *       showError(toast, error, 'Failed to complete action');
 *     }
 *   };
 * }
 * ```
 */

import type { ToastManager } from 'heroui-native';
import { logger } from './logger';

// ============================================================================
// Constants
// ============================================================================

/** Default duration for success toasts (in milliseconds) */
const SUCCESS_DURATION = 3000;

/** Default duration for error toasts (in milliseconds) */
const ERROR_DURATION = 4000;

/** Default duration for warning toasts (in milliseconds) */
const WARNING_DURATION = 4000;

// ============================================================================
// Success Toasts
// ============================================================================

/**
 * Show a success toast notification.
 *
 * @param toast - The toast manager from useToast()
 * @param message - The success message to display
 * @param description - Optional description for additional context
 *
 * @example
 * ```tsx
 * showSuccess(toast, 'Saved to library');
 * showSuccess(toast, 'Subscribed', 'You will receive updates from this channel');
 * ```
 */
export function showSuccess(toast: ToastManager, message: string, description?: string): void {
  toast.show({
    label: message,
    description,
    variant: 'success',
    duration: SUCCESS_DURATION,
  });
}

// ============================================================================
// Warning Toasts
// ============================================================================

/**
 * Show a warning toast notification.
 *
 * Used for partial failures or situations that need attention but aren't errors.
 *
 * @param toast - The toast manager from useToast()
 * @param message - The warning message to display
 * @param description - Optional description for additional context
 *
 * @example
 * ```tsx
 * showWarning(toast, 'Synced 8 of 10 sources', '2 sources had issues');
 * ```
 */
export function showWarning(toast: ToastManager, message: string, description?: string): void {
  toast.show({
    label: message,
    description,
    variant: 'warning',
    duration: WARNING_DURATION,
  });
}

// ============================================================================
// Error Toasts
// ============================================================================

/**
 * Show an error toast notification.
 *
 * Also logs the error to console for debugging purposes.
 *
 * @param toast - The toast manager from useToast()
 * @param error - The error that occurred (for logging)
 * @param defaultMessage - The user-friendly message to display
 * @param context - Optional context for the error log (e.g., 'toggleFinished')
 *
 * @example
 * ```tsx
 * try {
 *   await deleteItem(id);
 * } catch (error) {
 *   showError(toast, error, 'Failed to delete item', 'deleteItem');
 * }
 * ```
 */
export function showError(
  toast: ToastManager,
  error: unknown,
  defaultMessage: string,
  context?: string
): void {
  // Log for debugging
  logger.error(context || 'Error', { error, defaultMessage });

  // Show user-friendly toast
  toast.show({
    label: defaultMessage,
    description: 'Please try again',
    variant: 'danger',
    duration: ERROR_DURATION,
  });
}

// ============================================================================
// Mutation Helpers
// ============================================================================

/**
 * Handle a mutation with automatic toast feedback.
 *
 * Shows success toast on completion, error toast on failure.
 *
 * @param toast - The toast manager from useToast()
 * @param mutation - The async mutation to execute
 * @param options - Configuration for success and error messages
 *
 * @example
 * ```tsx
 * await withToast(toast, () => toggleFinished(item.id), {
 *   successMessage: item.isFinished ? 'Marked as unfinished' : 'Marked as finished',
 *   errorMessage: 'Failed to update item',
 *   context: 'toggleFinished',
 * });
 * ```
 */
export async function withToast<T>(
  toast: ToastManager,
  mutation: () => Promise<T>,
  options: {
    successMessage: string;
    successDescription?: string;
    errorMessage: string;
    context?: string;
  }
): Promise<T | undefined> {
  try {
    const result = await mutation();
    showSuccess(toast, options.successMessage, options.successDescription);
    return result;
  } catch (error) {
    showError(toast, error, options.errorMessage, options.context);
    return undefined;
  }
}
