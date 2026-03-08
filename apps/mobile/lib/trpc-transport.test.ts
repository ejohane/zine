import {
  buildMobileTelemetryHeaders,
  createMobileActionTraceContext,
  getRecentNetworkTraces,
  runWithMobileActionTrace,
  telemetryFetch,
} from './trpc-transport';
import {
  TELEMETRY_CLIENT_REQUEST_HEADER,
  TELEMETRY_REQUEST_HEADER,
  TELEMETRY_TRACE_HEADER,
} from '@zine/shared';
import { trpcLogger } from './logger';

jest.mock('./logger', () => ({
  trpcLogger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('buildMobileTelemetryHeaders', () => {
  it('merges auth and telemetry headers', () => {
    const headers = buildMobileTelemetryHeaders(
      { Authorization: 'Bearer test-token' },
      {
        traceId: 'trc_test_trace',
        clientRequestId: 'crq_test_request',
      }
    );

    expect(headers).toMatchObject({
      Authorization: 'Bearer test-token',
      [TELEMETRY_TRACE_HEADER]: 'trc_test_trace',
      [TELEMETRY_CLIENT_REQUEST_HEADER]: 'crq_test_request',
    });
  });

  it('reuses the active action trace when no explicit trace seed is provided', async () => {
    const actionTrace = createMobileActionTraceContext({
      traceId: 'trc_action_scope',
    });

    await runWithMobileActionTrace(actionTrace, async () => {
      const headers = buildMobileTelemetryHeaders({ Authorization: 'Bearer test-token' });

      expect(headers).toMatchObject({
        Authorization: 'Bearer test-token',
        [TELEMETRY_TRACE_HEADER]: 'trc_action_scope',
      });
      expect(headers[TELEMETRY_CLIENT_REQUEST_HEADER]).toEqual(expect.any(String));
    });
  });
});

describe('telemetryFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records worker request IDs from successful responses', async () => {
    const baselineCount = getRecentNetworkTraces().length;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers({
        [TELEMETRY_REQUEST_HEADER]: 'req_worker_123',
        [TELEMETRY_TRACE_HEADER]: 'trc_worker_123',
      }),
    }) as unknown as typeof fetch;

    await telemetryFetch('https://example.com/trpc', {
      method: 'POST',
      headers: {
        [TELEMETRY_TRACE_HEADER]: 'trc_client_123',
        [TELEMETRY_CLIENT_REQUEST_HEADER]: 'crq_client_123',
      },
    });

    const traces = getRecentNetworkTraces();
    expect(traces).toHaveLength(baselineCount + 1);
    expect(traces[0]).toMatchObject({
      url: 'https://example.com/trpc',
      method: 'POST',
      traceId: 'trc_worker_123',
      clientRequestId: 'crq_client_123',
      workerRequestId: 'req_worker_123',
      httpStatus: 202,
      ok: true,
    });
  });

  it('redacts URL query params and marks 207 responses as degraded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 207,
      headers: new Headers({
        [TELEMETRY_REQUEST_HEADER]: 'req_worker_207',
        [TELEMETRY_TRACE_HEADER]: 'trc_worker_207',
      }),
    }) as unknown as typeof fetch;

    await telemetryFetch('https://example.com/trpc?batch=1&input=%7B%22secret%22%3A1%7D', {
      method: 'GET',
      headers: {
        [TELEMETRY_TRACE_HEADER]: 'trc_client_207',
      },
    });

    const traces = getRecentNetworkTraces();
    expect(traces[0]).toMatchObject({
      url: 'https://example.com/trpc',
      httpStatus: 207,
      ok: false,
    });
    expect(trpcLogger.warn).toHaveBeenCalledWith(
      'tRPC transport received degraded response',
      expect.objectContaining({
        url: 'https://example.com/trpc',
        statusKind: 'partial',
      })
    );
  });

  it('logs transport failures with correlation metadata', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(
      telemetryFetch('https://example.com/trpc', {
        method: 'POST',
        headers: {
          [TELEMETRY_TRACE_HEADER]: 'trc_client_error',
          [TELEMETRY_CLIENT_REQUEST_HEADER]: 'crq_client_error',
        },
      })
    ).rejects.toThrow('network down');

    expect(trpcLogger.error).toHaveBeenCalledWith(
      'tRPC transport request failed',
      expect.objectContaining({
        traceId: 'trc_client_error',
        clientRequestId: 'crq_client_error',
      })
    );
  });
});
