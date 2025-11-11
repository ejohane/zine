# Architecture Decision Record: Two-Tier Creator Model

**Status:** Proposed  
**Date:** 2025-01-09  
**Decision Makers:** Engineering Team  
**Consulted:** Product, Design  

---

## Context and Problem Statement

We are implementing creator reconciliation to deduplicate creators across platforms (YouTube, Spotify). The initial design treated all subscriptions (YouTube channels, Spotify shows) as equivalent "creators" and attempted to reconcile them using name matching.

**Problem Discovered:** YouTube channels and Spotify shows are fundamentally different entity types:

- **YouTube Channel**: A creator's content hub that can host any type of content (podcast episodes, vlogs, clips, tutorials, etc.)
  - Example: "@PowerfulJRE" hosts Joe Rogan's podcast clips plus other content
  - Has a creator identity: handle, subscribers, verification
  
- **Spotify Show**: A specific podcast series
  - Example: "The Joe Rogan Experience" is just the podcast
  - Attributed to a publisher, but isn't itself a "creator"

**Why the Single-Tier Model Fails:**

1. **Name Mismatch**: "PowerfulJRE" (channel) vs "The Joe Rogan Experience" (show) → reconciliation fails
2. **Semantic Confusion**: Treating a channel and a show as equivalent "creators" is incorrect
3. **Lost Metadata**: Channel-specific and show-specific metadata gets conflated
4. **User Confusion**: Users see duplicate "creators" for the same person
5. **Cannot Group**: Cannot show "all content from Joe Rogan" when they're separate creators

**Real User Impact:**
- User subscribes to Joe Rogan on YouTube: sees "PowerfulJRE" as creator
- User subscribes to Joe Rogan on Spotify: sees "The Joe Rogan Experience" as different creator
- Feed shows two separate creators for the same person
- Cannot filter/group by actual creator

---

## Decision Drivers

### Must Have
- ✅ Accurate representation of real-world entities
- ✅ Cross-platform creator reconciliation
- ✅ User can group content by creator (person/brand)
- ✅ Support multiple shows/channels per creator
- ✅ Preserve platform-specific metadata

### Should Have
- ✅ Cross-platform content discovery
- ✅ Content deduplication detection
- ✅ Backward compatible migration
- ✅ Extensible to new platforms

### Nice to Have
- Creator-level subscriptions
- Multi-creator content (collaborations)
- Creator analytics

---

## Considered Options

### Option 1: Single-Tier Model (Original Design)

**Description**: Treat subscriptions as creators, use fuzzy name matching

**Pros:**
- Simple data model
- Easy to implement
- No migration needed

**Cons:**
- ❌ Semantically incorrect (channels ≠ shows ≠ creators)
- ❌ Name matching fails for different titles
- ❌ Creates duplicate creators
- ❌ Cannot group by actual creator
- ❌ Lost platform-specific metadata
- ❌ Not extensible

**Verdict:** REJECTED - Fundamentally flawed approach

---

### Option 2: Two-Tier Model (Proposed)

**Description**: Separate content sources (channels/shows) from creators (people/brands)

```
Subscriptions → Content Sources → Creators → Content
```

**Pros:**
- ✅ Architecturally correct
- ✅ Matches real-world semantics
- ✅ Enables cross-platform reconciliation
- ✅ Preserves all metadata
- ✅ Supports multiple sources per creator
- ✅ Extensible to new platforms
- ✅ Enables new features (cross-platform discovery, deduplication)

**Cons:**
- ⚠️ More complex data model
- ⚠️ Requires migration
- ⚠️ More implementation effort (6-7 weeks)
- ⚠️ More complex queries

**Verdict:** ACCEPTED - Correct solution despite complexity

---

### Option 3: Hybrid Approach

**Description**: Keep single tier but add "source type" field

**Pros:**
- Simpler than two-tier
- Some differentiation between sources

**Cons:**
- ❌ Still conflates sources with creators
- ❌ Doesn't solve reconciliation problem
- ❌ Doesn't enable creator grouping
- ❌ Band-aid on fundamental issue

**Verdict:** REJECTED - Doesn't solve core problem

---

### Option 4: Do Nothing

**Description**: Accept duplicate creators, don't reconcile

**Pros:**
- No implementation effort

**Cons:**
- ❌ Poor user experience
- ❌ Data quality issues
- ❌ Cannot implement creator-based features
- ❌ Technical debt

**Verdict:** REJECTED - Unacceptable user experience

---

## Decision Outcome

**Chosen option:** Option 2 - Two-Tier Model

### Rationale

Despite the increased complexity, the two-tier model is the only option that:
1. **Correctly models reality**: Channels/shows are not creators
2. **Solves the reconciliation problem**: Can extract and match actual creators
3. **Enables key features**: Creator grouping, cross-platform discovery
4. **Is future-proof**: Supports new platforms, content types, relationships

The single-tier model is fundamentally flawed because it forces an incorrect semantic mapping. This is not a case of "simpler is better" - the simpler model is **wrong**.

### Implementation Strategy

**Phased approach to minimize risk:**

1. **Week 1-2**: Add new tables (backward compatible, no breaking changes)
2. **Week 2-3**: Migrate data (populate content_sources from subscriptions)
3. **Week 3-4**: Implement creator extraction and reconciliation
4. **Week 4-5**: Update feed polling to use new model
5. **Week 5-6**: UI updates (creator grouping, cross-platform badges)
6. **Week 6-7**: Cleanup and optimization

**Risk Mitigation:**
- Full database backup before migration
- Staging environment testing
- Incremental rollout (beta → full)
- Rollback capability at each stage
- Monitoring and alerting

---

## Consequences

### Positive

**For Users:**
- ✅ See all content from a creator, regardless of platform
- ✅ Discover that creator is on multiple platforms
- ✅ No more duplicate creators
- ✅ Better filtering and organization
- ✅ Cross-platform content discovery

**For Product:**
- ✅ Accurate data model enables new features
- ✅ Creator-based recommendations
- ✅ Content deduplication
- ✅ Platform-agnostic creator profiles
- ✅ Extensible to new content types

**For Engineering:**
- ✅ Clear separation of concerns
- ✅ Platform-specific handling
- ✅ Flexible reconciliation logic
- ✅ Future-proof architecture

### Negative

**Short-term:**
- ⚠️ 6-7 weeks implementation time
- ⚠️ Complex migration
- ⚠️ More complex queries
- ⚠️ Learning curve for team

**Long-term:**
- ⚠️ Additional table to maintain
- ⚠️ More complex data model
- ⚠️ Potential for inconsistencies if not careful

### Mitigations for Negatives

- **Implementation time**: Phased approach allows incremental value
- **Complex migration**: Extensive testing, rollback capability
- **Complex queries**: Proper indexes, query optimization
- **Learning curve**: Good documentation, team training
- **Maintenance**: Clear ownership, automated tests
- **Inconsistencies**: Database constraints, validation logic

---

## Implementation Details

### Database Schema

**New Table:**
```sql
CREATE TABLE content_sources (
  id TEXT PRIMARY KEY,              -- youtube:UCxxx or spotify:4rOoJ
  external_id TEXT NOT NULL,
  platform TEXT NOT NULL,           -- youtube, spotify, rss
  source_type TEXT NOT NULL,        -- channel, show, playlist
  title TEXT NOT NULL,
  creator_id TEXT,                  -- Links to creators
  -- ... additional fields
);
```

**Enhanced Table:**
```sql
ALTER TABLE creators ADD COLUMN alternative_names TEXT;    -- JSON array
ALTER TABLE creators ADD COLUMN platform_handles TEXT;     -- JSON object
ALTER TABLE creators ADD COLUMN content_source_ids TEXT;   -- JSON array
```

**Relationships:**
```
subscriptions → content_sources → creators
                     ↓
                  content
```

### API Changes

**New endpoints:**
- `GET /api/content-sources/:id`
- `GET /api/users/:userId/content-sources`

**Enhanced endpoints:**
- `GET /api/creators/:id?include=content_sources`
- `GET /api/users/:userId/feed?groupBy=creator`

### UI Changes

**Mobile:**
- Feed grouping by creator option
- Cross-platform badges ("Also on Spotify")
- Creator profile view with all sources
- Creator filter

**Web:**
- Same features as mobile
- Creator discovery section

---

## Validation

### Success Metrics

**Technical:**
- [ ] 95%+ subscriptions have linked content sources
- [ ] 90%+ content sources linked to creators
- [ ] Creator reconciliation accuracy >95%
- [ ] API response time <200ms
- [ ] Zero data loss

**User Experience:**
- [ ] 80%+ users understand creator grouping
- [ ] 70%+ users find cross-platform discovery valuable
- [ ] User engagement increases 15%
- [ ] Time to find content decreases

**Business:**
- [ ] Cross-platform discovery drives 10% more subscriptions
- [ ] User satisfaction score improves
- [ ] Support tickets about duplicates decrease

### Acceptance Criteria

- [ ] All subscriptions migrated to content sources
- [ ] Creator extraction works for YouTube and Spotify
- [ ] Creator reconciliation matches >95% correctly
- [ ] Feed can be grouped by creator
- [ ] Cross-platform badges show correctly
- [ ] No performance degradation
- [ ] All tests pass
- [ ] Documentation complete

---

## Alternative Considered: Manual Creator Linking

We could let users manually link creators across platforms instead of automated reconciliation.

**Pros:**
- 100% accuracy (user-driven)
- Simple implementation

**Cons:**
- Poor UX (extra work for users)
- Most users won't do it
- Doesn't scale
- Still need two-tier model anyway

**Decision:** Use automated reconciliation with manual override capability (future)

---

## Related Decisions

- **Creator Extraction Strategy**: Extract from platform metadata (channel owner, show publisher)
- **Creator ID Format**: Use first-seen platform ID with "creator:" prefix for clarity
- **Matching Thresholds**: >95% for auto-match, 75-95% for manual review
- **Primary Platform**: Most subscribers or first-seen
- **Alternative Names**: Store all variations for better matching

---

## References

- [Two-Tier Creator Model - Full Design](./TWO_TIER_CREATOR_MODEL.md)
- [Summary Document](./SUMMARY.md)
- [Comparison: Single vs Two-Tier](./COMPARISON.md)
- [Original Single-Tier Design](./DESIGN.md) (superseded)
- YouTube API Documentation
- Spotify API Documentation

---

## Notes

**Key Insight**: The problem isn't that creator reconciliation is hard - it's that we were trying to reconcile the wrong things. YouTube channels and Spotify shows are not equivalent entities. Once we separate content sources from creators, reconciliation becomes straightforward.

**Quote from discussion:**
> "What I notice a lot on YouTube is that people will create a channel with their name or something else, and then they'll put episodes of their podcasts on their channel, but on Spotify you don't really see the same thing. It's only their podcast shows."

This observation correctly identifies that the two platforms have fundamentally different content organization models, which our data model must respect.

---

## Approval

- [ ] Engineering Lead
- [ ] Product Manager
- [ ] Tech Lead
- [ ] Senior Engineers

---

**Last Updated:** 2025-01-09  
**Document Owner:** Engineering Team  
**Next Review:** After Stage 1 implementation
