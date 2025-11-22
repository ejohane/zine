# Design Document: Swipeable List Architecture (React Native + Expo)

## 1. Overview

This document defines the component architecture, rendering model, gesture system, animation system, and lifecycle behaviors required to implement a high-fidelity, iOS-style swipeable list in a React Native application using Expo.

This solution is based on:

- **React Native Gesture Handler (Gesture API)**
- **Reanimated 3**
- **FlatList**
- **expo-haptics**

The swipeable row must support:

- Leading and trailing swipe actions
- Partial-swipe “open” states
- Full-swipe destructive or primary actions
- Only one open row at a time
- Close on scroll, tap outside, or another row opening
- Haptic feedback
- 60fps animation at any row count

---

## 2. High-Level Architecture

### 2.1 Component Structure

#### Components
1. **SwipeableList**
2. **SwipeableRow**
3. **SwipeActions** (optional abstraction)

### Component Tree

```
<SwipeableList>
  ├─ <SwipeableRow>
  │    ├─ Background: <SwipeActions left>
  │    ├─ Background: <SwipeActions right>
  │    └─ Foreground: <Animated.View rowContent>
```

---

## 3. SwipeableRow Design

### 3.1 Rendering Layers

#### Background Actions Layer
- Two absolutely-positioned containers:
  - Left actions
  - Right actions

#### Foreground Row (Animated Layer)
- `Animated.View` that translates based on gesture

### 3.2 Shared Values

| Name | Purpose |
|------|---------|
| translateX | Current horizontal offset |
| startX | Start offset |
| rowWidth | For thresholds |
| hasTriggeredHaptic | Prevents repeat vibration |

### 3.3 Swipe Boundaries

- Left max: `ACTION_WIDTH * numLeft`
- Right max: `-ACTION_WIDTH * numRight`
- Full swipe threshold: `rowWidth * 0.55`

### 3.4 Gesture Specification

#### onBegin
- Cache offsets

#### onUpdate
- Clamp translation
- Trigger haptics when crossing threshold

#### onEnd
Decision tree:

```
IF full swipe → execute primary action
ELSE IF partial open → snap to open
ELSE → snap closed
```

---

## 4. SwipeableList Design

### Responsibilities

- Manage open row
- Ensure only one row is open
- Close row on scroll
- Emit close signal

### State Model

```
openRowKey: string | null
closeSignal: number
```

---

## 5. Action System

### Action Definition

```
{
  key: string,
  label: string,
  color: string,
  icon?: ReactNode,
  isPrimary?: boolean,
  onPress: () => void
}
```

---

## 6. Haptic Feedback Integration

- Threshold crossing → light impact
- Full swipe action → success haptic

---

## 7. Accessibility Requirements

- `accessibilityActions`
- 48dp minimum target sizes

---

## 8. Performance Considerations

- Use `React.memo`
- Prefer `FlashList` for large lists
- Avoid re-renders
- All gesture logic stays on UI thread

---

## 9. File & Module Organization

```
src/components/swipeable-list/
  SwipeableList.tsx
  SwipeableRow.tsx
  SwipeActions.tsx
  gestureConstants.ts
  types.ts
```

---

## 10. Future Enhancements

- Elastic overscroll
- Icon scaling
- Momentum continuation
- Color interpolation
- Theme-aware actions
