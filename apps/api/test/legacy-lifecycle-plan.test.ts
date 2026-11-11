import { describe, expect, it } from 'vitest';
import {
  planPriorSave,
  projectLegacyLifecycle,
  projectLegacyProgress,
} from '../scripts/legacy-lifecycle-plan';
import type { LegacyLifecycle, NextLifecycle } from '../scripts/legacy-lifecycle-plan';

const ingestion = '2025-06-01T12:00:00.000Z';
const originalSave = '2025-08-01T12:00:00.123Z';
const importTime = '2026-11-08T12:00:00.000Z';
const laterEdit = '2026-11-10T12:00:00.000Z';
const legacy: LegacyLifecycle = {
  id: 'legacy',
  state: 'BOOKMARKED',
  created_at: ingestion,
  ingested_at: ingestion,
  updated_at: originalSave,
  bookmarked_at: originalSave,
  archived_at: null,
};
const imported: NextLifecycle = {
  id: 'next',
  status: 'saved',
  archived: 0,
  saved_at: importTime,
  decision_at: importTime,
};
const receipt = { item_id: 'next', created_at: importTime };

describe('legacy lifecycle migration planning', () => {
  it('corrects the exact synthetic timestamp and converges on repeat planning', () => {
    expect(planPriorSave(legacy, imported, receipt)).toBe('correct-import-date');
    const plan = projectLegacyLifecycle(legacy);
    expect(plan.savedAt).toBe(originalSave);
    expect(
      planPriorSave(
        legacy,
        { ...imported, saved_at: plan.savedAt, decision_at: plan.decisionAt },
        receipt
      )
    ).toBe('already-reconciled');
  });

  it('requires a matching receipt and preserves a later archive or resave', () => {
    expect(planPriorSave(legacy, imported, { ...receipt, item_id: 'unrelated' })).toBe(
      'review-missing-receipt'
    );
    expect(
      planPriorSave(legacy, { ...imported, archived: 1, decision_at: laterEdit }, receipt)
    ).toBe('preserve-next-decision');
    expect(
      planPriorSave(legacy, { ...imported, saved_at: laterEdit, decision_at: laterEdit }, receipt)
    ).toBe('preserve-next-decision');
  });

  it('preserves archive and receive semantics without fabricating a saved date', () => {
    const inbox = { ...legacy, state: 'INBOX', bookmarked_at: null } as const;
    expect(projectLegacyLifecycle(inbox)).toMatchObject({
      status: 'received',
      savedAt: null,
      decisionAt: ingestion,
    });
    const archived = { ...inbox, state: 'ARCHIVED', archived_at: laterEdit } as const;
    expect(projectLegacyLifecycle(archived)).toMatchObject({
      status: 'dismissed',
      savedAt: null,
      decisionAt: laterEdit,
    });
    expect(projectLegacyLifecycle({ ...archived, bookmarked_at: originalSave })).toMatchObject({
      status: 'saved',
      archived: 1,
      savedAt: originalSave,
      decisionAt: laterEdit,
    });
  });

  it('retains seconds and the original completion time independently', () => {
    expect(
      projectLegacyProgress({
        progress_position: 0,
        progress_duration: 120,
        progress_updated_at: laterEdit,
        is_finished: 1,
        finished_at: originalSave,
      })
    ).toEqual({ position: 0, unit: 'seconds', completedAt: originalSave, updatedAt: laterEdit });
  });
});
