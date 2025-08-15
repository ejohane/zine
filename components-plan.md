# Zine Design System Components Development Plan

## Project Overview

Build comprehensive design system components and theme configuration needed to create the Zine app interface, focusing on reusable building blocks that can be composed into any page layout.

---

## Phase 1: Theme & Design Tokens Enhancement (Week 1)

### Epic: Theme System Setup

Extend the existing design tokens to support all UI requirements from the designs.

#### User Stories

**US-1.1: Gradient Color System**

- **As a** developer
- **I want** a comprehensive gradient system
- **So that** I can apply consistent gradients to cards and backgrounds
- **Acceptance Criteria:**
  - [ ] Define gradient presets for orange, pink, blue, green, purple
  - [ ] Each gradient has `from` and `to` color values
  - [ ] Gradients work with both CSS and Tailwind classes
  - [ ] Support for diagonal and radial gradients
  - [ ] Export as CSS variables and JS tokens

**US-1.2: Dark/Light Theme Configuration**

- **As a** developer
- **I want** complete theme configurations
- **So that** components automatically adapt to theme changes
- **Acceptance Criteria:**
  - [ ] Dark theme with #171717 background, proper contrast
  - [ ] Light theme with #fafafa background
  - [ ] Theme-aware color tokens (background, foreground, card, muted)
  - [ ] CSS variables update on theme change
  - [ ] ThemeProvider component for context
  - [ ] useTheme hook for components

**US-1.3: Enhanced Typography Scale**

- **As a** developer
- **I want** typography tokens for all text styles in the design
- **So that** text is consistent throughout the app
- **Acceptance Criteria:**
  - [ ] Greeting text size (3xl/4xl)
  - [ ] Section header size (lg/xl)
  - [ ] Card title size (base/lg)
  - [ ] Card subtitle size (sm)
  - [ ] Badge text size (xs)
  - [ ] Meta text size (xs) for durations and counts
  - [ ] Line height and letter spacing for each size

**US-1.4: Platform Color Tokens**

- **As a** developer
- **I want** platform-specific color tokens
- **So that** I can style content based on its source
- **Acceptance Criteria:**
  - [ ] Define colors for Spotify, YouTube, Apple, Google, RSS
  - [ ] Platform gradient variations
  - [ ] Accessible color contrast ratios
  - [ ] TypeScript types for platform names

---

## Phase 2: Layout Components (Week 1)

### Epic: Foundational Layout System

Create flexible layout components that handle responsive design and spacing.

#### User Stories

**US-2.1: AppShell Component**

- **As a** developer
- **I want** an app shell component
- **So that** I can have consistent app structure with navigation
- **Acceptance Criteria:**
  - [ ] Accepts header, footer, and main content slots
  - [ ] Handles safe area insets for mobile
  - [ ] Manages scroll behavior
  - [ ] Theme-aware background colors
  - [ ] Props for fullHeight, noPadding options
  - [ ] Storybook stories for different configurations

**US-2.2: Container Component**

- **As a** developer
- **I want** a responsive container component
- **So that** content has consistent padding and max-width
- **Acceptance Criteria:**
  - [ ] Mobile padding: 16px
  - [ ] Desktop padding: 24px
  - [ ] Optional max-width constraint (1280px)
  - [ ] Props: size (sm, md, lg, full), noPadding
  - [ ] Proper TypeScript types

**US-2.3: Section Component**

- **As a** developer
- **I want** a section component with header
- **So that** I can create consistent content sections
- **Acceptance Criteria:**
  - [ ] Built-in section header with title
  - [ ] Optional "See all" action link
  - [ ] Consistent spacing (24px top, 16px bottom)
  - [ ] Props: title, action, onAction, children
  - [ ] Support for custom header content

**US-2.4: Grid Component**

- **As a** developer
- **I want** a responsive grid component
- **So that** I can layout cards responsively
- **Acceptance Criteria:**
  - [ ] Props for columns at each breakpoint
  - [ ] Gap prop (using spacing tokens)
  - [ ] Support for different column configs (1, 2, 3, 4)
  - [ ] CSS Grid based implementation
  - [ ] AutoFit and AutoFill variants

---

## Phase 3: Navigation Components (Week 1-2)

### Epic: Navigation System

Build navigation components for app-wide navigation patterns.

#### User Stories

**US-3.1: BottomNav Component**

- **As a** developer
- **I want** a bottom navigation component
- **So that** I can implement mobile navigation
- **Acceptance Criteria:**
  - [ ] Support for 3-5 navigation items
  - [ ] Active state styling
  - [ ] Icon + label layout
  - [ ] Fixed positioning for mobile
  - [ ] Props: items array with icon, label, href, isActive
  - [ ] Theme-aware colors
  - [ ] Smooth active state transitions

**US-3.2: NavItem Component**

- **As a** developer
- **I want** individual nav item components
- **So that** I can build custom navigation patterns
- **Acceptance Criteria:**
  - [ ] Icon above label layout
  - [ ] Active/inactive states
  - [ ] Hover states for desktop
  - [ ] Press states for mobile
  - [ ] Color customization for active state
  - [ ] Accessible focus states

**US-3.3: QuickActionButton Component**

- **As a** developer
- **I want** a quick action button component
- **So that** I can create action grids
- **Acceptance Criteria:**
  - [ ] Card-style container with hover states
  - [ ] Icon centered above label
  - [ ] Consistent height (100px mobile, 80px desktop)
  - [ ] Props: icon, label, onClick, variant
  - [ ] Theme-aware backgrounds
  - [ ] Loading state support

**US-3.4: QuickActionGrid Component**

- **As a** developer
- **I want** a quick action grid component
- **So that** I can layout action buttons
- **Acceptance Criteria:**
  - [ ] 2x2 grid on mobile
  - [ ] 4 columns on desktop
  - [ ] Accepts array of action items
  - [ ] Consistent gap spacing (8px)
  - [ ] Props: actions array, columns config

---

## Phase 4: Card Components (Week 2)

### Epic: Content Card System

Create flexible card components for displaying various content types.

#### User Stories

**US-4.1: BaseCard Component**

- **As a** developer
- **I want** a base card component
- **So that** all cards have consistent styling
- **Acceptance Criteria:**
  - [ ] Rounded corners (radius-lg)
  - [ ] Theme-aware background
  - [ ] Optional border/elevation
  - [ ] Hover lift animation
  - [ ] Press state for mobile
  - [ ] Props: variant, onClick, className

**US-4.2: MediaCard Component**

- **As a** developer
- **I want** a media card component
- **So that** I can display video, podcast, and article content
- **Acceptance Criteria:**
  - [ ] Gradient background based on type
  - [ ] Badge component for media type
  - [ ] Center icon based on type
  - [ ] Optional duration indicator
  - [ ] Title and subtitle below card
  - [ ] Props: type, title, subtitle, duration, gradient, icon
  - [ ] Responsive sizing
  - [ ] Loading skeleton variant

**US-4.3: CollectionCard Component**

- **As a** developer
- **I want** a collection card component
- **So that** I can display playlists and collections
- **Acceptance Criteria:**
  - [ ] Larger size than media cards
  - [ ] Gradient background support
  - [ ] Badge for collection type
  - [ ] Large centered icon
  - [ ] Item count display
  - [ ] Props: type, title, count, gradient, icon
  - [ ] Theme-aware text colors

**US-4.4: CardGradient Component**

- **As a** developer
- **I want** a gradient background component
- **So that** I can apply consistent gradients to cards
- **Acceptance Criteria:**
  - [ ] Accepts gradient name or custom colors
  - [ ] Proper border radius inheritance
  - [ ] Position absolute to fill parent
  - [ ] Support for overlay content
  - [ ] Performance optimized (will-change)

---

## Phase 5: Content Components (Week 2)

### Epic: Content Display Components

Build components for displaying content metadata and information.

#### User Stories

**US-5.1: Badge Component Enhancement**

- **As a** developer
- **I want** enhanced badge components
- **So that** I can label content types
- **Acceptance Criteria:**
  - [ ] Existing badge with new variants
  - [ ] Black background variant for overlays
  - [ ] Size variants (xs, sm, md)
  - [ ] Uppercase text option
  - [ ] Props: variant, size, uppercase
  - [ ] Support for media type badges (VIDEO, PODCAST, ARTICLE)

**US-5.2: MediaIndicator Component**

- **As a** developer
- **I want** a media indicator component
- **So that** I can show duration, counts, and metadata
- **Acceptance Criteria:**
  - [ ] Duration format (12:34)
  - [ ] Count format (12 items)
  - [ ] Position absolute for overlay use
  - [ ] Black background with white text
  - [ ] Props: value, type (duration/count), position
  - [ ] Small rounded corners

**US-5.3: IconButton Component**

- **As a** developer
- **I want** a consistent icon button component
- **So that** I can add icon actions throughout the app
- **Acceptance Criteria:**
  - [ ] Multiple sizes (sm, md, lg)
  - [ ] Ghost, outline, filled variants
  - [ ] Hover and focus states
  - [ ] Loading state support
  - [ ] Props: icon, variant, size, onClick
  - [ ] Accessibility labels

**US-5.4: Greeting Component**

- **As a** developer
- **I want** a time-based greeting component
- **So that** I can show personalized greetings
- **Acceptance Criteria:**
  - [ ] Auto-detects time of day
  - [ ] Shows current date
  - [ ] Props: name (optional), showDate
  - [ ] Large typography for greeting
  - [ ] Muted color for date
  - [ ] Internationalization ready

---

## Phase 6: Composite Components (Week 2-3)

### Epic: Higher-Order Components

Create composite components that combine primitives for common patterns.

#### User Stories

**US-6.1: SectionHeader Component**

- **As a** developer
- **I want** a section header component
- **So that** I can create consistent section titles
- **Acceptance Criteria:**
  - [ ] Title with proper typography
  - [ ] Optional "See all" link
  - [ ] Custom action support
  - [ ] Props: title, showAction, actionText, onAction
  - [ ] Consistent spacing
  - [ ] Theme-aware colors

**US-6.2: MediaCardGrid Component**

- **As a** developer
- **I want** a media card grid component
- **So that** I can display collections of media cards
- **Acceptance Criteria:**
  - [ ] Accepts array of media items
  - [ ] Responsive column layout
  - [ ] Horizontal scroll on mobile (optional)
  - [ ] Loading state with skeletons
  - [ ] Empty state support
  - [ ] Props: items, loading, emptyMessage, scrollable

**US-6.3: CollectionGrid Component**

- **As a** developer
- **I want** a collection grid component
- **So that** I can display collections of playlists
- **Acceptance Criteria:**
  - [ ] 2x2 grid on mobile
  - [ ] 4+ columns on desktop
  - [ ] Accepts array of collection items
  - [ ] Loading and empty states
  - [ ] Props: collections, loading, columns

---

## Phase 7: Utility Components & Hooks (Week 3)

### Epic: Supporting Utilities

Create utility components and hooks for common functionality.

#### User Stories

**US-7.1: Skeleton Component Variants**

- **As a** developer
- **I want** skeleton loading components
- **So that** I can show loading states consistently
- **Acceptance Criteria:**
  - [ ] MediaCardSkeleton
  - [ ] CollectionCardSkeleton
  - [ ] TextSkeleton with different lengths
  - [ ] Pulse animation
  - [ ] Theme-aware colors

**US-7.2: useMediaQuery Hook**

- **As a** developer
- **I want** a media query hook
- **So that** I can handle responsive behavior in components
- **Acceptance Criteria:**
  - [ ] Accepts query string or breakpoint name
  - [ ] Returns boolean for match
  - [ ] SSR safe
  - [ ] TypeScript types for breakpoints

**US-7.3: useTimeOfDay Hook**

- **As a** developer
- **I want** a time of day hook
- **So that** greeting components can be time-aware
- **Acceptance Criteria:**
  - [ ] Returns morning/afternoon/evening
  - [ ] Configurable time ranges
  - [ ] Updates at period boundaries
  - [ ] Locale support

---

## Phase 8: Storybook Documentation (Week 3)

### Epic: Component Documentation

Document all components in Storybook with examples and guidelines.

#### User Stories

**US-8.1: Component Stories**

- **As a** developer
- **I want** comprehensive Storybook stories
- **So that** I can see all component variations
- **Acceptance Criteria:**
  - [ ] Story for each component variant
  - [ ] Controls for all props
  - [ ] Dark/light theme toggle
  - [ ] Mobile/desktop viewports
  - [ ] Usage examples
  - [ ] Copy-paste code snippets

**US-8.2: Design Token Documentation**

- **As a** developer
- **I want** visual design token documentation
- **So that** I can reference colors, spacing, and typography
- **Acceptance Criteria:**
  - [ ] Color palette display
  - [ ] Gradient showcase
  - [ ] Typography specimens
  - [ ] Spacing visualizations
  - [ ] Platform color reference

---

## Technical Specifications

### Component File Structure

```
components/
├── primitives/
│   ├── Badge/
│   │   ├── Badge.tsx
│   │   ├── Badge.stories.tsx
│   │   ├── Badge.test.tsx
│   │   └── index.ts
│   └── ...
├── layout/
│   ├── AppShell/
│   ├── Container/
│   ├── Grid/
│   └── Section/
├── navigation/
│   ├── BottomNav/
│   ├── NavItem/
│   └── QuickActionButton/
├── cards/
│   ├── BaseCard/
│   ├── MediaCard/
│   └── CollectionCard/
└── composite/
    ├── MediaCardGrid/
    └── SectionHeader/
```

### Design Token Structure

```typescript
// Enhanced token structure
export const theme = {
  colors: {
    // Base colors
    background: "var(--background)",
    foreground: "var(--foreground)",

    // Gradients
    gradients: {
      orange: {
        from: "#ff6b35",
        to: "#ff8f65",
        css: "linear-gradient(135deg, #ff6b35 0%, #ff8f65 100%)",
      },
      pink: {
        from: "#ec4899",
        to: "#f472b6",
        css: "linear-gradient(135deg, #ec4899 0%, #f472b6 100%)",
      },
      blue: {
        from: "#3b82f6",
        to: "#60a5fa",
        css: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)",
      },
      green: {
        from: "#10b981",
        to: "#34d399",
        css: "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
      },
      purple: {
        from: "#8b5cf6",
        to: "#a78bfa",
        css: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
      },
    },

    // Platform colors
    platforms: {
      spotify: "#1DB954",
      youtube: "#FF0000",
      apple: "#FC3C44",
      google: "#4285F4",
      rss: "#FFA500",
    },
  },

  spacing: {
    xs: "0.5rem", // 8px
    sm: "0.75rem", // 12px
    md: "1rem", // 16px
    lg: "1.5rem", // 24px
    xl: "2rem", // 32px
    "2xl": "3rem", // 48px
  },

  typography: {
    fonts: {
      sans: "Inter, system-ui, -apple-system, sans-serif",
      mono: "JetBrains Mono, monospace",
      display: "Cal Sans, Inter, sans-serif",
    },
    sizes: {
      xs: "0.75rem", // 12px
      sm: "0.875rem", // 14px
      base: "1rem", // 16px
      lg: "1.125rem", // 18px
      xl: "1.25rem", // 20px
      "2xl": "1.5rem", // 24px
      "3xl": "1.875rem", // 30px
      "4xl": "2.25rem", // 36px
    },
  },

  breakpoints: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  },
};
```

### Definition of Done for Components

- [ ] Component matches design specifications
- [ ] TypeScript types are comprehensive
- [ ] Component is theme-aware
- [ ] Responsive behavior implemented
- [ ] Storybook stories cover all variants
- [ ] Unit tests written with >80% coverage
- [ ] Accessibility requirements met
- [ ] Component exported from package index
- [ ] README documentation written

---

## Success Metrics

- **Component Reusability**: Each component used in 3+ places
- **Theme Consistency**: 100% of components respect theme
- **TypeScript Coverage**: 100% type safety
- **Storybook Coverage**: Every component documented
- **Bundle Size**: Tree-shakeable, <50kb for core components
- **Performance**: Components render in <16ms

---

## Deliverables Checklist

### Phase 1: Theme & Tokens ⏱️ Week 1 ✅ COMPLETE

- [x] Gradient color system
- [x] Dark/light theme configuration
- [x] Enhanced typography scale
- [x] Platform color tokens

### Phase 2: Layout Components ⏱️ Week 1 ✅ COMPLETE

- [x] AppShell component
- [x] Container component
- [x] Section component
- [x] Grid component

### Phase 3: Navigation Components ⏱️ Week 1-2 ✅ COMPLETE

- [x] BottomNav component
- [x] NavItem component
- [x] QuickActionButton component
- [x] QuickActionGrid component

### Phase 4: Card Components ⏱️ Week 2

- [ ] BaseCard component
- [ ] MediaCard component
- [ ] CollectionCard component
- [ ] CardGradient component

### Phase 5: Content Components ⏱️ Week 2

- [ ] Badge component enhancement
- [ ] MediaIndicator component
- [ ] IconButton component
- [ ] Greeting component

### Phase 6: Composite Components ⏱️ Week 2-3

- [ ] SectionHeader component
- [ ] MediaCardGrid component
- [ ] CollectionGrid component

### Phase 7: Utilities ⏱️ Week 3

- [ ] Skeleton component variants
- [ ] useMediaQuery hook
- [ ] useTimeOfDay hook
- [ ] useTheme hook enhancement

### Phase 8: Documentation ⏱️ Week 3

- [ ] Component stories in Storybook
- [ ] Design token documentation
- [ ] Usage guidelines
- [ ] Code examples

---

## Implementation Notes

### Priority Order

1. **Critical Path**: Theme tokens → Layout components → Card components
2. **Parallel Work**: Navigation and Content components can be built simultaneously
3. **Dependencies**: Composite components require primitives to be complete

### Testing Strategy

- Unit tests for all logic
- Visual regression tests via Storybook
- Accessibility audits with axe-core
- Cross-browser testing (Chrome, Safari, Firefox, Edge)
- Mobile device testing (iOS Safari, Chrome Android)

### Performance Considerations

- Lazy load heavy components
- Use CSS transforms for animations
- Optimize gradient rendering with `will-change`
- Implement virtual scrolling for large lists
- Bundle size monitoring with size-limit

### Accessibility Requirements

- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader announcements
- Focus management
- Color contrast ratios (4.5:1 minimum)
- Touch target sizes (44x44px minimum)

---

## Getting Started

### Prerequisites

```bash
# Ensure design system package is initialized
cd packages/design-system

# Install dependencies
bun install

# Start Storybook for development
bun run storybook
```

### Development Workflow

1. Create component in appropriate directory
2. Add TypeScript types and props interface
3. Implement responsive behavior
4. Add theme support
5. Create Storybook stories
6. Write unit tests
7. Document in README
8. Export from package index

### Code Review Checklist

- [ ] Follows component structure convention
- [ ] TypeScript types are complete
- [ ] Storybook story demonstrates all variants
- [ ] Responsive behavior works correctly
- [ ] Theme switching works properly
- [ ] Accessibility requirements met
- [ ] Performance is optimized
- [ ] Documentation is complete

---

## Resources

### Design References

- [Figma Designs](#) - Link to design files
- [Brand Guidelines](#) - Link to brand documentation
- [Component Specifications](#) - Detailed component specs

### Technical Documentation

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [Storybook Documentation](https://storybook.js.org)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app)

### Tools & Libraries

- **Build**: tsup, Vite
- **Styling**: Tailwind CSS, CVA
- **Components**: Radix UI primitives
- **Documentation**: Storybook
- **Testing**: Vitest, Testing Library
- **Icons**: Lucide React

---

_Last Updated: August 11, 2025_  
_Version: 1.0.0_  
_Status: Ready for Implementation_
