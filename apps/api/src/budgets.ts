import { now, stmt } from './lib';
import { identify } from './identity';
import type { Env } from './types';

export function budgetScope(url: string) {
  const identity = identify(url);
  if (identity.platform === 'youtube')
    return identity.kind === 'feed'
      ? 'provider:youtube:feed'
      : identity.kind === 'video'
        ? 'provider:youtube:watch'
        : 'provider:youtube:channel';
  return ['spotify', 'x'].includes(identity.platform)
    ? `provider:${identity.platform}`
    : `host:${new URL(identity.url).hostname}`;
}
export async function acquireBudget(env: Env, scope: string, token: string) {
  const timestamp = now();
  const acquired = await stmt(
    env.DB,
    `INSERT INTO provider_budgets(scope,not_before,lease_until,lease_token) VALUES(?,?,?,?)
    ON CONFLICT(scope) DO UPDATE SET lease_until=excluded.lease_until,lease_token=excluded.lease_token
    WHERE provider_budgets.not_before<=? AND (provider_budgets.lease_until IS NULL OR provider_budgets.lease_until<?)`,
    scope,
    timestamp,
    new Date(Date.now() + 5 * 60000).toISOString(),
    token,
    timestamp,
    timestamp
  ).run();
  if (acquired.meta.changes) return { acquired: true as const };
  const budget = await stmt(
    env.DB,
    'SELECT not_before FROM provider_budgets WHERE scope=?',
    scope
  ).first<string>('not_before');
  return {
    acquired: false as const,
    availableAt: budget && budget > timestamp ? budget : new Date(Date.now() + 2000).toISOString(),
  };
}
export async function releaseBudget(
  env: Env,
  scope: string,
  token: string,
  retryAfterSeconds?: number
) {
  if (retryAfterSeconds !== undefined) {
    const previous = await stmt(
      env.DB,
      'SELECT consecutive_limits FROM provider_budgets WHERE scope=? AND lease_token=?',
      scope,
      token
    ).first<number>('consecutive_limits');
    const delay = Math.min(3600, Math.max(retryAfterSeconds, 30 * 2 ** Math.min(previous ?? 0, 7)));
    await stmt(
      env.DB,
      'UPDATE provider_budgets SET not_before=?,lease_token=NULL,lease_until=NULL,consecutive_limits=consecutive_limits+1 WHERE scope=? AND lease_token=?',
      new Date(Date.now() + delay * 1000).toISOString(),
      scope,
      token
    ).run();
  } else
    await stmt(
      env.DB,
      'UPDATE provider_budgets SET lease_token=NULL,lease_until=NULL,consecutive_limits=0 WHERE scope=? AND lease_token=?',
      scope,
      token
    ).run();
}
