import { buildMobileDiagnosticBundle } from './diagnostics';
import { getRecentNetworkTraces } from './trpc-transport';
import { offlineQueue } from './offline-queue';

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.2.3',
    ios: {
      buildNumber: '42',
    },
    runtimeVersion: 'native-1.2.3',
  },
  manifest2: {
    extra: {
      expoClient: {
        version: '1.2.3',
      },
    },
  },
}));

jest.mock('./trpc-transport', () => ({
  getRecentNetworkTraces: jest.fn(),
}));

jest.mock('./offline-queue', () => ({
  offlineQueue: {
    getQueue: jest.fn(),
  },
}));

describe('buildMobileDiagnosticBundle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRecentNetworkTraces as jest.Mock).mockReturnValue([
      {
        url: 'https://api.example.com/trpc',
        method: 'POST',
        traceId: 'trc_network',
        clientRequestId: 'crq_network',
        startedAt: '2026-03-07T12:00:00.000Z',
        finishedAt: '2026-03-07T12:00:01.000Z',
      },
    ]);
    (offlineQueue.getQueue as jest.Mock).mockResolvedValue([
      {
        id: 'action_older',
        type: 'SUBSCRIBE',
        traceId: 'trc_older',
        createdAt: 100,
        retryCount: 1,
        authRetryCount: 0,
      },
      {
        id: 'action_newer',
        type: 'UNSUBSCRIBE',
        traceId: 'trc_newer',
        createdAt: 200,
        retryCount: 0,
        authRetryCount: 1,
        lastError: 'network down',
        lastErrorType: 'NETWORK',
      },
    ]);
  });

  it('collects release, network, and queue summaries', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8787';
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = 'true';
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
    process.env.EXPO_PUBLIC_RELEASE_GIT_SHA = 'abc1234';
    process.env.EXPO_PUBLIC_RELEASE_BUILD_ID = 'gha_42';
    process.env.EXPO_PUBLIC_RELEASE_CHANNEL = 'preview';
    process.env.EXPO_PUBLIC_RELEASE_RING = 'internal';

    const bundle = await buildMobileDiagnosticBundle();

    expect(bundle.service).toBe('mobile');
    expect(bundle.environment).toEqual({
      appEnv: 'preview',
      nodeEnv: 'test',
      apiUrl: 'http://localhost:8787',
      storybookEnabled: true,
    });
    expect(bundle.release).toEqual({
      version: '1.2.3',
      buildNumber: '42',
      runtimeVersion: 'native-1.2.3',
      gitSha: 'abc1234',
      buildId: 'gha_42',
      channel: 'preview',
      ring: 'internal',
    });
    expect(bundle.network.traceCount).toBe(1);
    expect(bundle.offlineQueue.pendingCount).toBe(2);
    expect(bundle.offlineQueue.pending.map((action) => action.id)).toEqual([
      'action_newer',
      'action_older',
    ]);
  });
});
