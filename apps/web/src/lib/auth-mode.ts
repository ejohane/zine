export type AuthMode = 'clerk' | 'development-bypass' | 'disabled';

export function resolveAuthMode({
  publishableKey,
  hostname,
  developmentBuild,
  testBypass,
}: {
  publishableKey: string;
  hostname: string;
  developmentBuild: boolean;
  testBypass: string | undefined;
}): AuthMode {
  if (publishableKey) return 'clerk';
  return developmentBuild &&
    testBypass === 'true' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
    ? 'development-bypass'
    : 'disabled';
}
