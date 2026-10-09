export class PublicationError extends Error {
  constructor(
    public code: string,
    public status: 400 | 403 | 404 | 409 | 413 | 415 | 422 | 503,
    public details?: Record<string, unknown>
  ) {
    super(code);
  }
}
export function requireFound<T>(value: T | null | undefined): T {
  if (!value) throw new PublicationError('NOT_FOUND', 404);
  return value;
}
