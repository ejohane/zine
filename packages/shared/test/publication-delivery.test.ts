import { describe, it, expect } from 'bun:test';
import {
  DeliveryPreferencesSchema,
  DeliveryPreferencesResourceSchema,
  PublicationActivitySchema,
  DiscoveryReferenceSchema,
  IssueVisitSchema,
  PushInstallationInputSchema,
} from '../src/schemas/publication-delivery';
import fixtures from '../src/fixtures/publication-delivery/v1.json';
describe('publication delivery contract fixtures', () => {
  it('resources decode with stable IDs and honest state', () => {
    expect(PublicationActivitySchema.parse(fixtures.activity).type).toBe('DAILY_ADDITIONS');
    expect(DiscoveryReferenceSchema.parse(fixtures.reference).commentary).toBeTruthy();
    expect(IssueVisitSchema.parse(fixtures.visit).lastSeenRevision).toBe(3);
    expect(DeliveryPreferencesResourceSchema.parse(fixtures.preferences).configured).toBe(true);
  });
  it('rejects private fields and server-owned fields in mutations', () => {
    expect(
      PublicationActivitySchema.safeParse({ ...fixtures.activity, recipientId: 'reader' }).success
    ).toBe(false);
    expect(
      DiscoveryReferenceSchema.safeParse({
        ...fixtures.reference,
        rawMetadata: { secret: 'private' },
      }).success
    ).toBe(false);
    expect(DeliveryPreferencesSchema.safeParse({ ...fixtures.preferences }).success).toBe(false);
    expect(
      DeliveryPreferencesSchema.safeParse({ timezone: 'UTC', initializeOnly: true }).success
    ).toBe(true);
    expect(
      PushInstallationInputSchema.safeParse({
        token: 'a'.repeat(64),
        environment: 'sandbox',
        ownerId: 'other',
      }).success
    ).toBe(false);
  });
});
