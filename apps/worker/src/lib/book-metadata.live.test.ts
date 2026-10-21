import { describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchLinkPreview } from './link-preview';

// Gmail's Node-only SDK is unrelated to book previews. Network fetch stays real.
vi.mock('googleapis', () => ({ google: {} }));

// Opt-in network proof; ordinary CI must not depend on a publisher's availability.
describe.skipIf(!(env as unknown as { BOOK_LIVE_PROOF: boolean }).BOOK_LIVE_PROOF)(
  'live publisher book extraction',
  () => {
    it('fetches the actual shared publisher page with the production preview pipeline', async () => {
      const url =
        'https://www.penguinrandomhouse.com/books/57757/the-inner-game-of-tennis-50th-anniversary-edition-by-w-timothy-gallwey/9780307758859/';
      const preview = await fetchLinkPreview(url);
      expect(preview).toMatchObject({
        provider: 'WEB',
        contentType: 'BOOK',
        source: 'book_page',
        title: 'The Inner Game of Tennis',
        creator: 'W. Timothy Gallwey',
        thumbnailUrl: 'https://images.penguinrandomhouse.com/cover/9780307758859',
        hasArticleContent: false,
      });
      expect(preview?.description).toContain('relaxed concentration');
      expect(JSON.parse(preview!.rawMetadata!).book.isbn).toBe('9780307758859');
      console.log('LIVE_BOOK_PREVIEW', JSON.stringify(preview));
    }, 30000);
  }
);
