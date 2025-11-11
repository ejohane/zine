-- Migration: Enhance creators table with two-tier model fields
-- Part of the Two-Tier Creator Model implementation
-- 
-- This migration adds fields to support cross-platform creator reconciliation:
-- - Alternative names for fuzzy matching
-- - Platform-specific handles
-- - Content source tracking
-- - Verification and confidence metadata
--
-- See: docs/features/creator-reconciliation/TWO_TIER_CREATOR_MODEL.md

-- Add alternative_names: JSON array of alternate names for this creator
-- Used for fuzzy matching (e.g., ["PowerfulJRE", "Joe Rogan", "JRE"])
ALTER TABLE creators ADD COLUMN alternative_names TEXT;

-- Add platform_handles: JSON object mapping platforms to handles
-- (e.g., {"youtube": "@PowerfulJRE", "twitter": "@joerogan"})
ALTER TABLE creators ADD COLUMN platform_handles TEXT;

-- Add content_source_ids: JSON array of associated ContentSource IDs
-- Links creators to their content sources across platforms
ALTER TABLE creators ADD COLUMN content_source_ids TEXT;

-- Add primary_platform: The platform where this creator is most active
-- (e.g., "youtube", "spotify")
ALTER TABLE creators ADD COLUMN primary_platform TEXT;

-- Add total_subscribers: Aggregated subscriber count across all platforms
ALTER TABLE creators ADD COLUMN total_subscribers INTEGER;

-- Add reconciliation_confidence: Confidence score (0-1) for creator matches
-- Used to flag low-confidence matches for manual review
ALTER TABLE creators ADD COLUMN reconciliation_confidence REAL;

-- Add manually_verified: Boolean flag indicating human verification
-- Set to 1 when a human confirms the creator consolidation is correct
ALTER TABLE creators ADD COLUMN manually_verified INTEGER DEFAULT 0;

-- Add verified: Boolean flag indicating verification on any platform
-- This field may already exist; if so, this line will fail but can be ignored
-- ALTER TABLE creators ADD COLUMN verified INTEGER DEFAULT 0;
