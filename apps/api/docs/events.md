# Events and signed webhooks

`GET /v1/events?cursor=0&limit=50` replays owner events in sequence order. Persist
`nextCursor`; use `hasMore` to drain available pages, then poll from that cursor.
Events are retained for 30 days. An expired nonzero cursor returns
`410 event_cursor_expired`; reconcile authoritative library state and restart.
Sequences are strings and may have gaps. They are change receipts, not a complete
historical snapshot of every field.

D1 triggers record item creation/revision/lifecycle, new context, progress,
contributions, job status, subscription creation/poll/settings and operational-alert
changes in the same transaction as those writes. A rollback leaves no event.
Payloads contain IDs, field/status labels and revision information rather than
saved text, URLs, transcripts or credential values. Fetch the current authorized
resource when an experience needs its contents. Context edits, annotations and
collection-specific events are not yet separate event types.

Create a webhook with `POST /v1/webhooks {"url":"https://YOUR_RECEIVER/hook"}`.
The signing secret is returned once. List metadata with `GET /v1/webhooks`; secrets
are stored in owner/purpose-bound authenticated encryption and never listed.
Destinations must be public HTTPS DNS names. DNS is checked before delivery;
credentials/cookies are not forwarded, redirects are rejected, timeouts are
bounded and receiver response bodies are discarded. DNS checks do not constitute
a general proof against every possible DNS rebinding/network-layer attack.

A new webhook starts with future events. Delivery fanout is durable and deduplicated
by webhook/event. The scheduler fans out at most 100 events per selected webhook,
rotates through 25 enabled webhooks per invocation, and attempts up to 25 due
deliveries. Cron runs every five minutes, so delivery/retry timing includes that
cadence and backlog. `POST /v1/webhooks/{id}/dispatch` requests up to five due
attempts immediately; it honors retry timestamps and quotas.

Requests contain:

- `X-Zine-Delivery`: stable delivery ID.
- `X-Zine-Timestamp`: Unix seconds for this attempt.
- `X-Zine-Signature`: `v1=` plus lowercase HMAC-SHA256 hex.
- JSON body: `{ "deliveryId": "...", "event": { ... } }`.

Verify the signature over the exact bytes of `timestamp + "." + rawBody` using the
secret. Use a constant-time verification primitive, reject timestamps outside a
short tolerance (the proof receiver uses five minutes), and durably deduplicate by
delivery ID before applying effects. A retry keeps the delivery ID/body and gets a
new timestamp/signature. HTTP 2xx acknowledges receipt.

Delivery is **at least once**. A receiver may apply an effect while its response is
lost; Zine will retry. Leases prevent concurrent normal attempts, but a crashed or
expired worker can still produce repeated external effects. No exactly-once claim
is made. Failed delivery retries exponentially from one minute to one hour and
stops after eight attempts. `GET /v1/webhooks/{id}/deliveries` pages attempt state;
`POST /v1/webhooks/{id}/deliveries/{deliveryId}/retry` resets a failed owned delivery.
Daily delivery quotas defer work without consuming failure attempts.

`PATCH /v1/webhooks/{id} {"enabled":false}` cancels pending/in-flight local state.
Re-enabling starts at the current sequence and skips changes during the disabled
window. Delete/recreate to rotate the secret or change a destination. Account
erasure removes events, webhooks and deliveries, and generation/lease checks fence
work across awaits. A request already sent to an external receiver cannot be
recalled. A webhook that falls behind retained history is disabled with
`event_retention_gap`; reconcile the library before enabling it again.

`events:read` permits replay; `webhooks:manage` permits configuration, history,
manual dispatch and retries. Interactive Clerk sessions retain user capabilities.
The live proof receiver is a separate Worker/database. It stores hashes, timestamps
and counts, intentionally fails a first verified delivery, and requires a separate
read token for receipts. It is verification infrastructure, not an external
notification service.
