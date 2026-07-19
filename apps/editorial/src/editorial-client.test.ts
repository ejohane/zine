import { describe, expect, it } from 'bun:test';
import { parseArgs } from './args';
import {
  DEFAULT_EDITORIAL_API_URL,
  EditorialRequestError,
  failEditorialRunFromArgs,
  postEditorialRequest,
  startEditorialRunFromArgs,
} from './editorial-client';
import { EDITORIAL_HELP_TEXT } from './help';

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function recordingFetch(response: Response) {
  const calls: FetchCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response;
  };
  return { calls, fetchImpl };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestBody(call: FetchCall): Record<string, unknown> {
  expect(typeof call.init?.body).toBe('string');
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

describe('editorial lifecycle client', () => {
  it('starts a run against --api-url with bearer auth and server-owned timestamps', async () => {
    const token = 'zine_test_start_secret';
    const { calls, fetchImpl } = recordingFetch(
      jsonResponse(
        {
          created: true,
          run: {
            id: 'edition_2026-07-19_r1',
            status: 'PREPARING',
            startedAt: '2026-07-19T11:45:00.000Z',
          },
        },
        201
      )
    );
    const args = parseArgs([
      '--run-id',
      'edition_2026-07-19_r1',
      '--date',
      '2026-07-19',
      '--workflow-version',
      'x-led-v1',
      '--prompt-version',
      'daily-v3',
      '--model',
      'gpt-5.6',
      '--api-url',
      'http://127.0.0.1:8787/',
    ]);

    const result = await startEditorialRunFromArgs(args, { token, fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://127.0.0.1:8787/api/v1/editorial/runs');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(new Headers(calls[0]!.init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
    expect(new Headers(calls[0]!.init?.headers).get('Content-Type')).toBe('application/json');
    expect(requestBody(calls[0]!)).toEqual({
      id: 'edition_2026-07-19_r1',
      editionDate: '2026-07-19',
      workflowVersion: 'x-led-v1',
      promptVersion: 'daily-v3',
      model: 'gpt-5.6',
    });
    expect(requestBody(calls[0]!)).not.toHaveProperty('startedAt');
    expect(requestBody(calls[0]!)).not.toHaveProperty('createdAt');
    expect(result).toMatchObject({
      run: { startedAt: '2026-07-19T11:45:00.000Z' },
    });
  });

  it('fails an encoded run path with only the failure payload and default API URL', async () => {
    const token = 'zine_test_failure_secret';
    const { calls, fetchImpl } = recordingFetch(
      jsonResponse({
        run: {
          id: 'run/with spaces',
          status: 'FAILED',
          failedAt: '2026-07-19T12:00:00.000Z',
        },
      })
    );
    const args = parseArgs([
      '--run-id',
      'run/with spaces',
      '--stage',
      'RANK',
      '--message',
      'Candidate artifact validation failed',
    ]);

    const result = await failEditorialRunFromArgs(args, { token, fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      `${DEFAULT_EDITORIAL_API_URL}/api/v1/editorial/runs/run%2Fwith%20spaces/failure`
    );
    expect(new Headers(calls[0]!.init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
    expect(requestBody(calls[0]!)).toEqual({
      stage: 'RANK',
      message: 'Candidate artifact validation failed',
    });
    expect(requestBody(calls[0]!)).not.toHaveProperty('failedAt');
    expect(requestBody(calls[0]!)).not.toHaveProperty('updatedAt');
    expect(result).toMatchObject({
      run: { failedAt: '2026-07-19T12:00:00.000Z' },
    });
  });

  it('reports non-2xx details without exposing the bearer token', async () => {
    const token = 'zine_test_error_secret';
    const { fetchImpl } = recordingFetch(
      jsonResponse(
        {
          error: `Rejected Bearer ${token}`,
          code: 'EDITORIAL_RUN_CONFLICT',
          nested: { token },
        },
        409
      )
    );

    let caught: unknown;
    try {
      await postEditorialRequest('/api/v1/editorial/runs', {}, { token, fetchImpl });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EditorialRequestError);
    expect((caught as EditorialRequestError).status).toBe(409);
    expect((caught as Error).message).toContain('EDITORIAL_RUN_CONFLICT');
    expect((caught as Error).message).toContain('[REDACTED]');
    expect((caught as Error).message).not.toContain(token);
  });

  it('redacts the bearer token from successful output and transport errors', async () => {
    const token = 'zine_test_output_secret';
    const { fetchImpl } = recordingFetch(
      jsonResponse({ message: `server echoed ${token}`, [token]: token })
    );

    const result = await postEditorialRequest(
      '/api/v1/editorial/runs',
      {},
      {
        token,
        fetchImpl,
      }
    );
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).toContain('[REDACTED]');

    const rejectedFetch = async () => {
      throw new Error(`socket rejected ${token}`);
    };
    await expect(
      postEditorialRequest('/api/v1/editorial/runs', {}, { token, fetchImpl: rejectedFetch })
    ).rejects.toThrow('socket rejected [REDACTED]');
  });

  it('requires the access token before making a request', async () => {
    const { calls, fetchImpl } = recordingFetch(jsonResponse({}));

    await expect(postEditorialRequest('/api/v1/editorial/runs', {}, { fetchImpl })).rejects.toThrow(
      'ZINE_ACCESS_TOKEN is required'
    );
    expect(calls).toHaveLength(0);
  });
});

describe('editorial CLI help', () => {
  it('documents the candidate artifact required by the productized publish flow', () => {
    expect(EDITORIAL_HELP_TEXT).toContain('--candidates <candidates.json>');
  });
});
