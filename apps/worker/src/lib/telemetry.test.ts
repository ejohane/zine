import { describe, expect, it } from 'vitest';
import { ZINE_VERSION } from '@zine/shared';
import { getWorkerRelease } from './telemetry';

describe('getWorkerRelease', () => {
  it('drops malformed release env fields instead of throwing', () => {
    expect(() =>
      getWorkerRelease({
        ENVIRONMENT: 'development',
        RELEASE_GIT_SHA: '   ',
        RELEASE_BUILD_ID: '',
        RELEASE_DEPLOYED_AT: 'not-a-date',
        RELEASE_RING: '  ',
      } as never)
    ).not.toThrow();

    expect(
      getWorkerRelease({
        ENVIRONMENT: 'development',
        RELEASE_GIT_SHA: '   ',
        RELEASE_BUILD_ID: '',
        RELEASE_DEPLOYED_AT: 'not-a-date',
        RELEASE_RING: '  ',
      } as never)
    ).toEqual({
      version: ZINE_VERSION,
      channel: 'development',
    });
  });

  it('preserves valid release metadata', () => {
    expect(
      getWorkerRelease({
        ENVIRONMENT: 'production',
        RELEASE_GIT_SHA: 'abc123',
        RELEASE_BUILD_ID: 'gha_42',
        RELEASE_DEPLOYED_AT: '2026-03-07T18:00:00.000Z',
        RELEASE_RING: '100%',
      } as never)
    ).toEqual({
      version: ZINE_VERSION,
      channel: 'production',
      gitSha: 'abc123',
      buildId: 'gha_42',
      deployedAt: '2026-03-07T18:00:00.000Z',
      ring: '100%',
    });
  });
});
