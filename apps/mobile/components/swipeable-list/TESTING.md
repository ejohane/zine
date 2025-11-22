# SwipeableList Testing Guide

## Manual Testing

The swipeable list is tested through the manual test screen located at:
- **Path**: `apps/mobile/app/(app)/test-swipeable-list.tsx`
- **Access**: From the home screen, tap "Test Swipeable List"

### Test Cases

#### 1. Basic Swipe Gestures
- [ ] Swipe right to reveal left actions (Archive/gold circle)
- [ ] Swipe left to reveal right actions (Delete/green circle)
- [ ] Actions should fade in and scale from 0 to 1 as they're revealed
- [ ] Release midway should snap row back to closed position
- [ ] Swipe partially open and release - row should stay open

#### 2. Full-Swipe (Overshoot) Actions
- [ ] Swipe right past threshold - Archive action should trigger
- [ ] Swipe left past threshold - Delete action should trigger
- [ ] Alert dialog should appear with action confirmation
- [ ] Row should close after overshoot action completes
- [ ] **iOS Only**: Heavy haptic feedback on overshoot trigger

#### 3. Tap-to-Close
- [ ] Open a row by swiping
- [ ] Tap on the row content (not the action buttons)
- [ ] Row should close smoothly

#### 4. Close-on-Scroll
- [ ] Open a row by swiping
- [ ] Scroll the list up or down
- [ ] Open row should close immediately

#### 5. Single Open Row
- [ ] Open first row by swiping
- [ ] Open a different row
- [ ] First row should automatically close
- [ ] Only one row should be open at a time

#### 6. Action Button Press
- [ ] Swipe to reveal actions
- [ ] Tap on an action button (Archive or Delete)
- [ ] Action callback should fire (shows alert)
- [ ] **iOS Only**: Medium haptic feedback on action tap
- [ ] Row should close after action completes

#### 7. Haptic Feedback (iOS Only)
- [ ] Open row - Light haptic on threshold cross
- [ ] Tap action - Medium haptic on press
- [ ] Overshoot - Heavy haptic on primary action trigger

#### 8. Performance
- [ ] Scroll through list with 50+ items
- [ ] Animations should be smooth (60fps)
- [ ] No lag when opening/closing rows
- [ ] No memory leaks after repeated swipes

#### 9. Visual Polish
- [ ] Icon circles have black borders
- [ ] Actions fade in as they're revealed
- [ ] Actions scale from 0 to 1 smoothly
- [ ] Row content stays crisp during swipe
- [ ] No visual glitches or flashing

#### 10. Edge Cases
- [ ] Swipe on first item in list
- [ ] Swipe on last item in list
- [ ] Rapidly swipe multiple rows
- [ ] Swipe while scrolling
- [ ] Quick swipe (velocity) vs slow swipe

## Automated Testing

### Current Status
The mobile app does not currently have unit tests set up for React Native components.

### Why No Unit Tests?
1. **Complex Dependencies**: Testing `react-native-gesture-handler` requires extensive mocking
2. **Gesture Testing**: Proper gesture testing requires E2E tools (Detox, Maestro)
3. **Manual Test Coverage**: The manual test screen provides comprehensive coverage
4. **Component Simplicity**: Core logic is in the `Swipeable` component (already tested by RNGestureHandler)

### Future Automated Testing

If automated testing is needed, consider:

#### Option 1: E2E Tests with Detox
```bash
# Install Detox
npm install --save-dev detox

# Configure for iOS
detox init -r jest

# Write gesture tests
describe('Swipeable List', () => {
  it('should trigger delete on left swipe', async () => {
    await element(by.id('swipeable-row-1')).swipe('left', 'fast');
    await expect(element(by.text('Delete'))).toBeVisible();
  });
});
```

#### Option 2: Component Tests with React Native Testing Library
```bash
# Install dependencies
npm install --save-dev @testing-library/react-native @testing-library/jest-native

# Mock gesture handler
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable',
  RectButton: 'RectButton',
}));
```

## Test Data

The test screen uses mock data:
- 50 items with sequential IDs
- Mix of content types (Article, Video, Podcast, Twitter, YouTube)
- Each row has left action (Archive) and right action (Delete)

## Known Limitations

1. **Android Haptics**: Haptic feedback only works on iOS
2. **Performance**: Test on real device for accurate performance assessment
3. **Gesture Handler**: Some behaviors may differ between Expo Go and production builds

## Reporting Issues

When reporting bugs, include:
- Platform (iOS/Android)
- Device model
- Expo Go vs Production build
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/video if applicable
