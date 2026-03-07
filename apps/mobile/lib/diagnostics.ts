import Constants from 'expo-constants';
import { offlineQueue } from './offline-queue';
import { getRecentNetworkTraces } from './trpc-transport';

export interface MobileDiagnosticBundle {
  collectedAt: string;
  service: 'mobile';
  environment: {
    appEnv: string;
    nodeEnv: string;
    apiUrl?: string;
    storybookEnabled: boolean;
  };
  release: {
    version: string;
    buildNumber: string;
    runtimeVersion?: string;
    gitSha?: string;
    buildId?: string;
    channel?: string;
    ring?: string;
  };
  network: {
    traceCount: number;
    recent: ReturnType<typeof getRecentNetworkTraces>;
  };
  offlineQueue: {
    pendingCount: number;
    pending: Array<{
      id: string;
      type: string;
      traceId?: string;
      createdAt: number;
      retryCount: number;
      authRetryCount: number;
      lastError?: string;
      lastErrorType?: string;
    }>;
  };
}

function getAppEnvironment(): string {
  return process.env.EXPO_PUBLIC_APP_ENV?.trim() || (__DEV__ ? 'development' : 'production');
}

function getAppVersion(): string {
  return (
    process.env.EXPO_PUBLIC_APP_VERSION?.trim() ||
    Constants.expoConfig?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    '0.0.0'
  );
}

function getBuildNumber(): string {
  const iosBuildNumber = Constants.expoConfig?.ios?.buildNumber;
  const androidVersionCode = Constants.expoConfig?.android?.versionCode;

  return String(iosBuildNumber ?? androidVersionCode ?? '1');
}

export async function buildMobileDiagnosticBundle(): Promise<MobileDiagnosticBundle> {
  const queue = await offlineQueue.getQueue();
  const pending = [...queue]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 10)
    .map((action) => ({
      id: action.id,
      type: action.type,
      traceId: action.traceId,
      createdAt: action.createdAt,
      retryCount: action.retryCount,
      authRetryCount: action.authRetryCount,
      lastError: action.lastError,
      lastErrorType: action.lastErrorType,
    }));
  const recent = getRecentNetworkTraces();

  return {
    collectedAt: new Date().toISOString(),
    service: 'mobile',
    environment: {
      appEnv: getAppEnvironment(),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      storybookEnabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true',
    },
    release: {
      version: getAppVersion(),
      buildNumber: getBuildNumber(),
      runtimeVersion:
        Constants.expoConfig?.runtimeVersion != null
          ? String(Constants.expoConfig.runtimeVersion)
          : undefined,
      gitSha: process.env.EXPO_PUBLIC_RELEASE_GIT_SHA?.trim() || undefined,
      buildId: process.env.EXPO_PUBLIC_RELEASE_BUILD_ID?.trim() || undefined,
      channel: process.env.EXPO_PUBLIC_RELEASE_CHANNEL?.trim() || undefined,
      ring: process.env.EXPO_PUBLIC_RELEASE_RING?.trim() || undefined,
    },
    network: {
      traceCount: recent.length,
      recent,
    },
    offlineQueue: {
      pendingCount: queue.length,
      pending,
    },
  };
}
