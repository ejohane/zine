# Small private screenshot increment

Proposed scope: attach a screenshot to an already saved, owned link. Keep that
link's existing item/provider identity. This is smaller than adding standalone
image items to the canonical Library/reader content-type model. Do not reuse
publication-cover uploads, public R2 keys or arbitrary URL ingestion.

## Data and access boundary

Add an owner-scoped `bookmark_attachments` table with ID, owner user ID,
`user_item_id`, object key, MIME, byte count, dimensions, content SHA-256,
idempotency key, creation time and deletion state. Enforce uniqueness of
`(user_id, user_item_id, content_sha256)` and `(user_id, idempotency_key)`.
Use a composite foreign key or equivalent transaction condition to guarantee
the referenced user item belongs to the same owner. A reused idempotency key
with a different content hash must conflict; it must not return the wrong file.

Objects live in private R2 under owner/attachment keys. Keys are opaque and
server-generated. Do not deduplicate across accounts, put attachments on the
globally shared `items` row or copy them into publication selections. GET and
DELETE re-check attachment ownership and the underlying bookmark authorization,
including the independent Gmail provenance guard, before touching R2. Account
and bookmark deletion need object cleanup and tombstone/retry handling.

## Minimal upload/read workflow

1. An authenticated `bookmarks:write` REST upload checks bookmark ownership,
   storage quota and a bounded body before reserving an attachment. Suggested
   first-version limits: PNG/JPEG only, 5 MiB, one image per request, max 12,000
   pixels on either axis and 20 megapixels total after decoding. Those values
   are a proposed bounded policy, not current Zine limits.
2. Validate actual file signatures and decode in a trusted image pipeline. Reject
   SVG, animated formats, archives, mismatched MIME, malformed/truncated images,
   huge pixel counts, decompression bombs and polyglots. Re-encode a single image
   to strip EXIF/GPS and embedded payloads. A decoder/encoder must be available
   to the private Worker and its cost approved; the public-cover Images binding
   must not be silently repurposed.
3. Hash the sanitized output, store it under a generated private R2 key and
   finalize the attachment record transactionally. Define crash recovery between
   D1 and R2; reap abandoned reservations/orphans without deleting committed data.
4. Read through an authenticated proxy with `Cache-Control: private, no-store`
   and `X-Content-Type-Options: nosniff`, using the stored trusted MIME. No public
   URL is created. Delete is owner-scoped, idempotent and coordinated with R2.
5. The MCP tool accepts only the host's documented file-reference object plus a
   bookmark ID and idempotency key. It must use the current official ChatGPT
   file-download contract with its expiry/size checks; this contract needs to be
   verified before implementing the tool. Do not accept arbitrary URL, filesystem
   path, base64/data URI, bucket name or object key as a substitute. Provide a
   regular bounded multipart REST upload for other clients; they must use the
   same private attachment service and authorization.

No OCR, new transcript acquisition, rich UI or publication support is required
for this increment. Screenshot pixels and any later extracted text remain
untrusted source material. A native detail preview is a separate UI increment;
the backend must accurately return attachment availability without claiming
that the current native app already renders it.

## Verification and decisions

Fixtures must cover two accounts, guessed attachment/bookmark IDs, Gmail
publication associations, retry/concurrent duplicate uploads, idempotency-key
conflicts, unsafe file types/signatures, decode limits, expired host references,
quota boundaries, delete/account cleanup and D1/R2 partial failure recovery.
Prove that no public publication or globally shared item projection includes
private object keys, image bytes or attachment metadata.

Before implementation, choose attachment-only versus standalone screenshots,
the per-account quota and retention/deletion rules, and approve any required
image-processing binding/cost. Standalone screenshots additionally require a new
saved content type and canonical native Library/reader behavior. No new storage,
binding, migration, paid service or screenshot tool has been created in this task.
