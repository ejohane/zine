import {
  FailEditorialRunSchema,
  StartEditorialRunSchema,
  type FailEditorialRun,
  type StartEditorialRun,
} from '@zine/editorial-schema';
import { requiredArg } from './args';

export const DEFAULT_EDITORIAL_API_URL = 'https://api.myzine.app';

type CliArgs = Record<string, string | boolean>;
type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type EditorialRequestOptions = {
  token?: string;
  apiUrl?: string;
  fetchImpl?: FetchImplementation;
};

type EditorialCliRequestOptions = Omit<EditorialRequestOptions, 'apiUrl'>;

export class EditorialRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'EditorialRequestError';
  }
}

export function editorialApiUrlFromArgs(args: CliArgs): string {
  return typeof args['api-url'] === 'string' ? args['api-url'] : DEFAULT_EDITORIAL_API_URL;
}

function redactSecretString(value: string, secret: string): string {
  return secret.length > 0 ? value.replaceAll(secret, '[REDACTED]') : value;
}

function redactSecret(value: unknown, secret: string): unknown {
  if (typeof value === 'string') return redactSecretString(value, secret);
  if (Array.isArray(value)) return value.map((item) => redactSecret(item, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redactSecretString(key, secret),
        redactSecret(item, secret),
      ])
    );
  }
  return value;
}

function errorMessage(error: unknown, token: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecretString(message, token);
}

export async function postEditorialRequest(
  path: string,
  body: unknown,
  options: EditorialRequestOptions
): Promise<unknown> {
  const token = options.token;
  if (!token) throw new Error('ZINE_ACCESS_TOKEN is required');

  const apiUrl = (options.apiUrl ?? DEFAULT_EDITORIAL_API_URL).replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new EditorialRequestError(`Editorial request failed: ${errorMessage(error, token)}`);
  }

  const result = redactSecret(await response.json().catch(() => ({})), token);
  if (!response.ok) {
    throw new EditorialRequestError(
      `Editorial request failed (${response.status}): ${JSON.stringify(result)}`,
      response.status
    );
  }
  return result;
}

export function startEditorialRunFromArgs(
  args: CliArgs,
  options: EditorialCliRequestOptions
): Promise<unknown> {
  const body: StartEditorialRun = StartEditorialRunSchema.parse({
    id: requiredArg(args, 'run-id'),
    editionDate: requiredArg(args, 'date'),
    workflowVersion: requiredArg(args, 'workflow-version'),
    promptVersion: requiredArg(args, 'prompt-version'),
    model: requiredArg(args, 'model'),
  });
  return postEditorialRequest('/api/v1/editorial/runs', body, {
    ...options,
    apiUrl: editorialApiUrlFromArgs(args),
  });
}

export function failEditorialRunFromArgs(
  args: CliArgs,
  options: EditorialCliRequestOptions
): Promise<unknown> {
  const runId = requiredArg(args, 'run-id');
  const body: FailEditorialRun = FailEditorialRunSchema.parse({
    stage: requiredArg(args, 'stage'),
    message: requiredArg(args, 'message'),
  });
  return postEditorialRequest(`/api/v1/editorial/runs/${encodeURIComponent(runId)}/failure`, body, {
    ...options,
    apiUrl: editorialApiUrlFromArgs(args),
  });
}
