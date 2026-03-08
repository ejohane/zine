import { resolveApiUrl } from './trpc';

describe('resolveApiUrl', () => {
  it('returns undefined when EXPO_PUBLIC_API_URL is not set', () => {
    expect(resolveApiUrl(undefined, 'ios', true)).toBeUndefined();
  });

  it('maps localhost to 10.0.2.2 for android development', () => {
    expect(resolveApiUrl('http://localhost:8787', 'android', true)).toBe('http://10.0.2.2:8787');
  });

  it('keeps configured https URL for ios development', () => {
    expect(resolveApiUrl('https://api.myzine.app', 'ios', true)).toBe('https://api.myzine.app');
  });

  it('forces production API for non-dev localhost on ios', () => {
    expect(resolveApiUrl('http://localhost:8787', 'ios', false)).toBe('https://api.myzine.app');
  });

  it('forces production API for non-dev 127.0.0.1 on android', () => {
    expect(resolveApiUrl('http://127.0.0.1:8787', 'android', false)).toBe('https://api.myzine.app');
  });
});
