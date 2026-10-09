import { describe, it, expect } from 'bun:test';
import fixtures from '../src/fixtures/publications/v1.json';
import {
  PublicIssueSchema,
  OwnerIssueSchema,
  PublicPublicationSchema,
  PublicationEventSchema,
  PublicationErrorSchema,
  PublicationAvailabilitySchema,
  PatchIssueSchema,
  CreatePublicationSchema,
} from '../src/schemas/publications';
describe('publication contracts v1', () => {
  it('decodes versioned public, owner, event and error fixtures', () => {
    expect(PublicIssueSchema.parse(fixtures.publicIssue).kind).toBe('INDEPENDENT');
    expect(PublicIssueSchema.parse(fixtures.weeklyIssue).kind).toBe('WEEKLY');
    expect(OwnerIssueSchema.parse(fixtures.ownerDraft).status).toBe('DRAFT');
    expect(PublicPublicationSchema.parse(fixtures.publicPublication).editor.displayName).toBe(
      'Example Editor'
    );
    expect(PublicationEventSchema.parse(fixtures.event).cursor).toBe(1);
    expect(PublicationErrorSchema.parse(fixtures.conflict).code).toBe('REVISION_CONFLICT');
    expect(PublicationAvailabilitySchema.parse(fixtures.tombstone).available).toBe(false);
  });
  it('rejects private fields and malformed mutation identities', () => {
    expect(
      PublicIssueSchema.safeParse({ ...fixtures.publicIssue, ownerId: 'private' }).success
    ).toBe(false);
    const copy = structuredClone(fixtures.publicIssue);
    Object.assign(copy.sections[0].selections[0], { bookmarkId: 'private' });
    expect(PublicIssueSchema.safeParse(copy).success).toBe(false);
    expect(
      PatchIssueSchema.safeParse({
        expectedRevision: 1,
        operations: [
          { type: 'addSelection', selectionId: 'wrong', sectionId: 'wrong', bookmarkId: 'owned' },
        ],
      }).success
    ).toBe(false);
  });
  it('normalizes text and applies codepoint limits', () => {
    const base = {
      editorName: '  Editor  ',
      displayName: null,
      description: null,
      coverAssetId: null,
    };
    expect(CreatePublicationSchema.parse(base).editorName).toBe('Editor');
    expect(
      CreatePublicationSchema.safeParse({ ...base, editorName: '😀'.repeat(81) }).success
    ).toBe(false);
  });
});
