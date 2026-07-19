# X Collector

The browser collector reads visible organic posts from the authenticated X Following timeline and
sends validated batches to the local receiver. Collector version `browser-dom-v3` also captures
outbound links from tweet text and X link cards.

For each destination, the extractor prefers an expanded URL exposed by the DOM, preserves the
observed redirect URL, removes fragments and common tracking parameters for `normalizedUrl`, and
deduplicates text/card appearances within the same post. Card title, description, domain, and image
metadata are retained when visible. Links belonging to a quoted post stay on that quoted canonical
post rather than leaking onto the parent post.

If X exposes only a shortened `t.co` destination, the collector keeps it rather than guessing a
truncated display URL. A later enrichment or recapture can supply the expanded destination.
