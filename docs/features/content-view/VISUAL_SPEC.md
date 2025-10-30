# Content View - Visual Specification

## Side-by-Side Comparison

### Bookmark Detail View (Current)
```
┌─────────────────────────────────┐
│  ← Bookmark            [share]  │  Header
├─────────────────────────────────┤
│                                 │
│    [HERO IMAGE - PARALLAX]      │  Hero Section (300px)
│         [Duration: 12:34]       │
│                                 │
├─────────────────────────────────┤
│  Title of the Bookmark          │  Title (26px, bold)
│  Goes Here on Multiple Lines    │
│                                 │
│  👤 Creator Name  •  2 days ago │  Creator Row
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔗 Open Link            │   │  Primary Action (52px)
│  └─────────────────────────┘   │  Orange background
│                                 │
│  ┌─────────────────────────┐   │
│  │ 📱 Open in...           │   │  Secondary Action (48px)
│  └─────────────────────────┘   │  Gray background
│                                 │
│  📦  📁  🏷️  🗑️              │  Action Icons Row
│  Archive Collections Tags Delete│  (48px each)
│                                 │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐  │  Metadata Cards
│  │📺  │ │👁   │ │📅  │ │⏱   │  │
│  │Type│ │Views│ │Date│ │Time│  │
│  └────┘ └────┘ └────┘ └────┘  │
│                                 │
│  Tags:  #tech  #video          │  Tags Section
│                                 │
│  Notes:                         │  Notes Section
│  My notes about this content... │
│                                 │
│  Description:                   │  Description
│  The full description text...   │
│                                 │
└─────────────────────────────────┘
```

### Content Preview View (NEW)
```
┌─────────────────────────────────┐
│  ← Preview             [share]  │  Header
├─────────────────────────────────┤
│                                 │
│    [HERO IMAGE - PARALLAX]      │  Hero Section (300px)
│         [Duration: 12:34]       │  ✅ SAME
│                                 │
├─────────────────────────────────┤
│  Title of the Content           │  Title (26px, bold)
│  Goes Here on Multiple Lines    │  ✅ SAME
│                                 │
│  👤 Creator Name  •  2 days ago │  Creator Row
│                                 │  ✅ SAME
│  ┌─────────────────────────┐   │
│  │ 🔖 Save to Bookmarks    │   │  PRIMARY (52px) ⭐ NEW
│  └─────────────────────────┘   │  Orange background
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔗 Open Link            │   │  Secondary (48px) ⬇️ MOVED
│  └─────────────────────────┘   │  Gray background
│                                 │
│                                 │  ❌ NO ACTION ICONS ROW
│                                 │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐  │  Metadata Cards
│  │📺  │ │👁   │ │📅  │ │⏱   │  │  ✅ SAME
│  │Type│ │Views│ │Date│ │Time│  │
│  └────┘ └────┘ └────┘ └────┘  │
│                                 │
│                                 │  ❌ NO TAGS (not saved)
│                                 │
│                                 │  ❌ NO NOTES (not saved)
│                                 │
│  Description:                   │  Description
│  The full description text...   │  ✅ SAME
│                                 │
└─────────────────────────────────┘
```

## Detailed Component Specs

### 1. Hero Section (Shared)
**Dimensions**: Full width × 300px height  
**Features**:
- Parallax scrolling effect (translates with scroll)
- Thumbnail image with fallback to placeholder
- Duration badge (bottom-right, 8px margin)
- Dark overlay on scroll (for header contrast)

**Identical in both views** ✅

---

### 2. Title (Shared)
**Typography**:
- Font size: 26px
- Font weight: 700 (bold)
- Line height: 32px
- Max lines: 3 (ellipsis after)
- Letter spacing: -0.5px

**Margin**: 0px top, 12px bottom

**Identical in both views** ✅

---

### 3. Creator Row (Shared)
**Layout**: Horizontal flex, space-between
- Left: Creator avatar (40px circle) + name + verified badge
- Right: Publish date (relative, e.g., "2 days ago")

**Typography**:
- Creator name: 16px, weight 600
- Date: 14px, weight 400, muted color

**Margin**: 12px top, 16px bottom

**Identical in both views** ✅

---

### 4. Action Buttons

#### Bookmark View
```
┌─────────────────────────┐
│ 🔗 Open Link            │  Primary (52px)
└─────────────────────────┘  Orange, prominent

┌─────────────────────────┐
│ 📱 Open in...           │  Secondary (48px)
└─────────────────────────┘  Gray, less prominent

📦  📁  🏷️  🗑️           Icon Row (48px each)
Archive Collections Tags Delete  4 icons, equal width
```

#### Content View
```
┌─────────────────────────┐
│ 🔖 Save to Bookmarks    │  PRIMARY (52px) ⭐
└─────────────────────────┘  Orange, prominent

┌─────────────────────────┐
│ 🔗 Open Link            │  Secondary (48px) ⬇️
└─────────────────────────┘  Gray, less prominent

(No icon row)
```

**Button Specs**:

| Property | Primary (Bookmark) | Primary (Content) | Secondary | Icons |
|----------|-------------------|-------------------|-----------|-------|
| Height | 52px | 52px | 48px | 48px |
| Border radius | 14px | 14px | 14px | 14px |
| Background | `colors.primary` | `colors.primary` | `colors.secondary` | `colors.secondary` |
| Foreground | `colors.primaryForeground` | `colors.primaryForeground` | `colors.foreground` | `colors.foreground` |
| Icon size | 20px | 20px | 18px | 20px |
| Text size | 16px (weight 700) | 16px (weight 700) | 15px (weight 600) | n/a |
| Gap (icon-text) | 8px | 8px | 8px | n/a |
| Padding vertical | 16px | 16px | 14px | 0px |

**Spacing**:
- Gap between primary and secondary: 12px
- Gap between secondary and icon row: 12px
- Margin top (from creator): 16px
- Margin bottom (to metadata): 20px

---

### 5. Metadata Cards (Shared)

**Layout**: Horizontal flex wrap, gap 12px

**Card Dimensions**:
- Min width: 90px (auto-expand with content)
- Padding: 12px
- Border radius: 12px
- Background: `colors.secondary`

**Card Content** (vertical stack, centered):
1. Icon (20px, colored by platform/type)
2. Label (12px, weight 500, muted)
3. Value (14px, weight 700, foreground)

**Card Types**:
- Content Type (video/podcast/article/post)
- View Count (videos only)
- Reading Time (articles only)
- Episode Number (podcasts only)
- Published Date (formatted)

**Identical in both views** ✅

---

### 6. Tags Section

**Bookmark View**: ✅ Displayed (if tags exist)
```
Tags:  #tech  #video  #howto
```

**Content View**: ❌ Hidden (content not saved, no user tags)

**When Shown**:
- Section title: "Tags" (18px, weight 700)
- Tags container: Horizontal flex wrap, gap 8px
- Tag pill: Orange background (20% opacity), orange text, 14px weight 600, 20px border radius, 14px horizontal padding, 8px vertical padding

---

### 7. Notes Section

**Bookmark View**: ✅ Displayed (if notes exist)
```
Notes:
My thoughts about this content...
```

**Content View**: ❌ Hidden (content not saved, no user notes)

**When Shown**:
- Section title: "Notes" (18px, weight 700)
- Notes card: Gray background, 16px padding, 12px border radius
- Notes text: 15px, line height 22px

---

### 8. Description Section (Shared)

**Display**: Linkified text (auto-detect URLs, make clickable)

**Typography**:
- Font size: 16px
- Line height: 24px
- Color: `colors.mutedForeground`

**Margin**: 0px top, 20px bottom

**Identical in both views** ✅

---

## Color Palette

### Light Mode
```typescript
colors = {
  primary: '#f97316',           // Orange (buttons, tags)
  primaryForeground: '#ffffff', // White (text on primary)
  secondary: '#f4f4f5',         // Light gray (cards, secondary buttons)
  foreground: '#171717',        // Dark gray (primary text)
  mutedForeground: '#737373',   // Medium gray (secondary text)
  destructive: '#ef4444',       // Red (delete button)
  card: '#ffffff',              // White (card backgrounds)
  background: '#ffffff',        // White (screen background)
}
```

### Dark Mode
```typescript
colors = {
  primary: '#f97316',           // Orange (same)
  primaryForeground: '#ffffff', // White (same)
  secondary: '#27272a',         // Dark gray (cards)
  foreground: '#fafafa',        // Light gray (primary text)
  mutedForeground: '#a1a1aa',   // Medium gray (secondary text)
  destructive: '#ef4444',       // Red (same)
  card: '#18181b',              // Very dark gray (cards)
  background: '#09090b',        // Almost black (screen background)
}
```

---

## Animation Specs

### Hero Parallax
```typescript
const imageTranslateY = scrollY.interpolate({
  inputRange: [-300, 0, 300],
  outputRange: [-150, 0, 225],  // Moves slower than scroll
  extrapolate: 'clamp',
});

const imageScale = scrollY.interpolate({
  inputRange: [-300, 0],
  outputRange: [2, 1],          // Zooms in on pull-down
  extrapolate: 'clamp',
});
```

### Button Press
```typescript
// Scale down on press
Animated.spring(scale, {
  toValue: 0.98,
  useNativeDriver: true,
  damping: 20,
  stiffness: 300,
});

// Haptic feedback
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
```

### Save Button Loading
```typescript
// Icon → Spinner transition
{isLoading ? (
  <ActivityIndicator size="small" color={colors.primaryForeground} />
) : (
  <Feather name="bookmark" size={20} color={colors.primaryForeground} />
)}
```

---

## Responsive Behavior

### Small Screens (< 375px width)
- Hero height: 250px (reduced from 300px)
- Title font size: 24px (reduced from 26px)
- Button text: May wrap to 2 lines
- Metadata cards: 2 columns (min-width respected)

### Large Screens (> 428px width)
- Hero height: 350px (increased from 300px)
- More metadata cards per row (3-4 instead of 2)
- Wider margins (24px instead of 20px)

### Landscape Orientation
- Hero height: 200px (reduced to show more content)
- Buttons stack horizontally if space allows

---

## Accessibility

### VoiceOver Labels

**Bookmark View**:
- Hero image: "Bookmark thumbnail, {title}"
- Open Link button: "Open link in browser, button"
- Archive button: "Archive bookmark, button"

**Content View**:
- Hero image: "Content thumbnail, {title}"
- Save button: "Save to bookmarks, button"
- Open Link button: "Open link in browser without saving, button"

### Focus Order
1. Back button (header)
2. Share button (header)
3. Title
4. Creator name (tappable)
5. Primary action button
6. Secondary action button
7. Action icons (if present)
8. Metadata cards
9. Tags (if present)
10. Notes (if present)
11. Description

### Color Contrast Ratios
- Primary button (orange on white): 4.8:1 ✅ WCAG AA
- Secondary button (dark gray on light gray): 12.6:1 ✅ WCAG AAA
- Title text (dark on white): 17.6:1 ✅ WCAG AAA
- Muted text (medium gray on white): 4.6:1 ✅ WCAG AA

---

## Loading States

### Skeleton (Initial Load)
```
┌─────────────────────────────────┐
│  ← Preview                      │
├─────────────────────────────────┤
│                                 │
│    [GRAY RECTANGLE]             │  Hero skeleton (opacity 0.3)
│                                 │
├─────────────────────────────────┤
│  ████████████                   │  Title line 1
│  ████████                       │  Title line 2
│                                 │
│  ⚫ ████████  •  ████           │  Creator + date
│                                 │
│  ████████████████████           │  Button 1
│  ████████████████████           │  Button 2
│                                 │
│  ▢ ▢ ▢ ▢                        │  Metadata cards
│                                 │
└─────────────────────────────────┘
```

### Save Button Loading
```
Before:                  During:                 After:
┌──────────────────┐    ┌──────────────────┐    Navigate to
│ 🔖 Save to...    │ →  │ ⏳ Save to...    │ →  /bookmark/[id]
└──────────────────┘    └──────────────────┘
```

### Error State
```
┌─────────────────────────────────┐
│  ← Preview                      │
├─────────────────────────────────┤
│                                 │
│         ⚠️                      │
│                                 │
│  Failed to load preview         │
│  Please check the URL and       │
│  try again                      │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔄 Retry                │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

---

## Platform-Specific Considerations

### iOS
- Use native navigation bar styling
- Swipe-back gesture to dismiss
- Modal presentation for preview (slide up)
- Haptic feedback on button presses

### Android
- Use Material Design ripple effect on buttons
- Back button to dismiss
- Full-screen presentation
- Vibration on button presses (optional)

### Tablets
- Larger margins (32px instead of 20px)
- Wider metadata card grid (4-5 columns)
- Larger hero image (400px height)

---

## Summary of Differences

| Element | Bookmark View | Content View |
|---------|---------------|--------------|
| **Hero Section** | ✅ Same | ✅ Same |
| **Title** | ✅ Same | ✅ Same |
| **Creator Row** | ✅ Same | ✅ Same |
| **Primary Button** | Open Link | **Save to Bookmarks** ⭐ |
| **Secondary Button** | Open in... | **Open Link** ⬇️ |
| **Action Icons** | Archive, Collections, Tags, Delete | **None** ❌ |
| **Metadata Cards** | ✅ Same | ✅ Same |
| **Tags Section** | ✅ Shown | **Hidden** ❌ |
| **Notes Section** | ✅ Shown | **Hidden** ❌ |
| **Description** | ✅ Same | ✅ Same |

**Key Takeaway**: Content view is **98% identical** to bookmark view, with only 3 changes:
1. Primary action is "Save" instead of "Open"
2. No action icons row (archive, delete, etc.)
3. No user-generated content (tags, notes)

This high degree of reusability makes the shared component architecture ideal.
