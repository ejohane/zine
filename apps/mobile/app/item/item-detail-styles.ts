import { StyleSheet } from 'react-native';

import { Typography, Spacing, Radius } from '@/constants/theme';

// ============================================================================
// Styles
// ============================================================================

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  animatedContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },

  // Cover Image
  parallaxCoverImage: {
    width: '100%',
    height: '100%',
  },
  coverContainer: {
    width: '100%',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Floating Header
  floatingHeader: {
    position: 'absolute',
    left: Spacing.xl,
    right: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Badges Row
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  // Content
  contentContainer: {
    padding: Spacing.xl,
  },
  title: {
    ...Typography.headlineMedium,
    marginBottom: Spacing.md,
  },

  // Source Row
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  sourceThumbnail: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
  },
  sourcePlaceholder: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceName: {
    ...Typography.labelLarge,
    marginRight: Spacing.xs,
  },

  // Clickable Creator Row (when creatorId exists)
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  creatorThumbnail: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
  },
  creatorPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorInitial: {
    ...Typography.bodySmall,
    fontWeight: '600',
  },
  creatorName: {
    ...Typography.labelLarge,
    fontWeight: '500',
    marginRight: Spacing.xs,
  },

  // Meta Row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: Spacing.lg,
  },
  metaText: {
    ...Typography.bodySmall,
  },
  metaDot: {
    ...Typography.bodySmall,
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingLeft: Spacing.xl,
    paddingRight: Spacing.xl + Spacing.sm,
  },
  actionRowLeft: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconActionButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Description
  descriptionContainer: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  descriptionLabel: {
    ...Typography.titleLarge,
    marginBottom: Spacing.sm,
  },
  description: {
    ...Typography.bodyMedium,
    lineHeight: 24,
  },
});

// ============================================================================
// X Post Styles
// ============================================================================

export const xPostStyles = StyleSheet.create({
  // Tweet content section - Twitter-like layout
  tweetContentSection: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  tweetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tweetAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    marginRight: Spacing.md,
  },
  tweetContentRight: {
    flex: 1,
  },
  tweetAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
  },
  tweetAuthorName: {
    ...Typography.labelLarge,
    marginRight: Spacing.xs,
  },
  tweetAuthorHandle: {
    ...Typography.bodyMedium,
    marginRight: Spacing.xs,
  },
  tweetTimestamp: {
    ...Typography.bodyMedium,
  },
  postText: {
    ...Typography.bodyLarge,
    lineHeight: 26,
  },
});
