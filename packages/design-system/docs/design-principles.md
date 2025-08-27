# Design Principles

Core principles that guide the Zine Design System.

## 1. Platform Harmony

### Principle
Components should feel native to their platform while maintaining visual consistency.

### In Practice
- Use platform-specific interactions (hover on web, press feedback on mobile)
- Respect platform conventions (back buttons, navigation patterns)
- Optimize for each platform's strengths

### Example
```tsx
// Button adapts to platform automatically
<Button onPress={handlePress}>
  Save
</Button>
// Web: Shows hover state, uses cursor pointer
// Mobile: Shows press feedback, uses native touch handling
```

## 2. Consistency Over Customization

### Principle
Limit options to ensure consistency across the application.

### In Practice
- Provide semantic variants instead of arbitrary styles
- Use design tokens for all values
- Avoid one-off customizations

### Example
```tsx
// ✅ Good - Semantic variant
<Button variant="primary">Save</Button>

// ❌ Avoid - Custom styling
<Button style={{ backgroundColor: '#custom' }}>Save</Button>
```

## 3. Accessibility First

### Principle
Every component must be accessible by default.

### In Practice
- Include ARIA attributes automatically
- Support keyboard navigation on web
- Ensure sufficient color contrast
- Provide screen reader support

### Example
```tsx
// Component handles accessibility internally
<Switch 
  checked={enabled}
  onCheckedChange={setEnabled}
  label="Enable notifications" // Automatically adds aria-label
/>
```

## 4. Progressive Disclosure

### Principle
Show only what's necessary, when it's necessary.

### In Practice
- Start with simple APIs
- Add complexity through composition
- Hide advanced features behind optional props

### Example
```tsx
// Simple usage
<Card>
  <Text>Content</Text>
</Card>

// Advanced usage when needed
<Card 
  variant="elevated"
  pressable
  onPress={handlePress}
  padding="lg"
>
  <Card.Header>
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Content>
    <Text>Content</Text>
  </Card.Content>
</Card>
```

## 5. Performance by Default

### Principle
Components should be fast without extra optimization.

### In Practice
- Lazy load heavy components
- Use platform-optimized rendering
- Minimize re-renders
- Tree-shake unused code

### Example
```tsx
// Components are automatically optimized
import { Button } from '@zine/design-system';
// Only Button code is included in bundle
```

## 6. Dark Mode Native

### Principle
Dark mode is a first-class citizen, not an afterthought.

### In Practice
- All components support dark mode automatically
- Use semantic colors that adapt to theme
- Test in both light and dark modes
- Respect system preferences

### Example
```tsx
// Components automatically adapt to theme
<Card>
  <Text>This text color changes with theme</Text>
</Card>
// No dark: prefixes needed
```

## 7. Clear Feedback

### Principle
Users should always know what's happening.

### In Practice
- Show loading states
- Provide error messages
- Confirm destructive actions
- Indicate success

### Example
```tsx
// Built-in loading state
<Button loading disabled>
  <Spinner size="sm" /> Processing...
</Button>

// Clear error feedback
<Input 
  value={email}
  onChangeText={setEmail}
  error="Invalid email address"
/>
```

## 8. Mobile-First Responsive

### Principle
Design for mobile first, enhance for larger screens.

### In Practice
- Start with mobile layout
- Add complexity for tablets/desktop
- Use responsive design tokens
- Test at all breakpoints

### Example
```tsx
// Responsive by default
<Stack spacing="md">
  {items.map(item => (
    <Card key={item.id}>
      {/* Stacks vertically on mobile, grid on desktop */}
    </Card>
  ))}
</Stack>
```

## 9. Predictable Behavior

### Principle
Components should work as expected, every time.

### In Practice
- Follow established patterns
- Use consistent naming
- Document edge cases
- Avoid surprising behavior

### Example
```tsx
// onPress works the same everywhere
<Button onPress={handlePress}>Click me</Button>
<Card pressable onPress={handlePress}>Click me</Card>
<Link onPress={handlePress}>Click me</Link>
// All use onPress, not onClick/onTap/onActivate
```

## 10. Developer Experience

### Principle
The design system should be a joy to use.

### In Practice
- Provide excellent TypeScript support
- Include helpful error messages
- Offer clear documentation
- Make common tasks easy

### Example
```tsx
// TypeScript helps you
<Button 
  variant="primar" // ❌ TypeScript error: Did you mean "primary"?
  onClik={handle}  // ❌ TypeScript error: Did you mean "onPress"?
>
```

## Applying These Principles

### When Creating Components

1. **Start with the simplest API** that solves the problem
2. **Consider both platforms** from the beginning
3. **Build in accessibility** as you go
4. **Test in both themes** before finishing
5. **Document the why**, not just the what

### When Using Components

1. **Use semantic variants** over custom styles
2. **Let components handle** platform differences
3. **Trust the defaults** - they're designed to work well
4. **Compose simple components** for complex UIs
5. **Report issues** if something doesn't feel right

### When Reviewing Code

1. **Check for consistency** with existing patterns
2. **Verify accessibility** is maintained
3. **Ensure platform parity** where appropriate
4. **Look for performance issues** early
5. **Test the developer experience** yourself

## Trade-offs

Sometimes principles conflict. Here's how we prioritize:

1. **Accessibility > Visual Design** - Never sacrifice accessibility for looks
2. **Consistency > Flexibility** - Limit options to maintain consistency
3. **Platform Convention > Cross-platform Consistency** - Respect platform norms
4. **Performance > Features** - Fast is a feature
5. **Simplicity > Completeness** - Better to do less, well

## Evolution

These principles will evolve as we learn. When proposing changes:

1. **Identify the problem** the change solves
2. **Consider the trade-offs** with existing principles
3. **Test with real usage** before committing
4. **Document the decision** for future reference
5. **Migrate gradually** to avoid disruption