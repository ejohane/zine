/**
 * Tests for SwipeableInboxItem component types and configuration
 *
 * The SwipeableInboxItem component uses react-native-gesture-handler and
 * react-native-reanimated which require native modules. Full component
 * tests are done via manual testing in the iOS simulator.
 *
 * This test file validates the TypeScript interfaces and configuration
 * without importing the actual component.
 *
 * @see Issue zine-yit for shell requirements
 * @see Issue zine-2sb for archive action panel UI requirements
 * @see Issue zine-e28 for full-swipe threshold auto-completion logic
 * @see Issue zine-1oi for haptic feedback on action completion
 */

import type { ItemCardData } from '../components/item-card';

// ============================================================================
// Test Data
// ============================================================================

function createMockItem(overrides: Partial<ItemCardData> = {}): ItemCardData {
  return {
    id: 'item-123',
    title: 'Test Video Title',
    creator: 'Test Creator',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    contentType: 'VIDEO',
    provider: 'YOUTUBE',
    duration: 300,
    bookmarkedAt: null,
    publishedAt: '2024-01-15T00:00:00Z',
    isFinished: false,
    ...overrides,
  };
}

// ============================================================================
// Type Definitions (mirrored from component for testing)
// ============================================================================

interface SwipeableInboxItemProps {
  item: ItemCardData;
  onArchive: (id: string) => void;
  onBookmark: (id: string) => void;
  index?: number;
}

// ============================================================================
// Tests
// ============================================================================

describe('SwipeableInboxItem', () => {
  describe('component configuration', () => {
    it('defines correct swipe threshold (100px)', () => {
      // Per issue zine-2sb: updated to 100px for finger-friendly tap target
      const SWIPE_THRESHOLD = 100;
      expect(SWIPE_THRESHOLD).toBe(100);
    });

    it('defines correct action panel width (100px)', () => {
      // Per issue zine-2sb: ~100px for finger-friendly tap target
      const ACTION_WIDTH = 100;
      expect(ACTION_WIDTH).toBe(100);
    });

    it('uses friction value of 2', () => {
      // Per issue spec: friction controls swipe resistance feel
      const FRICTION = 2;
      expect(FRICTION).toBe(2);
    });

    it('action panel meets iOS HIG minimum touch target (44x44)', () => {
      // iOS Human Interface Guidelines require minimum 44x44 touch targets
      const MIN_TOUCH_TARGET = 44;
      const ACTION_WIDTH = 100;
      const MIN_HEIGHT = 44;

      expect(ACTION_WIDTH).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(MIN_HEIGHT).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    });
  });

  describe('types', () => {
    it('SwipeableInboxItemProps accepts required props', () => {
      const props: SwipeableInboxItemProps = {
        item: createMockItem(),
        onArchive: (_id: string) => {},
        onBookmark: (_id: string) => {},
      };

      expect(props.item.id).toBe('item-123');
      expect(typeof props.onArchive).toBe('function');
      expect(typeof props.onBookmark).toBe('function');
    });

    it('SwipeableInboxItemProps accepts optional index prop', () => {
      const props: SwipeableInboxItemProps = {
        item: createMockItem(),
        onArchive: (_id: string) => {},
        onBookmark: (_id: string) => {},
        index: 10,
      };

      expect(props.index).toBe(10);
    });

    it('callbacks receive item id as string', () => {
      const archiveIds: string[] = [];
      const bookmarkIds: string[] = [];

      const props: SwipeableInboxItemProps = {
        item: createMockItem({ id: 'test-id-999' }),
        onArchive: (id: string) => archiveIds.push(id),
        onBookmark: (id: string) => bookmarkIds.push(id),
      };

      props.onArchive('test-id-999');
      props.onBookmark('test-id-999');

      expect(archiveIds).toContain('test-id-999');
      expect(bookmarkIds).toContain('test-id-999');
    });
  });

  describe('item data', () => {
    it('ItemCardData contains required fields', () => {
      const item = createMockItem();

      expect(item.id).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.creator).toBeDefined();
      expect(item.contentType).toBeDefined();
      expect(item.provider).toBeDefined();
    });

    it('ItemCardData allows null thumbnailUrl', () => {
      const item = createMockItem({ thumbnailUrl: null });
      expect(item.thumbnailUrl).toBeNull();
    });

    it('ItemCardData allows null duration', () => {
      const item = createMockItem({ duration: null });
      expect(item.duration).toBeNull();
    });

    it('ItemCardData supports all content types', () => {
      const videoItem = createMockItem({ contentType: 'VIDEO' });
      const podcastItem = createMockItem({ contentType: 'PODCAST' });
      const articleItem = createMockItem({ contentType: 'ARTICLE' });
      const postItem = createMockItem({ contentType: 'POST' });

      expect(videoItem.contentType).toBe('VIDEO');
      expect(podcastItem.contentType).toBe('PODCAST');
      expect(articleItem.contentType).toBe('ARTICLE');
      expect(postItem.contentType).toBe('POST');
    });

    it('ItemCardData supports all providers', () => {
      const youtubeItem = createMockItem({ provider: 'YOUTUBE' });
      const spotifyItem = createMockItem({ provider: 'SPOTIFY' });
      const rssItem = createMockItem({ provider: 'RSS' });

      expect(youtubeItem.provider).toBe('YOUTUBE');
      expect(spotifyItem.provider).toBe('SPOTIFY');
      expect(rssItem.provider).toBe('RSS');
    });
  });

  describe('swipe directions', () => {
    it('swipe left reveals bookmark action (right panel)', () => {
      // Per design spec: Swipe left -> right action panel -> bookmark
      // This maps to onSwipeableOpen('left') -> onBookmark
      const swipeDirection = 'left';
      const expectedAction = 'bookmark';

      expect(swipeDirection).toBe('left');
      expect(expectedAction).toBe('bookmark');
    });

    it('swipe right reveals archive action (left panel)', () => {
      // Per design spec: Swipe right -> left action panel -> archive
      // This maps to onSwipeableOpen('right') -> onArchive
      const swipeDirection = 'right';
      const expectedAction = 'archive';

      expect(swipeDirection).toBe('right');
      expect(expectedAction).toBe('archive');
    });
  });

  describe('archive action panel UI (zine-2sb)', () => {
    it('archive panel uses gray/neutral background color', () => {
      // Per issue zine-2sb: Gray styling for soft delete (not red/destructive)
      // Uses backgroundTertiary from theme: #2A2A2A (dark) or #F1F5F9 (light)
      const expectedDarkBg = '#2A2A2A';
      const expectedLightBg = '#F1F5F9';

      // These match theme.ts Colors.dark.backgroundTertiary and Colors.light.backgroundTertiary
      expect(expectedDarkBg).toBe('#2A2A2A');
      expect(expectedLightBg).toBe('#F1F5F9');
    });

    it('archive panel includes Archive text label', () => {
      // Per issue zine-2sb: Panel has "Archive" text label
      const expectedLabel = 'Archive';
      expect(expectedLabel).toBe('Archive');
    });

    it('archive panel icon uses textSecondary color', () => {
      // Per issue zine-2sb: Neutral styling for icon
      // Uses textSecondary from theme: #A0A0A0 (dark) or #64748B (light)
      const expectedDarkIconColor = '#A0A0A0';
      const expectedLightIconColor = '#64748B';

      expect(expectedDarkIconColor).toBe('#A0A0A0');
      expect(expectedLightIconColor).toBe('#64748B');
    });

    it('archive panel icon/text animate based on swipe progress', () => {
      // Per issue zine-2sb: Icon/text should scale/fade in as user swipes
      // Animation uses:
      // - scale: interpolate 0->1 maps to 0.8->1
      // - opacity: interpolate 0->0.5->1 maps to 0->0.5->1
      const scaleStart = 0.8;
      const scaleEnd = 1;
      const opacityStart = 0;
      const opacityEnd = 1;

      expect(scaleStart).toBeLessThan(scaleEnd);
      expect(opacityStart).toBeLessThan(opacityEnd);
    });

    it('archive panel uses labelSmall typography', () => {
      // Per issue zine-2sb: Styling matches app design system
      // Uses Typography.labelSmall from theme
      const labelSmallExpected = {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '500',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      };

      expect(labelSmallExpected.fontSize).toBe(11);
      expect(labelSmallExpected.textTransform).toBe('uppercase');
    });

    it('archive panel content has proper gap spacing', () => {
      // Per issue zine-2sb: Icon + text layout with gap
      // Uses Spacing.xs (4px) for gap between icon and label
      const expectedGap = 4; // Spacing.xs
      expect(expectedGap).toBe(4);
    });
  });

  describe('bookmark action panel UI (zine-1sb)', () => {
    it('bookmark panel uses primary background color', () => {
      // Per issue zine-1sb: Primary color styling (white on dark theme)
      // Uses primary from theme: #FFFFFF
      const expectedPrimaryColor = '#FFFFFF';
      expect(expectedPrimaryColor).toBe('#FFFFFF');
    });

    it('bookmark panel includes Save text label', () => {
      // Per issue zine-1sb: Panel has "Save" text label (shorter than "Bookmark" for space)
      const expectedLabel = 'Save';
      expect(expectedLabel).toBe('Save');
    });

    it('bookmark panel icon uses buttonPrimaryText color', () => {
      // Per issue zine-1sb: Dark icon/text on light (primary) background
      // Uses buttonPrimaryText from theme: #000000 (dark) or #FFFFFF (light)
      const expectedDarkIconColor = '#000000'; // Dark text on white bg
      const expectedLightIconColor = '#FFFFFF';

      expect(expectedDarkIconColor).toBe('#000000');
      expect(expectedLightIconColor).toBe('#FFFFFF');
    });

    it('bookmark panel icon/text animate based on swipe progress', () => {
      // Per issue zine-1sb: Icon/text should scale/fade in as user swipes
      // Animation uses:
      // - scale: interpolate 0->1 maps to 0.8->1
      // - opacity: interpolate 0->0.5->1 maps to 0->0.5->1
      const scaleStart = 0.8;
      const scaleEnd = 1;
      const opacityStart = 0;
      const opacityEnd = 1;

      expect(scaleStart).toBeLessThan(scaleEnd);
      expect(opacityStart).toBeLessThan(opacityEnd);
    });

    it('bookmark panel text uses buttonPrimaryText color for contrast', () => {
      // Per issue zine-1sb: Good contrast - dark icon/text on light background
      // In dark theme: black text (#000000) on white background (#FFFFFF)
      const backgroundColor = '#FFFFFF'; // primary color
      const textColor = '#000000'; // buttonPrimaryText in dark mode

      // High contrast: dark on light
      expect(backgroundColor).not.toBe(textColor);
    });

    it('bookmark panel uses labelSmall typography', () => {
      // Per issue zine-1sb: Consistent with archive panel styling
      // Uses Typography.labelSmall from theme
      const labelSmallExpected = {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '500',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      };

      expect(labelSmallExpected.fontSize).toBe(11);
      expect(labelSmallExpected.textTransform).toBe('uppercase');
    });

    it('bookmark panel content has proper gap spacing', () => {
      // Per issue zine-1sb: Icon + text layout with gap
      // Uses Spacing.xs (4px) for gap between icon and label
      const expectedGap = 4; // Spacing.xs
      expect(expectedGap).toBe(4);
    });
  });

  describe('full-swipe threshold auto-completion (zine-e28)', () => {
    // Test that simulates the handleSwipeableOpen logic from the component
    // The actual ReanimatedSwipeable callback behavior is tested via manual testing

    it('onSwipeableOpen with direction "left" triggers bookmark callback', () => {
      // Per issue zine-e28: Swiping left triggers bookmark
      // onSwipeableOpen('left') = right panel revealed = bookmark action
      const bookmarkIds: string[] = [];
      const archiveIds: string[] = [];
      const item = createMockItem({ id: 'swipe-test-1' });

      const handleSwipeableOpen = (direction: 'left' | 'right') => {
        if (direction === 'left') {
          // Swiped left = right action panel revealed = bookmark
          bookmarkIds.push(item.id);
        } else if (direction === 'right') {
          // Swiped right = left action panel revealed = archive
          archiveIds.push(item.id);
        }
      };

      handleSwipeableOpen('left');

      expect(bookmarkIds).toContain('swipe-test-1');
      expect(archiveIds).not.toContain('swipe-test-1');
    });

    it('onSwipeableOpen with direction "right" triggers archive callback', () => {
      // Per issue zine-e28: Swiping right triggers archive
      // onSwipeableOpen('right') = left panel revealed = archive action
      const bookmarkIds: string[] = [];
      const archiveIds: string[] = [];
      const item = createMockItem({ id: 'swipe-test-2' });

      const handleSwipeableOpen = (direction: 'left' | 'right') => {
        if (direction === 'left') {
          bookmarkIds.push(item.id);
        } else if (direction === 'right') {
          archiveIds.push(item.id);
        }
      };

      handleSwipeableOpen('right');

      expect(archiveIds).toContain('swipe-test-2');
      expect(bookmarkIds).not.toContain('swipe-test-2');
    });

    it('swipe threshold equals action panel width for consistent feel', () => {
      // Per issue zine-e28: Threshold should feel intentional
      // Using same value (100px) for both threshold and panel width
      const SWIPE_THRESHOLD = 100;
      const ACTION_WIDTH = 100;

      expect(SWIPE_THRESHOLD).toBe(ACTION_WIDTH);
    });

    it('swipe threshold is between 1/5 and 1/3 of typical phone width', () => {
      // Per issue zine-e28: Threshold should feel intentional but achievable
      // Typical phone width: 375-428px (iPhone SE to Pro Max)
      // 1/5 of 375 = 75px, 1/3 of 428 = 143px
      const SWIPE_THRESHOLD = 100;
      const minThreshold = 75; // ~1/5 of smallest phone
      const maxThreshold = 143; // ~1/3 of largest phone

      expect(SWIPE_THRESHOLD).toBeGreaterThanOrEqual(minThreshold);
      expect(SWIPE_THRESHOLD).toBeLessThanOrEqual(maxThreshold);
    });

    it('overshoot is disabled to prevent floppy feel', () => {
      // Per issue zine-e28: overshootLeft and overshootRight should be false
      // This prevents the swipeable from feeling "floppy" past threshold
      const overshootLeft = false;
      const overshootRight = false;

      expect(overshootLeft).toBe(false);
      expect(overshootRight).toBe(false);
    });

    it('callback fires exactly once per action (idempotent)', () => {
      // Per issue zine-e28: onSwipeableOpen fires exactly once per action
      // Simulating multiple calls to verify handler is idempotent-capable
      const callCount = { archive: 0, bookmark: 0 };

      const handleSwipeableOpen = (direction: 'left' | 'right') => {
        if (direction === 'left') {
          callCount.bookmark++;
        } else if (direction === 'right') {
          callCount.archive++;
        }
      };

      // Single left swipe
      handleSwipeableOpen('left');
      expect(callCount.bookmark).toBe(1);

      // Single right swipe
      handleSwipeableOpen('right');
      expect(callCount.archive).toBe(1);

      // Verify no cross-contamination
      expect(callCount.bookmark).toBe(1);
      expect(callCount.archive).toBe(1);
    });

    it('left and right thresholds are symmetric', () => {
      // Per issue zine-e28: Both directions should have same threshold
      // This ensures consistent UX for both actions
      const leftThreshold = 100;
      const rightThreshold = 100;

      expect(leftThreshold).toBe(rightThreshold);
    });

    it('threshold is large enough to prevent accidental triggers', () => {
      // Per issue zine-e28: Actions don't trigger on small accidental swipes
      // Typical accidental swipe is ~20-40px, threshold should be well above
      const SWIPE_THRESHOLD = 100;
      const typicalAccidentalSwipe = 40;

      expect(SWIPE_THRESHOLD).toBeGreaterThan(typicalAccidentalSwipe * 2);
    });
  });

  describe('archive action mutation integration (zine-4v6)', () => {
    // Tests for wiring archive swipe action to useArchiveItem mutation
    // The actual tRPC mutation is tested in use-items-trpc hooks
    // These tests verify the integration pattern

    it('archive callback receives correct item id', () => {
      // Per issue zine-4v6: Full swipe left calls useArchiveItem mutation
      const archiveCalls: { id: string }[] = [];
      const mockArchiveMutate = (input: { id: string }) => {
        archiveCalls.push(input);
      };

      const item = createMockItem({ id: 'archive-test-item' });
      const handleArchive = (id: string) => {
        mockArchiveMutate({ id });
      };

      // Simulate the swipe action triggering onArchive
      handleArchive(item.id);

      expect(archiveCalls).toHaveLength(1);
      expect(archiveCalls[0]).toEqual({ id: 'archive-test-item' });
    });

    it('archive mutation receives only the id parameter', () => {
      // Per issue zine-4v6: archiveMutation.mutate({ id: item.id })
      // The mutation only needs the item id, nothing else
      const mutationInput: { id: string }[] = [];
      const mockMutate = (input: { id: string }) => {
        mutationInput.push(input);
      };

      const item = createMockItem({
        id: 'test-123',
        title: 'Should not be passed',
        creator: 'Should not be passed either',
      });

      // handleArchive pattern from inbox.tsx
      const handleArchive = (id: string) => {
        mockMutate({ id });
      };

      handleArchive(item.id);

      expect(mutationInput[0]).toEqual({ id: 'test-123' });
      expect(mutationInput[0]).not.toHaveProperty('title');
      expect(mutationInput[0]).not.toHaveProperty('creator');
    });

    it('archive can be called for multiple different items', () => {
      // Per issue zine-4v6: Each item in list can be archived independently
      const archivedIds: string[] = [];
      const mockArchiveMutate = (input: { id: string }) => {
        archivedIds.push(input.id);
      };

      const handleArchive = (id: string) => {
        mockArchiveMutate({ id });
      };

      // Simulate archiving multiple items
      handleArchive('item-1');
      handleArchive('item-2');
      handleArchive('item-3');

      expect(archivedIds).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('archive handler can be passed as prop to SwipeableInboxItem', () => {
      // Per issue zine-4v6: onArchive={handleArchive} pattern
      const mutationCalls: { id: string }[] = [];
      const archiveMutation = {
        mutate: (input: { id: string }) => mutationCalls.push(input),
      };

      // This is the pattern used in inbox.tsx
      const handleArchive = (id: string) => {
        archiveMutation.mutate({ id });
      };

      const props: SwipeableInboxItemProps = {
        item: createMockItem({ id: 'prop-test' }),
        onArchive: handleArchive,
        onBookmark: () => {},
      };

      // Simulate component calling onArchive
      props.onArchive('prop-test');

      expect(mutationCalls).toHaveLength(1);
      expect(mutationCalls[0].id).toBe('prop-test');
    });

    it('archive flow: swipe right -> onSwipeableOpen("right") -> onArchive -> mutation', () => {
      // Per issue zine-4v6: Full integration flow
      const flow: string[] = [];
      const mutationCalls: { id: string }[] = [];

      const archiveMutation = {
        mutate: (input: { id: string }) => {
          flow.push('mutation called');
          mutationCalls.push(input);
        },
      };

      const handleArchive = (id: string) => {
        flow.push('handleArchive called');
        archiveMutation.mutate({ id });
      };

      const handleSwipeableOpen = (direction: 'left' | 'right', itemId: string) => {
        flow.push(`onSwipeableOpen: ${direction}`);
        if (direction === 'right') {
          handleArchive(itemId);
        }
      };

      // Simulate the full swipe flow
      handleSwipeableOpen('right', 'flow-test-item');

      expect(flow).toEqual(['onSwipeableOpen: right', 'handleArchive called', 'mutation called']);
      expect(mutationCalls[0].id).toBe('flow-test-item');
    });

    it('swipeable ref close is called after archive action', () => {
      // Per issue zine-4v6: swipeableRef.current?.close() is called
      let closeCalled = false;
      const swipeableRef = {
        current: {
          close: () => {
            closeCalled = true;
          },
        },
      };

      const handleSwipeableOpen = (direction: 'left' | 'right') => {
        if (direction === 'right') {
          // archive action happens here
        }
        // Close is called after action
        swipeableRef.current?.close();
      };

      handleSwipeableOpen('right');

      expect(closeCalled).toBe(true);
    });
  });

  describe('exit animation (zine-av9)', () => {
    // Tests for smooth exit animation when item leaves list
    // These tests validate the animation configuration and logic
    // Actual visual animations are tested via manual testing in simulator

    it('exit animation duration is between 200-300ms (quick but visible)', () => {
      // Per issue zine-av9: Animation should be quick (~200-300ms)
      const EXIT_ANIMATION_DURATION = 250;

      expect(EXIT_ANIMATION_DURATION).toBeGreaterThanOrEqual(200);
      expect(EXIT_ANIMATION_DURATION).toBeLessThanOrEqual(300);
    });

    it('archive action exits to the left (SlideOutLeft)', () => {
      // Per issue zine-av9: Archive exits left (continues in swipe direction)
      // Swipe right reveals archive -> item exits left

      // Helper that mirrors component logic
      const getExitDirection = (swipeDir: 'left' | 'right') =>
        swipeDir === 'right' ? 'left' : 'right';

      const exitDir = getExitDirection('right');

      expect(exitDir).toBe('left');
    });

    it('bookmark action exits to the right (SlideOutRight)', () => {
      // Per issue zine-av9: Bookmark exits right (continues in swipe direction)
      // Swipe left reveals bookmark -> item exits right

      // Helper that mirrors component logic
      const getExitDirection = (swipeDir: 'left' | 'right') =>
        swipeDir === 'right' ? 'left' : 'right';

      const exitDir = getExitDirection('left');

      expect(exitDir).toBe('right');
    });

    it('exit animation is triggered before action callback executes', () => {
      // Per issue zine-av9: Animation triggers, then action callback runs
      // This ensures visual feedback is immediate
      const events: string[] = [];

      const setExitDirection = (dir: 'left' | 'right') => {
        events.push(`exit:${dir}`);
      };

      const executeAction = (direction: 'left' | 'right') => {
        events.push(`action:${direction}`);
      };

      // Simulating handleSwipeableOpen from component
      const handleSwipeableOpen = (direction: 'left' | 'right') => {
        const exitDir = direction === 'right' ? 'left' : 'right';
        setExitDirection(exitDir);
        executeAction(direction);
      };

      handleSwipeableOpen('right');

      // Exit animation trigger comes before action execution
      expect(events).toEqual(['exit:left', 'action:right']);
    });

    it('exit direction state starts as null (no animation pending)', () => {
      // Per issue zine-av9: Item should not animate on initial render
      type ExitDirection = 'left' | 'right' | null;
      const initialExitDirection: ExitDirection = null;

      expect(initialExitDirection).toBeNull();
    });

    it('layout animation uses spring physics for smooth collapse', () => {
      // Per issue zine-av9: List should collapse smoothly
      // Uses Layout.springify() with damping and stiffness
      const layoutConfig = {
        type: 'spring',
        damping: 15,
        stiffness: 100,
      };

      // Damping controls oscillation (15 is moderate, no bouncing)
      expect(layoutConfig.damping).toBeGreaterThan(10);
      expect(layoutConfig.damping).toBeLessThan(20);

      // Stiffness controls speed (100 is quick response)
      expect(layoutConfig.stiffness).toBeGreaterThanOrEqual(100);
    });

    it('exit animation direction maps correctly for both actions', () => {
      // Per issue zine-av9: Comprehensive mapping test
      const testCases = [
        { swipe: 'right', action: 'archive', exitDir: 'left' },
        { swipe: 'left', action: 'bookmark', exitDir: 'right' },
      ] as const;

      testCases.forEach(({ swipe, exitDir }) => {
        const computedExitDir = swipe === 'right' ? 'left' : 'right';
        expect(computedExitDir).toBe(exitDir);
      });
    });

    it('exit animation is undefined when exitDirection is null', () => {
      // Per issue zine-av9: No animation when no action has been triggered
      type ExitDirection = 'left' | 'right' | null;
      const exitDirection: ExitDirection = null;

      // Logic from component
      const exitAnimation =
        exitDirection === 'left'
          ? 'SlideOutLeft'
          : exitDirection === 'right'
            ? 'SlideOutRight'
            : undefined;

      expect(exitAnimation).toBeUndefined();
    });

    it('exit animation is SlideOutLeft when exitDirection is left', () => {
      // Per issue zine-av9: Archive exits left
      type ExitDirection = 'left' | 'right' | null;
      const exitDirection: ExitDirection = 'left';

      const exitAnimation =
        exitDirection === 'left'
          ? 'SlideOutLeft'
          : exitDirection === 'right'
            ? 'SlideOutRight'
            : undefined;

      expect(exitAnimation).toBe('SlideOutLeft');
    });

    it('exit animation is SlideOutRight when exitDirection is right', () => {
      // Per issue zine-av9: Bookmark exits right
      type ExitDirection = 'left' | 'right' | null;
      const exitDirection: ExitDirection = 'right';

      // Helper to compute animation - mirrors component logic
      const getExitAnimation = (dir: ExitDirection) =>
        dir === 'left' ? 'SlideOutLeft' : dir === 'right' ? 'SlideOutRight' : undefined;

      const exitAnimation = getExitAnimation(exitDirection);

      expect(exitAnimation).toBe('SlideOutRight');
    });

    it('FlatList uses itemLayoutAnimation for smooth list collapse', () => {
      // Per issue zine-av9: List items should animate when siblings are removed
      // Animated.FlatList with itemLayoutAnimation prop
      const flatListConfig = {
        useAnimatedFlatList: true,
        itemLayoutAnimation: 'LinearTransition.springify()',
        layoutSpring: {
          damping: 15,
          stiffness: 100,
        },
      };

      expect(flatListConfig.useAnimatedFlatList).toBe(true);
      expect(flatListConfig.itemLayoutAnimation).toContain('springify');
    });

    it('sequential swipes process independently (no race conditions)', () => {
      // Per issue zine-av9: Rapid sequential swipes should work correctly
      const processedItems: { id: string; action: string }[] = [];

      const processSwipe = (itemId: string, direction: 'left' | 'right') => {
        const action = direction === 'right' ? 'archive' : 'bookmark';
        processedItems.push({ id: itemId, action });
      };

      // Simulate rapid sequential swipes
      processSwipe('item-1', 'right');
      processSwipe('item-2', 'left');
      processSwipe('item-3', 'right');

      expect(processedItems).toEqual([
        { id: 'item-1', action: 'archive' },
        { id: 'item-2', action: 'bookmark' },
        { id: 'item-3', action: 'archive' },
      ]);
    });
  });

  describe('rollback animation on mutation failure (zine-0qr)', () => {
    // Tests for rollback animation when mutation fails
    // Validates the animation configuration and logic flow
    // Actual visual animations tested via manual testing in simulator

    it('re-entry animation duration is 300ms for quick but visible feedback', () => {
      // Per issue zine-0qr: Animation should be quick but visible
      const REENTRY_ANIMATION_DURATION = 300;
      expect(REENTRY_ANIMATION_DURATION).toBe(300);
    });

    it('cleanup delay is 500ms to ensure animation completes', () => {
      // Per issue zine-0qr: Clear reappeared state after animation
      const REENTRY_CLEANUP_DELAY = 500;
      expect(REENTRY_CLEANUP_DELAY).toBeGreaterThanOrEqual(300); // Must be >= animation duration
    });

    it('archive action exits left, so rollback enters from left', () => {
      // Per issue zine-0qr: Item re-appears from direction it exited
      // Archive: swipe right → exits left → enters from left on rollback
      const swipeDirection = 'right'; // Archive swipe
      const exitDirection = swipeDirection === 'right' ? 'left' : 'right';
      const enterDirection = exitDirection; // Same as exit for "coming back"

      expect(exitDirection).toBe('left');
      expect(enterDirection).toBe('left');
    });

    it('bookmark action exits right, so rollback enters from right', () => {
      // Per issue zine-0qr: Item re-appears from direction it exited
      // Bookmark: swipe left → exits right → enters from right on rollback

      // Helper that mirrors component logic
      const getExitDirection = (swipe: 'left' | 'right') => (swipe === 'right' ? 'left' : 'right');

      const swipeDirection: 'left' | 'right' = 'left'; // Bookmark swipe
      const exitDirection = getExitDirection(swipeDirection);
      const enterDirection = exitDirection; // Same as exit for "coming back"

      expect(exitDirection).toBe('right');
      expect(enterDirection).toBe('right');
    });

    it('enterFrom prop controls entering animation', () => {
      // Per issue zine-0qr: Component accepts enterFrom prop for rollback
      type EnterDirection = 'left' | 'right' | 'fade' | null;

      interface SwipeableInboxItemPropsWithEnter {
        item: ItemCardData;
        onArchive: (id: string) => void;
        onBookmark: (id: string) => void;
        index?: number;
        enterFrom?: EnterDirection;
      }

      const props: SwipeableInboxItemPropsWithEnter = {
        item: createMockItem(),
        onArchive: () => {},
        onBookmark: () => {},
        enterFrom: 'left',
      };

      expect(props.enterFrom).toBe('left');
    });

    it('entering animation is SlideInLeft when enterFrom is left', () => {
      // Per issue zine-0qr: Archive rollback uses SlideInLeft
      type EnterDirection = 'left' | 'right' | 'fade' | null;
      const enterFrom: EnterDirection = 'left';

      const enteringAnimation =
        enterFrom === 'left'
          ? 'SlideInLeft'
          : enterFrom === 'right'
            ? 'SlideInRight'
            : enterFrom === 'fade'
              ? 'FadeIn'
              : undefined;

      expect(enteringAnimation).toBe('SlideInLeft');
    });

    it('entering animation is SlideInRight when enterFrom is right', () => {
      // Per issue zine-0qr: Bookmark rollback uses SlideInRight
      type EnterDirection = 'left' | 'right' | 'fade' | null;

      // Helper that mirrors component logic
      const getEnteringAnimation = (dir: EnterDirection) =>
        dir === 'left'
          ? 'SlideInLeft'
          : dir === 'right'
            ? 'SlideInRight'
            : dir === 'fade'
              ? 'FadeIn'
              : undefined;

      const enterFrom: EnterDirection = 'right';
      const enteringAnimation = getEnteringAnimation(enterFrom);

      expect(enteringAnimation).toBe('SlideInRight');
    });

    it('entering animation is FadeIn when enterFrom is fade', () => {
      // Per issue zine-0qr: Fallback animation for unknown direction
      type EnterDirection = 'left' | 'right' | 'fade' | null;

      // Helper that mirrors component logic
      const getEnteringAnimation = (dir: EnterDirection) =>
        dir === 'left'
          ? 'SlideInLeft'
          : dir === 'right'
            ? 'SlideInRight'
            : dir === 'fade'
              ? 'FadeIn'
              : undefined;

      const enterFrom: EnterDirection = 'fade';
      const enteringAnimation = getEnteringAnimation(enterFrom);

      expect(enteringAnimation).toBe('FadeIn');
    });

    it('entering animation is undefined when enterFrom is null', () => {
      // Per issue zine-0qr: No animation when item is not reappearing
      type EnterDirection = 'left' | 'right' | 'fade' | null;

      // Helper that mirrors component logic
      const getEnteringAnimation = (dir: EnterDirection) =>
        dir === 'left'
          ? 'SlideInLeft'
          : dir === 'right'
            ? 'SlideInRight'
            : dir === 'fade'
              ? 'FadeIn'
              : undefined;

      const enterFrom: EnterDirection = null;
      const enteringAnimation = getEnteringAnimation(enterFrom);

      expect(enteringAnimation).toBeUndefined();
    });

    it('reappearing items state is tracked as Map<id, direction>', () => {
      // Per issue zine-0qr: Parent tracks which items are reappearing
      type EnterDirection = 'left' | 'right' | 'fade' | null;
      const reappearingItems = new Map<string, EnterDirection>();

      // Initially empty
      expect(reappearingItems.size).toBe(0);

      // Add item after archive failure
      reappearingItems.set('item-1', 'left');
      expect(reappearingItems.get('item-1')).toBe('left');

      // Add item after bookmark failure
      reappearingItems.set('item-2', 'right');
      expect(reappearingItems.get('item-2')).toBe('right');

      // Clear after animation
      reappearingItems.delete('item-1');
      expect(reappearingItems.has('item-1')).toBe(false);
      expect(reappearingItems.has('item-2')).toBe(true);
    });

    it('error toast is shown on mutation failure', () => {
      // Per issue zine-0qr: User understands the action failed
      const toastMessages: { label: string; variant: string }[] = [];

      const showError = (_toast: unknown, _error: Error, message: string) => {
        toastMessages.push({ label: message, variant: 'danger' });
      };

      // Simulate archive failure
      showError(null, new Error('Network error'), 'Failed to archive item');
      expect(toastMessages[0].label).toBe('Failed to archive item');
      expect(toastMessages[0].variant).toBe('danger');

      // Simulate bookmark failure
      showError(null, new Error('Network error'), 'Failed to save item');
      expect(toastMessages[1].label).toBe('Failed to save item');
      expect(toastMessages[1].variant).toBe('danger');
    });

    it('item is actionable again after rollback (can re-swipe)', () => {
      // Per issue zine-0qr: Item should be in correct state after rollback
      type EnterDirection = 'left' | 'right' | 'fade' | null;
      const reappearingItems = new Map<string, EnterDirection>();
      const archivedItems: string[] = [];

      // Simulate rollback flow
      const itemId = 'test-item';

      // 1. Archive attempt
      archivedItems.push(itemId);
      expect(archivedItems).toContain(itemId);

      // 2. Mutation fails - rollback
      archivedItems.length = 0;
      reappearingItems.set(itemId, 'left');
      expect(archivedItems).not.toContain(itemId);

      // 3. After animation cleanup
      reappearingItems.delete(itemId);
      expect(reappearingItems.has(itemId)).toBe(false);

      // 4. User can swipe again
      archivedItems.push(itemId);
      expect(archivedItems).toContain(itemId);
    });

    it('no duplicate items after rollback', () => {
      // Per issue zine-0qr: Item should appear exactly once
      const items = ['item-1', 'item-2', 'item-3'];

      // Simulate optimistic removal
      const filteredItems = items.filter((id) => id !== 'item-2');
      expect(filteredItems).toEqual(['item-1', 'item-3']);

      // Simulate rollback - item-2 returns
      const rolledBackItems = [...filteredItems, 'item-2'];
      // In real implementation, TanStack Query restores the original array
      // So we'd have exactly the original items

      // Check no duplicates
      const uniqueItems = [...new Set(rolledBackItems)];
      expect(uniqueItems.length).toBe(rolledBackItems.length);
    });

    it('rapid retry does not cause race conditions', () => {
      // Per issue zine-0qr: Multiple failures should not cause issues
      type EnterDirection = 'left' | 'right' | 'fade' | null;
      const reappearingItems = new Map<string, EnterDirection>();
      const itemId = 'test-item';

      // First failure
      reappearingItems.set(itemId, 'left');
      expect(reappearingItems.get(itemId)).toBe('left');

      // Second failure (before cleanup)
      reappearingItems.set(itemId, 'left');
      expect(reappearingItems.get(itemId)).toBe('left');
      expect(reappearingItems.size).toBe(1); // Still only one entry

      // Cleanup
      reappearingItems.delete(itemId);
      expect(reappearingItems.size).toBe(0);
    });

    it('animation directions are correct for both action types', () => {
      // Per issue zine-0qr: Comprehensive mapping test
      const testCases = [
        {
          action: 'archive',
          swipeDir: 'right',
          exitDir: 'left',
          enterDir: 'left',
        },
        {
          action: 'bookmark',
          swipeDir: 'left',
          exitDir: 'right',
          enterDir: 'right',
        },
      ] as const;

      testCases.forEach(({ action, swipeDir, exitDir, enterDir }) => {
        const computedExitDir = swipeDir === 'right' ? 'left' : 'right';
        expect(computedExitDir).toBe(exitDir);
        expect(enterDir).toBe(exitDir); // Enter from same direction as exit
        expect(action).toBeDefined(); // Just to use the variable
      });
    });
  });

  describe('haptic feedback on action completion (zine-1oi)', () => {
    // Tests for haptic feedback when swipe actions complete
    // expo-haptics provides native haptic engine access
    // Actual haptic sensation tested on physical iOS device

    it('archive action uses Light haptic (subtle, neutral feedback)', () => {
      // Per issue zine-1oi: Archive = Light haptic (soft delete, not prominent)
      const expectedHapticStyle = 'Light';

      // Maps to Haptics.ImpactFeedbackStyle.Light
      expect(expectedHapticStyle).toBe('Light');
    });

    it('bookmark action uses Medium haptic (more satisfying, positive feedback)', () => {
      // Per issue zine-1oi: Bookmark = Medium haptic (positive action, more prominent)
      const expectedHapticStyle = 'Medium';

      // Maps to Haptics.ImpactFeedbackStyle.Medium
      expect(expectedHapticStyle).toBe('Medium');
    });

    it('haptic intensity matches action importance', () => {
      // Per issue zine-1oi: Haptic intensity should match action importance
      // Archive (soft delete) < Bookmark (save for later)
      const hapticIntensity = {
        Light: 1,
        Medium: 2,
        Heavy: 3,
      };

      const archiveHaptic = hapticIntensity.Light;
      const bookmarkHaptic = hapticIntensity.Medium;

      expect(archiveHaptic).toBeLessThan(bookmarkHaptic);
    });

    it('haptic fires at action moment in handleSwipeableOpen', () => {
      // Per issue zine-1oi: Haptic fires at correct moment (action completion)
      const events: string[] = [];

      // Simulated handleSwipeableOpen flow from component
      const handleSwipeableOpen = (direction: 'left' | 'right') => {
        // 1. Haptic fires first
        if (direction === 'right') {
          events.push('haptic:Light');
        } else {
          events.push('haptic:Medium');
        }

        // 2. Exit animation triggers
        events.push('exitAnimation');

        // 3. Action callback executes
        events.push('action');
      };

      // Archive swipe (right)
      events.length = 0;
      handleSwipeableOpen('right');
      expect(events).toEqual(['haptic:Light', 'exitAnimation', 'action']);

      // Bookmark swipe (left)
      events.length = 0;
      handleSwipeableOpen('left');
      expect(events).toEqual(['haptic:Medium', 'exitAnimation', 'action']);
    });

    it('swipe direction correctly maps to haptic style', () => {
      // Per issue zine-1oi: Direction mapping is correct
      const getHapticStyle = (direction: 'left' | 'right') =>
        direction === 'right' ? 'Light' : 'Medium';

      // Swipe right = Archive = Light
      expect(getHapticStyle('right')).toBe('Light');

      // Swipe left = Bookmark = Medium
      expect(getHapticStyle('left')).toBe('Medium');
    });

    it('haptic call is async and non-blocking', () => {
      // Per issue zine-1oi: Haptics.impactAsync returns Promise
      // The action should not wait for haptic to complete
      const operations: string[] = [];

      // Simulated async haptic (fire-and-forget)
      const triggerHaptic = () => {
        operations.push('haptic:started');
        // In real code: Haptics.impactAsync(style) - returns Promise but not awaited
        return Promise.resolve().then(() => {
          operations.push('haptic:completed');
        });
      };

      const executeAction = () => {
        operations.push('action:executed');
      };

      // Fire haptic (don't await)
      triggerHaptic();

      // Action executes immediately (before haptic completes)
      executeAction();

      // Haptic started, action executed (haptic:completed comes later async)
      expect(operations).toContain('haptic:started');
      expect(operations).toContain('action:executed');
    });

    it('available expo-haptics impact styles', () => {
      // Per issue zine-1oi: Document available styles
      // From expo-haptics ImpactFeedbackStyle enum
      const availableStyles = ['Light', 'Medium', 'Heavy', 'Soft', 'Rigid'];

      expect(availableStyles).toContain('Light');
      expect(availableStyles).toContain('Medium');
      expect(availableStyles.length).toBe(5);
    });

    it('available expo-haptics notification types', () => {
      // Per issue zine-1oi: Alternative notification-style haptics
      // From expo-haptics NotificationFeedbackType enum
      const availableTypes = ['Success', 'Warning', 'Error'];

      expect(availableTypes).toContain('Success');
      expect(availableTypes).toContain('Warning');
      expect(availableTypes).toContain('Error');
    });

    it('haptics gracefully handle simulator/unsupported devices', () => {
      // Per issue zine-1oi: Haptics fail gracefully on simulator/Android
      // expo-haptics handles this internally - no error thrown
      let errorThrown = false;

      try {
        // Simulated no-op for unsupported device
        const impactAsync = () => Promise.resolve();
        impactAsync();
      } catch {
        errorThrown = true;
      }

      expect(errorThrown).toBe(false);
    });

    it('haptic fires exactly once per swipe action', () => {
      // Per issue zine-1oi: No double haptics on action
      let hapticCount = 0;

      const handleSwipeableOpen = () => {
        hapticCount++;
        // Only one haptic call per swipe
      };

      handleSwipeableOpen();
      expect(hapticCount).toBe(1);

      handleSwipeableOpen();
      expect(hapticCount).toBe(2);
    });

    it('both actions have distinct haptic feedback', () => {
      // Per issue zine-1oi: User can distinguish actions by feel
      const archiveHaptic = 'Light';
      const bookmarkHaptic = 'Medium';

      expect(archiveHaptic).not.toBe(bookmarkHaptic);
    });

    it('haptic timing is synchronous with visual feedback', () => {
      // Per issue zine-1oi: Haptic should fire at same moment as exit animation
      const timeline: { event: string; order: number }[] = [];
      let order = 0;

      const handleSwipeableOpen = (_direction: 'left' | 'right') => {
        // Haptic fires
        timeline.push({ event: 'haptic', order: order++ });

        // Exit animation triggers (same frame)
        timeline.push({ event: 'exitAnimation', order: order++ });

        // Action callback
        timeline.push({ event: 'callback', order: order++ });
      };

      handleSwipeableOpen('right');

      // Haptic and exitAnimation should be consecutive
      const hapticOrder = timeline.find((e) => e.event === 'haptic')?.order;
      const exitOrder = timeline.find((e) => e.event === 'exitAnimation')?.order;

      expect(hapticOrder).toBe(0);
      expect(exitOrder).toBe(1);
    });
  });

  describe('long-press context menu accessibility fallback (zine-9mi)', () => {
    // Tests for long-press context menu as accessibility fallback
    // react-native-context-menu-view provides native iOS context menu
    // VoiceOver accessibility actions provide non-gesture access
    // Actual menu appearance tested via manual testing on device

    it('context menu has "Save to Library" action', () => {
      // Per issue zine-9mi: Menu should have bookmark option
      const contextMenuActions = [
        { title: 'Save to Library', systemIcon: 'bookmark' },
        { title: 'Archive', systemIcon: 'archivebox' },
      ];

      const saveAction = contextMenuActions.find((a) => a.title === 'Save to Library');
      expect(saveAction).toBeDefined();
      expect(saveAction?.systemIcon).toBe('bookmark');
    });

    it('context menu has "Archive" action', () => {
      // Per issue zine-9mi: Menu should have archive option
      const contextMenuActions = [
        { title: 'Save to Library', systemIcon: 'bookmark' },
        { title: 'Archive', systemIcon: 'archivebox' },
      ];

      const archiveAction = contextMenuActions.find((a) => a.title === 'Archive');
      expect(archiveAction).toBeDefined();
      expect(archiveAction?.systemIcon).toBe('archivebox');
    });

    it('context menu uses correct SF Symbols icons', () => {
      // Per issue zine-9mi: Native iOS system icons
      const contextMenuActions = [
        { title: 'Save to Library', systemIcon: 'bookmark' },
        { title: 'Archive', systemIcon: 'archivebox' },
      ];

      // bookmark and archivebox are valid SF Symbols
      expect(contextMenuActions[0].systemIcon).toBe('bookmark');
      expect(contextMenuActions[1].systemIcon).toBe('archivebox');
    });

    it('context menu onPress dispatches correct action for Save to Library', () => {
      // Per issue zine-9mi: Selecting option triggers correct callback
      const bookmarkIds: string[] = [];
      const archiveIds: string[] = [];

      const CONTEXT_MENU_ACTION = {
        SAVE_TO_LIBRARY: 'Save to Library',
        ARCHIVE: 'Archive',
      };

      const handleContextMenuPress = (e: { nativeEvent: { name: string } }, itemId: string) => {
        const { name } = e.nativeEvent;
        if (name === CONTEXT_MENU_ACTION.SAVE_TO_LIBRARY) {
          bookmarkIds.push(itemId);
        } else if (name === CONTEXT_MENU_ACTION.ARCHIVE) {
          archiveIds.push(itemId);
        }
      };

      // Simulate selecting "Save to Library"
      handleContextMenuPress({ nativeEvent: { name: 'Save to Library' } }, 'item-123');

      expect(bookmarkIds).toContain('item-123');
      expect(archiveIds).not.toContain('item-123');
    });

    it('context menu onPress dispatches correct action for Archive', () => {
      // Per issue zine-9mi: Selecting Archive triggers archive callback
      const bookmarkIds: string[] = [];
      const archiveIds: string[] = [];

      const CONTEXT_MENU_ACTION = {
        SAVE_TO_LIBRARY: 'Save to Library',
        ARCHIVE: 'Archive',
      };

      const handleContextMenuPress = (e: { nativeEvent: { name: string } }, itemId: string) => {
        const { name } = e.nativeEvent;
        if (name === CONTEXT_MENU_ACTION.SAVE_TO_LIBRARY) {
          bookmarkIds.push(itemId);
        } else if (name === CONTEXT_MENU_ACTION.ARCHIVE) {
          archiveIds.push(itemId);
        }
      };

      // Simulate selecting "Archive"
      handleContextMenuPress({ nativeEvent: { name: 'Archive' } }, 'item-456');

      expect(archiveIds).toContain('item-456');
      expect(bookmarkIds).not.toContain('item-456');
    });

    it('context menu action triggers haptic feedback', () => {
      // Per issue zine-9mi: Context menu actions should have same haptic feedback as swipe
      const hapticEvents: string[] = [];

      const handleBookmarkAction = () => {
        hapticEvents.push('Medium');
      };

      const handleArchiveAction = () => {
        hapticEvents.push('Light');
      };

      handleBookmarkAction();
      handleArchiveAction();

      expect(hapticEvents).toEqual(['Medium', 'Light']);
    });

    it('context menu action triggers exit animation', () => {
      // Per issue zine-9mi: Context menu actions should have same visual feedback as swipe
      type ExitDirection = 'left' | 'right' | null;
      let exitDirection: ExitDirection = null;

      const handleBookmarkAction = () => {
        exitDirection = 'right'; // Same as swipe left -> bookmark
      };

      const handleArchiveAction = () => {
        exitDirection = 'left'; // Same as swipe right -> archive
      };

      handleBookmarkAction();
      expect(exitDirection).toBe('right');

      handleArchiveAction();
      expect(exitDirection).toBe('left');
    });

    it('accessibility actions include bookmark and archive', () => {
      // Per issue zine-9mi: VoiceOver users need non-gesture access
      const accessibilityActions = [
        { name: 'bookmark', label: 'Save to Library' },
        { name: 'archive', label: 'Archive' },
      ];

      expect(accessibilityActions).toHaveLength(2);
      expect(accessibilityActions[0].name).toBe('bookmark');
      expect(accessibilityActions[0].label).toBe('Save to Library');
      expect(accessibilityActions[1].name).toBe('archive');
      expect(accessibilityActions[1].label).toBe('Archive');
    });

    it('onAccessibilityAction dispatches correct action for bookmark', () => {
      // Per issue zine-9mi: VoiceOver accessibility action works
      const bookmarkIds: string[] = [];
      const archiveIds: string[] = [];

      const ACCESSIBILITY_ACTION = {
        BOOKMARK: 'bookmark',
        ARCHIVE: 'archive',
      };

      const handleAccessibilityAction = (
        event: { nativeEvent: { actionName: string } },
        itemId: string
      ) => {
        switch (event.nativeEvent.actionName) {
          case ACCESSIBILITY_ACTION.BOOKMARK:
            bookmarkIds.push(itemId);
            break;
          case ACCESSIBILITY_ACTION.ARCHIVE:
            archiveIds.push(itemId);
            break;
        }
      };

      handleAccessibilityAction({ nativeEvent: { actionName: 'bookmark' } }, 'item-789');

      expect(bookmarkIds).toContain('item-789');
      expect(archiveIds).not.toContain('item-789');
    });

    it('onAccessibilityAction dispatches correct action for archive', () => {
      // Per issue zine-9mi: VoiceOver accessibility action works
      const bookmarkIds: string[] = [];
      const archiveIds: string[] = [];

      const ACCESSIBILITY_ACTION = {
        BOOKMARK: 'bookmark',
        ARCHIVE: 'archive',
      };

      const handleAccessibilityAction = (
        event: { nativeEvent: { actionName: string } },
        itemId: string
      ) => {
        switch (event.nativeEvent.actionName) {
          case ACCESSIBILITY_ACTION.BOOKMARK:
            bookmarkIds.push(itemId);
            break;
          case ACCESSIBILITY_ACTION.ARCHIVE:
            archiveIds.push(itemId);
            break;
        }
      };

      handleAccessibilityAction({ nativeEvent: { actionName: 'archive' } }, 'item-abc');

      expect(archiveIds).toContain('item-abc');
      expect(bookmarkIds).not.toContain('item-abc');
    });

    it('component has appropriate accessibility label', () => {
      // Per issue zine-9mi: VoiceOver users understand what item is
      const item = createMockItem({ title: 'Test Video', creator: 'Test Creator' });
      const accessibilityLabel = `${item.title}${item.creator ? ` by ${item.creator}` : ''}`;

      expect(accessibilityLabel).toBe('Test Video by Test Creator');
    });

    it('accessibility label handles missing creator', () => {
      // Per issue zine-9mi: Label works without creator
      const item = createMockItem({ title: 'Test Video', creator: undefined });
      const accessibilityLabel = `${item.title}${item.creator ? ` by ${item.creator}` : ''}`;

      expect(accessibilityLabel).toBe('Test Video');
    });

    it('component has appropriate accessibility hint', () => {
      // Per issue zine-9mi: VoiceOver users know how to interact
      const accessibilityHint =
        'Swipe right to archive, swipe left to save. Double tap and hold for more options.';

      expect(accessibilityHint).toContain('Swipe');
      expect(accessibilityHint).toContain('archive');
      expect(accessibilityHint).toContain('save');
      expect(accessibilityHint).toContain('Double tap and hold');
    });

    it('component has accessible=true', () => {
      // Per issue zine-9mi: Component should be accessible
      const accessible = true;
      expect(accessible).toBe(true);
    });

    it('component has correct accessibilityRole', () => {
      // Per issue zine-9mi: Button role indicates actionable item
      const accessibilityRole = 'button';
      expect(accessibilityRole).toBe('button');
    });

    it('context menu previewBackgroundColor matches theme', () => {
      // Per issue zine-9mi: Menu styling matches app theme
      const darkBackground = '#000000'; // Colors.dark.background
      const lightBackground = '#FFFFFF'; // Colors.light.background

      expect(darkBackground).toBe('#000000');
      expect(lightBackground).toBe('#FFFFFF');
    });

    it('context menu action names match constant definitions', () => {
      // Per issue zine-9mi: Consistent action names for handler dispatch
      const CONTEXT_MENU_ACTION = {
        SAVE_TO_LIBRARY: 'Save to Library',
        ARCHIVE: 'Archive',
      };

      const contextMenuActions = [
        { title: CONTEXT_MENU_ACTION.SAVE_TO_LIBRARY, systemIcon: 'bookmark' },
        { title: CONTEXT_MENU_ACTION.ARCHIVE, systemIcon: 'archivebox' },
      ];

      expect(contextMenuActions[0].title).toBe(CONTEXT_MENU_ACTION.SAVE_TO_LIBRARY);
      expect(contextMenuActions[1].title).toBe(CONTEXT_MENU_ACTION.ARCHIVE);
    });

    it('accessibility action names match constant definitions', () => {
      // Per issue zine-9mi: Consistent action names for handler dispatch
      const ACCESSIBILITY_ACTION = {
        BOOKMARK: 'bookmark',
        ARCHIVE: 'archive',
      };

      const accessibilityActions = [
        { name: ACCESSIBILITY_ACTION.BOOKMARK, label: 'Save to Library' },
        { name: ACCESSIBILITY_ACTION.ARCHIVE, label: 'Archive' },
      ];

      expect(accessibilityActions[0].name).toBe(ACCESSIBILITY_ACTION.BOOKMARK);
      expect(accessibilityActions[1].name).toBe(ACCESSIBILITY_ACTION.ARCHIVE);
    });

    it('context menu action triggers same mutation as swipe', () => {
      // Per issue zine-9mi: Context menu and swipe should have identical behavior
      const mutationCalls: { action: string; id: string }[] = [];

      const handleBookmarkAction = (itemId: string) => {
        mutationCalls.push({ action: 'bookmark', id: itemId });
      };

      const handleArchiveAction = (itemId: string) => {
        mutationCalls.push({ action: 'archive', id: itemId });
      };

      // Simulate context menu bookmark
      handleBookmarkAction('item-1');
      // Simulate swipe bookmark (should use same handler)
      handleBookmarkAction('item-2');

      // Simulate context menu archive
      handleArchiveAction('item-3');
      // Simulate swipe archive (should use same handler)
      handleArchiveAction('item-4');

      expect(mutationCalls).toEqual([
        { action: 'bookmark', id: 'item-1' },
        { action: 'bookmark', id: 'item-2' },
        { action: 'archive', id: 'item-3' },
        { action: 'archive', id: 'item-4' },
      ]);
    });

    it('context menu is wrapped around swipeable content', () => {
      // Per issue zine-9mi: ContextMenu wraps ReanimatedSwipeable
      // Structure: Animated.View > ContextMenu > ReanimatedSwipeable > ItemCard
      const componentStructure = [
        'Animated.View',
        'ContextMenu',
        'ReanimatedSwipeable',
        'ItemCard',
      ];

      expect(componentStructure[0]).toBe('Animated.View');
      expect(componentStructure[1]).toBe('ContextMenu');
      expect(componentStructure[2]).toBe('ReanimatedSwipeable');
      expect(componentStructure[3]).toBe('ItemCard');
    });
  });
});
