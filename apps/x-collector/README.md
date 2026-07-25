# X Collector

The browser collector reads visible organic posts from the authenticated X Following timeline or a configured X List and
sends validated batches to the local receiver. Collector version `browser-dom-v4` also captures source provenance, immutable run-linked list membership, and bounded context-only thread posts with explicit completion/truncation status. It retains
outbound links from tweet text and X link cards.

Following is collected to an explicit count target. Favorites/List collection instead uses a persisted rolling 24-hour cutoff and stops only after three older timeline entries prove the boundary. Its default 5000-post limit is a safety guard; reaching it before the boundary produces a partial run rather than a false complete result.

For each destination, the extractor prefers an expanded URL exposed by the DOM, preserves the
observed redirect URL, removes fragments and common tracking parameters for `normalizedUrl`, and
deduplicates text/card appearances within the same post. Card title, description, domain, and image
metadata are retained when visible. Links belonging to a quoted post stay on that quoted canonical
post rather than leaking onto the parent post.

If X exposes only a shortened `t.co` destination, the collector keeps it rather than guessing a
truncated display URL. A later enrichment or recapture can supply the expanded destination.
