import { TRPCClientError } from '@trpc/client';

export type ErrorType =
  | 'network'
  | 'auth'
  | 'validation'
  | 'conflict'
  | 'server'
  | 'timeout'
  | 'unknown';

const NETWORK_ERROR_PATTERNS = [
  'network request failed',
  'failed to fetch',
  'network error',
  'net::err',
  'econnrefused',
  'enotfound',
  'unable to resolve host',
  'no internet connection',
  'offline',
  'connection',
  'aborted',
] as const;

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') || msg.includes('fetch');
  }

  if (error instanceof Error) {
    const message = error.message?.toLowerCase() ?? '';
    const name = error.name?.toLowerCase() ?? '';

    if (NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
      return true;
    }

    if (name === 'typeerror' && message.includes('fetch')) {
      return true;
    }

    if (name === 'aborterror') {
      return true;
    }
  }

  return false;
}

export function isAuthError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return error.data?.code === 'UNAUTHORIZED';
  }

  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const data = errorObj.data as Record<string, unknown> | undefined;
    const httpStatus = data?.httpStatus ?? errorObj.status ?? errorObj.statusCode;
    const code = data?.code ?? errorObj.code;

    return httpStatus === 401 || code === 'UNAUTHORIZED';
  }

  return false;
}

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    return message.includes('timeout') || name === 'aborterror' || name === 'timeouterror';
  }

  return false;
}

export function isServerError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const data = errorObj.data as Record<string, unknown> | undefined;
    const httpStatus = data?.httpStatus ?? errorObj.status ?? errorObj.statusCode;

    return typeof httpStatus === 'number' && httpStatus >= 500;
  }

  return false;
}

export function isConflictError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const data = errorObj.data as Record<string, unknown> | undefined;
    const httpStatus = data?.httpStatus ?? errorObj.status ?? errorObj.statusCode;
    const code = data?.code ?? errorObj.code;

    return httpStatus === 409 || code === 'CONFLICT';
  }

  return false;
}

export function isValidationError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const data = errorObj.data as Record<string, unknown> | undefined;
    const httpStatus = data?.httpStatus ?? errorObj.status ?? errorObj.statusCode;

    if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
      return httpStatus !== 401 && httpStatus !== 409;
    }
  }

  return false;
}

export function classifyError(error: unknown): ErrorType {
  if (isNetworkError(error)) return 'network';
  if (isTimeoutError(error)) return 'timeout';
  if (isAuthError(error)) return 'auth';
  if (isConflictError(error)) return 'conflict';
  if (isValidationError(error)) return 'validation';
  if (isServerError(error)) return 'server';
  return 'unknown';
}

export function getErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) {
    return fallbackMessage ?? 'An unexpected error occurred';
  }

  const errorType = classifyError(error);

  switch (errorType) {
    case 'network':
      return 'Unable to connect. Please check your internet connection and try again.';
    case 'timeout':
      return 'The request timed out. Please try again.';
    case 'auth':
      return 'Your session has expired. Please sign in again.';
    case 'server':
      return 'Something went wrong on our end. Please try again later.';
    case 'validation':
      return fallbackMessage ?? (error instanceof Error ? error.message : 'Invalid request');
    case 'conflict':
      return fallbackMessage ?? 'This action has already been completed.';
    case 'unknown':
    default:
      return (
        fallbackMessage ?? (error instanceof Error ? error.message : 'An unexpected error occurred')
      );
  }
}
