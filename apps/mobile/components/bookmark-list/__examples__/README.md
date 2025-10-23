# Swipeable Item Examples

This directory contains example components for validating the `react-native-swipeable-item` library setup.

## Components

### SwipeableItemExample

A basic test component that demonstrates:
- Left swipe action (Archive - green)
- Right swipe action (Delete - red)
- Animated underlay with opacity interpolation
- Snap points configuration
- Basic swipe gesture handling

## Usage

To test the swipeable item setup, you can temporarily import and render this component in any screen:

```typescript
import { SwipeableItemExample } from '../components/bookmark-list/__examples__';

// In your screen component:
return <SwipeableItemExample />;
```

## Validation Checklist

- ✅ Component renders without errors
- ✅ Left swipe reveals green archive action
- ✅ Right swipe reveals red delete action
- ✅ Underlay opacity animates smoothly
- ✅ Item snaps to 80px width at snap point
- ✅ Item can be swiped back to center
- ✅ Console logs swipe change events

## Next Steps

Once validated, this example confirms that:
1. `react-native-swipeable-item` is installed correctly
2. `react-native-gesture-handler` is configured properly
3. `react-native-reanimated` is working with the library
4. The basic API patterns are functional

You can now proceed with Phase 2: Creating the production SwipeableBookmarkItem wrapper.
