import assert from 'node:assert/strict';

export function rollbackReleaseSha(bindings: { type: string; name: string; text?: string }[]) {
  const sha = bindings.find((b) => b.type === 'plain_text' && b.name === 'RELEASE_SHA')?.text;
  assert.match(
    sha ?? '',
    /^[a-f0-9]{40}$/,
    'Production rollback requires a tagged reviewed release'
  );
  return sha!;
}

export function assertProductionRollbackReceipt(
  receipt: {
    environment: string;
    worker: string;
    sourceSha: string;
    deploymentId: string;
    checks: { exactServingSource: boolean; activeVersionAt100Percent: boolean };
    migrations: { name: string }[];
  },
  version: string,
  sourceSha: string
) {
  assert.equal(receipt.environment, 'production');
  assert.equal(receipt.worker, 'zine-api-next');
  assert.equal(receipt.deploymentId, version);
  assert.equal(receipt.sourceSha, sourceSha);
  assert.equal(receipt.checks.exactServingSource, true);
  assert.equal(receipt.checks.activeVersionAt100Percent, true);
  for (const name of [
    '0018_token_scopes.sql',
    '0019_usage_controls.sql',
    '0020_operations.sql',
    '0021_events_webhooks.sql',
    '0022_release_integrity.sql',
    '0023_owner_event_retention.sql',
  ])
    assert.ok(
      receipt.migrations.some((m) => m.name === name),
      'Unsafe rollback policy floor: ' + name
    );
}
