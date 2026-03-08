# Event Taxonomy

This catalog covers the event names introduced by the phase-1 observability slice for issue `#98`.

## Naming Rule

Use:

```text
<domain>.<operation>.<phase>
```

## HTTP

- `http.request.completed`
- `http.request.failed`

## Async Sync

- `subscriptions.sync.accepted`
- `subscriptions.sync.queued`
- `subscriptions.sync.fallback`
- `subscriptions.sync.fallback.completed`
- `subscriptions.sync.fallback.failed`
- `subscriptions.sync.batch.started`
- `subscriptions.sync.user_batch.started`
- `subscriptions.sync.provider.unavailable`
- `subscriptions.sync.subscription_missing`
- `subscriptions.sync.provider.failed`
- `subscriptions.sync.retry`

## DLQ

- `subscriptions.sync.dlq.batch_received`
- `subscriptions.sync.dlq.malformed`
- `subscriptions.sync.dlq.message_failed`
- `subscriptions.sync.dlq.batch_stored`

## Required Correlation Fields

All async sync events should include, when available:

- `traceId`
- `requestId`
- `clientRequestId`
- `jobId`
- `provider`
- `subscriptionId`

## Release Fields

When available, include:

- `release.version`
- `release.gitSha`
- `release.buildId`
- `release.deployedAt`
- `release.channel`
- `release.ring`
