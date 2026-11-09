import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertProductionRollbackReceipt, rollbackReleaseSha } from '../scripts/rollback-policy';
const receipt = JSON.parse(readFileSync('evidence/production-release.json', 'utf8'));
const validate = (value: typeof receipt) =>
  assertProductionRollbackReceipt(value, receipt.deploymentId, receipt.sourceSha);
describe('production rollback policy floor', () => {
  it('accepts the observed reviewed production receipt', () =>
    expect(() => validate(receipt)).not.toThrow());
  it('rejects an untagged pre-scope build', () => expect(() => rollbackReleaseSha([])).toThrow());
  it('rejects a receipt for a different Worker version', () =>
    expect(() => validate({ ...receipt, deploymentId: crypto.randomUUID() })).toThrow());
  it('rejects a receipt for a different source', () =>
    expect(() => validate({ ...receipt, sourceSha: 'f'.repeat(40) })).toThrow());
  it('rejects a staging receipt', () =>
    expect(() => validate({ ...receipt, environment: 'staging' })).toThrow());
  it('rejects a pre-scope migration set', () =>
    expect(() =>
      validate({
        ...receipt,
        migrations: receipt.migrations.filter(
          (m: { name: string }) => m.name !== '0018_token_scopes.sql'
        ),
      })
    ).toThrow());
});
