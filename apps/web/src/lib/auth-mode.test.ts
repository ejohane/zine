import { expect, test } from 'vitest';
import { resolveAuthMode } from './auth-mode';
const local = {
  publishableKey: '',
  hostname: 'localhost',
  developmentBuild: true,
  testBypass: undefined,
};
test('missing Clerk config never implicitly signs a local user in', () => {
  expect(resolveAuthMode(local)).toBe('disabled');
});
test('only an explicit isolated localhost test can bypass auth', () => {
  expect(resolveAuthMode({ ...local, testBypass: 'true' })).toBe('development-bypass');
  expect(resolveAuthMode({ ...local, testBypass: 'true', developmentBuild: false })).toBe(
    'disabled'
  );
  expect(resolveAuthMode({ ...local, testBypass: 'true', hostname: 'myzine.app' })).toBe(
    'disabled'
  );
});
test('configured Clerk always takes precedence', () => {
  expect(resolveAuthMode({ ...local, publishableKey: 'pk_test_example', testBypass: 'true' })).toBe(
    'clerk'
  );
});
