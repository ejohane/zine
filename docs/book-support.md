# Publisher book links

Zine recognizes Penguin Random House book detail links as `BOOK` content when
its public page exposes a JSON-LD `Book` with a title and author. Recognition is
limited to HTTPS book detail paths on `penguinrandomhouse.com` and
`www.penguinrandomhouse.com`. Other sites and missing or malformed metadata keep
the existing ordinary-link fallback.

Book previews use the structured book's cover before generic Open Graph artwork,
which can advertise a different edition. They preserve the shared edition URL,
remove existing tracking parameters, fragments, and the final slash, and store the ISBN in
raw metadata. This is URL-based identity, not cross-store or cross-edition
matching.

The existing REST save flow, creator relation, Library filters, tags, finished
state, and native cache support books. Native Library offers a Books filter;
book details show the cover, author, synopsis, and an Open book page action.
Books do not enter the article reader or receive an article reading-time estimate.
The share extension shows the Book label and preserves the cover's proportions.

## Automated verification

Deterministic extraction tests retain public metadata captured from the shared
Inner Game of Tennis publisher page. API integration tests use isolated D1 and
exercise book saving, filtering, tags, duplicate handling, and completion.

```sh
bun run --cwd apps/worker test:run \
  src/lib/book-metadata.test.ts \
  src/lib/opengraph.test.ts \
  src/lib/link-preview.test.ts \
  src/routes/api-v1.integration.test.ts \
  src/routes/api-v1.test.ts
bun run test:native:core
bun run native:agent scenario run all
```

Two opt-in checks fetch the actual publisher page. The REST check uses actual
PAT verification and isolated D1, then reads back the persisted book and its
completion. Its preview mock delegates to the real preview implementation;
network fetch and book metadata extraction are real. Unrelated Node-only Google
SDK loading and the tRPC Clerk verifier remain test doubles. These checks do not
prove native Clerk sign-in, Safari sharing, or rendered UI.

```sh
ZINE_BOOK_LIVE_PROOF=1 bun run --cwd apps/worker test:run \
  src/lib/book-metadata.live.test.ts
ZINE_BOOK_LIVE_PROOF=1 bun run --cwd apps/worker test:run \
  src/routes/api-v1.integration.test.ts -t 'LIVE:'
```

## Native acceptance journey

Use the authenticated local workflow in [local-development.md](local-development.md).
Confirm both installed bundles target the local API before any writes.

1. Open the following page in Simulator Safari and share it into Zine:
   <https://www.penguinrandomhouse.com/books/57757/the-inner-game-of-tennis-50th-anniversary-edition-by-w-timothy-gallwey/9780307758859/>.
2. Confirm a Book preview with W. Timothy Gallwey and the ebook cover. Save it.
3. Open Library, select Books, and open the saved book. Confirm the cover, author,
   synopsis, and Open book page action in both appearances.
4. Open the publisher page, return to Zine, add a tag, and mark the book complete.
5. Relaunch Zine. Include finished items and confirm the book, tag, and completed
   state remain. Inspect the local saved record independently.
6. Smoke-test an existing article's detail and reader.

Build, install, launch, interaction, and visible final state are separate evidence
claims. The automated checks above do not replace this journey.
