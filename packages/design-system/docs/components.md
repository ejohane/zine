# Component Documentation

Comprehensive documentation for all components in the Zine Design System.

## Table of Contents

- [Core Components](#core-components)
  - [Button](#button)
  - [Card](#card)
  - [Input](#input)
  - [Badge](#badge)
  - [Text](#text)
- [Layout Components](#layout-components)
  - [Stack](#stack)
  - [Box](#box)
  - [Flex](#flex)
- [Form Components](#form-components)
  - [Checkbox](#checkbox)
  - [Switch](#switch)
  - [Radio](#radio)
  - [Select](#select)
- [Feedback Components](#feedback-components)
  - [Skeleton](#skeleton)
  - [Spinner](#spinner)
  - [Alert](#alert)
- [Navigation Components](#navigation-components)
  - [Tabs](#tabs)
  - [Breadcrumb](#breadcrumb)
- [Pattern Components](#pattern-components)
  - [BookmarkCard](#bookmarkcard)
  - [MediaCard](#mediacard)
  - [QueueItem](#queueitem)

---

## Core Components

### Button

A versatile button component that works on both web and mobile platforms.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'primary' \| 'destructive' \| 'outline' \| 'ghost' \| 'link'` | `'default'` | Visual style variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `onPress` | `() => void` | - | Press handler (platform-aware) |
| `disabled` | `boolean` | `false` | Disable the button |
| `loading` | `boolean` | `false` | Show loading state |
| `fullWidth` | `boolean` | `false` | Make button full width |
| `icon` | `React.ReactNode` | - | Icon to display |
| `iconPosition` | `'left' \| 'right'` | `'left'` | Icon position |
| `children` | `React.ReactNode` | - | Button content |

#### Examples

```tsx
// Basic button
<Button onPress={() => console.log('Pressed')}>
  Click me
</Button>

// Primary button with icon
<Button variant="primary" icon={<SaveIcon />}>
  Save Changes
</Button>

// Loading state
<Button loading disabled>
  Processing...
</Button>

// Destructive action
<Button variant="destructive" onPress={handleDelete}>
  Delete Account
</Button>

// Full width button
<Button fullWidth variant="primary">
  Continue
</Button>
```

#### Platform Differences

- **Web**: Renders as `<button>` with hover states
- **Mobile**: Renders as `TouchableOpacity` with press feedback

---

### Card

A container component for grouping related content.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'elevated' \| 'filled' \| 'outline'` | `'default'` | Visual style variant |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Internal padding |
| `pressable` | `boolean` | `false` | Make card interactive |
| `onPress` | `() => void` | - | Press handler when pressable |
| `fullWidth` | `boolean` | `false` | Take full container width |
| `children` | `React.ReactNode` | - | Card content |

#### Sub-components

- `Card.Header` - Card header section
- `Card.Title` - Card title text
- `Card.Description` - Card description text
- `Card.Content` - Main card content
- `Card.Footer` - Card footer section

#### Examples

```tsx
// Basic card
<Card>
  <Card.Header>
    <Card.Title>Welcome</Card.Title>
    <Card.Description>Get started with your account</Card.Description>
  </Card.Header>
  <Card.Content>
    <Text>Your content here</Text>
  </Card.Content>
</Card>

// Pressable card
<Card variant="elevated" pressable onPress={handleCardPress}>
  <Card.Content>
    <Text>Click me!</Text>
  </Card.Content>
</Card>

// Card with footer
<Card variant="filled">
  <Card.Header>
    <Card.Title>Subscription</Card.Title>
  </Card.Header>
  <Card.Content>
    <Text>$9.99/month</Text>
  </Card.Content>
  <Card.Footer>
    <Button variant="primary">Subscribe</Button>
  </Card.Footer>
</Card>
```

---

### Input

Text input component with validation support.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `'text' \| 'email' \| 'password' \| 'number' \| 'tel' \| 'url'` | `'text'` | Input type |
| `placeholder` | `string` | - | Placeholder text |
| `value` | `string` | - | Input value |
| `onChangeText` | `(text: string) => void` | - | Change handler |
| `error` | `string` | - | Error message |
| `disabled` | `boolean` | `false` | Disable input |
| `multiline` | `boolean` | `false` | Enable multiline |
| `numberOfLines` | `number` | `1` | Number of lines (multiline) |
| `maxLength` | `number` | - | Maximum character length |
| `autoFocus` | `boolean` | `false` | Auto focus on mount |
| `secure` | `boolean` | `false` | Secure text entry |

#### Examples

```tsx
// Basic input
<Input 
  placeholder="Enter your name"
  value={name}
  onChangeText={setName}
/>

// Email input with validation
<Input 
  type="email"
  placeholder="Email address"
  value={email}
  onChangeText={setEmail}
  error={emailError}
/>

// Password input
<Input 
  type="password"
  placeholder="Password"
  secure
  value={password}
  onChangeText={setPassword}
/>

// Multiline input
<Input 
  multiline
  numberOfLines={4}
  placeholder="Enter your message"
  value={message}
  onChangeText={setMessage}
/>
```

---

### Badge

Small status indicator component.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'secondary' \| 'success' \| 'warning' \| 'destructive' \| 'outline'` | `'default'` | Visual variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Badge size |
| `children` | `React.ReactNode` | - | Badge content |

#### Examples

```tsx
// Status badges
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="destructive">Error</Badge>

// Size variants
<Badge size="sm">Small</Badge>
<Badge size="md">Medium</Badge>
<Badge size="lg">Large</Badge>

// With icons
<Badge variant="success">
  <CheckIcon /> Verified
</Badge>
```

---

### Text

Platform-aware text component with typography variants.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'h1' \| 'h2' \| 'h3' \| 'h4' \| 'body' \| 'caption' \| 'label'` | `'body'` | Typography variant |
| `weight` | `'normal' \| 'medium' \| 'semibold' \| 'bold'` | `'normal'` | Font weight |
| `align` | `'left' \| 'center' \| 'right' \| 'justify'` | `'left'` | Text alignment |
| `color` | `'default' \| 'muted' \| 'primary' \| 'destructive'` | `'default'` | Text color |
| `truncate` | `boolean` | `false` | Truncate with ellipsis |
| `numberOfLines` | `number` | - | Max lines (mobile) |
| `children` | `React.ReactNode` | - | Text content |

#### Examples

```tsx
// Headings
<Text variant="h1">Page Title</Text>
<Text variant="h2">Section Title</Text>
<Text variant="h3">Subsection</Text>

// Body text
<Text variant="body">
  Regular paragraph text with normal weight.
</Text>

// Styled text
<Text variant="body" weight="bold" color="primary">
  Important message
</Text>

// Truncated text
<Text variant="body" truncate numberOfLines={2}>
  Very long text that will be truncated after two lines...
</Text>

// Caption
<Text variant="caption" color="muted">
  Last updated 2 hours ago
</Text>
```

---

## Layout Components

### Stack

Vertical layout component with consistent spacing.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `spacing` | `'none' \| 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Space between items |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` | `'stretch'` | Horizontal alignment |
| `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around'` | `'start'` | Vertical distribution |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'none'` | Internal padding |
| `children` | `React.ReactNode` | - | Stack content |

#### Examples

```tsx
// Basic stack
<Stack spacing="md">
  <Text>Item 1</Text>
  <Text>Item 2</Text>
  <Text>Item 3</Text>
</Stack>

// Centered stack
<Stack spacing="lg" align="center">
  <Avatar />
  <Text variant="h3">User Name</Text>
  <Text variant="caption">@username</Text>
</Stack>

// Stack with padding
<Stack spacing="sm" padding="lg">
  <Input placeholder="Email" />
  <Input placeholder="Password" type="password" />
  <Button variant="primary">Sign In</Button>
</Stack>
```

---

### Box

Generic container component with styling props.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'none'` | Internal padding |
| `margin` | `'none' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'none'` | External margin |
| `background` | `'transparent' \| 'surface' \| 'muted' \| 'primary'` | `'transparent'` | Background color |
| `borderRadius` | `'none' \| 'sm' \| 'md' \| 'lg' \| 'full'` | `'none'` | Border radius |
| `borderColor` | `'none' \| 'border' \| 'primary' \| 'destructive'` | `'none'` | Border color |
| `shadow` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'none'` | Box shadow |
| `children` | `React.ReactNode` | - | Box content |

#### Examples

```tsx
// Basic box
<Box padding="md" background="surface">
  <Text>Content with padding</Text>
</Box>

// Card-like box
<Box 
  padding="lg" 
  background="surface" 
  borderRadius="lg" 
  shadow="md"
>
  <Text variant="h3">Custom Card</Text>
  <Text>Using Box component</Text>
</Box>

// Bordered box
<Box 
  padding="md" 
  borderColor="border" 
  borderRadius="md"
>
  <Text>Bordered content</Text>
</Box>
```

---

### Flex

Flexible box layout component.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `direction` | `'row' \| 'column' \| 'row-reverse' \| 'column-reverse'` | `'row'` | Flex direction |
| `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | `'start'` | Main axis alignment |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch' \| 'baseline'` | `'stretch'` | Cross axis alignment |
| `wrap` | `'nowrap' \| 'wrap' \| 'wrap-reverse'` | `'nowrap'` | Flex wrap |
| `gap` | `'none' \| 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'none'` | Gap between items |
| `children` | `React.ReactNode` | - | Flex content |

#### Examples

```tsx
// Horizontal layout
<Flex direction="row" justify="between" align="center">
  <Text>Left</Text>
  <Text>Right</Text>
</Flex>

// Centered content
<Flex justify="center" align="center" style={{ height: 200 }}>
  <Spinner />
</Flex>

// Wrapped items
<Flex wrap="wrap" gap="sm">
  <Badge>Tag 1</Badge>
  <Badge>Tag 2</Badge>
  <Badge>Tag 3</Badge>
</Flex>
```

---

## Form Components

### Checkbox

Checkbox input component.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `checked` | `boolean` | `false` | Checked state |
| `onCheckedChange` | `(checked: boolean) => void` | - | Change handler |
| `label` | `string` | - | Checkbox label |
| `disabled` | `boolean` | `false` | Disable checkbox |
| `error` | `string` | - | Error message |

#### Examples

```tsx
// Basic checkbox
<Checkbox 
  checked={agreed}
  onCheckedChange={setAgreed}
  label="I agree to the terms"
/>

// Disabled checkbox
<Checkbox 
  checked={true}
  disabled
  label="This option is locked"
/>

// With error
<Checkbox 
  checked={accepted}
  onCheckedChange={setAccepted}
  label="Accept privacy policy"
  error="You must accept to continue"
/>
```

---

### Switch

Toggle switch component.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `checked` | `boolean` | `false` | Switch state |
| `onCheckedChange` | `(checked: boolean) => void` | - | Change handler |
| `label` | `string` | - | Switch label |
| `disabled` | `boolean` | `false` | Disable switch |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Switch size |

#### Examples

```tsx
// Basic switch
<Switch 
  checked={notifications}
  onCheckedChange={setNotifications}
  label="Enable notifications"
/>

// Small switch
<Switch 
  size="sm"
  checked={autoSave}
  onCheckedChange={setAutoSave}
  label="Auto-save"
/>

// Disabled switch
<Switch 
  checked={true}
  disabled
  label="Premium feature"
/>
```

---

## Feedback Components

### Skeleton

Loading placeholder component.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'rectangle' \| 'text' \| 'avatar' \| 'card'` | `'rectangle'` | Skeleton variant |
| `width` | `string \| number` | `'100%'` | Skeleton width |
| `height` | `string \| number` | `20` | Skeleton height |
| `lines` | `number` | `1` | Number of text lines |
| `animated` | `boolean` | `true` | Enable animation |

#### Examples

```tsx
// Basic skeleton
<Skeleton width="100%" height={40} />

// Text skeleton
<Skeleton variant="text" lines={3} />

// Avatar skeleton
<Skeleton variant="avatar" />

// Card skeleton
<Skeleton variant="card" />

// Custom skeleton layout
<Stack spacing="sm">
  <Skeleton variant="avatar" />
  <Skeleton variant="text" width="60%" />
  <Skeleton variant="text" lines={2} />
</Stack>
```

---

### Spinner

Loading spinner component.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Spinner size |
| `color` | `'default' \| 'primary' \| 'muted'` | `'default'` | Spinner color |
| `label` | `string` | - | Loading label |

#### Examples

```tsx
// Basic spinner
<Spinner />

// Large primary spinner
<Spinner size="lg" color="primary" />

// With label
<Spinner label="Loading content..." />

// In button
<Button loading>
  <Spinner size="sm" /> Processing
</Button>
```

---

## Pattern Components

### BookmarkCard

Display saved bookmarks with metadata.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | - | Bookmark title |
| `description` | `string` | - | Bookmark description |
| `url` | `string` | - | Bookmark URL |
| `favicon` | `string` | - | Site favicon URL |
| `image` | `string` | - | Preview image URL |
| `platform` | `'web' \| 'youtube' \| 'spotify' \| 'apple'` | `'web'` | Content platform |
| `savedAt` | `Date` | - | Save date |
| `tags` | `string[]` | `[]` | Bookmark tags |
| `onPress` | `() => void` | - | Press handler |
| `onDelete` | `() => void` | - | Delete handler |
| `onShare` | `() => void` | - | Share handler |

#### Examples

```tsx
// Basic bookmark
<BookmarkCard
  title="Article Title"
  description="Interesting article about..."
  url="https://example.com/article"
  favicon="https://example.com/favicon.ico"
  savedAt={new Date()}
  onPress={() => openURL(url)}
/>

// YouTube bookmark
<BookmarkCard
  title="Video Title"
  description="Video description"
  url="https://youtube.com/watch?v=..."
  image="https://i.ytimg.com/..."
  platform="youtube"
  savedAt={new Date()}
  onPress={() => openVideo(url)}
  onShare={() => shareVideo(url)}
/>

// With tags
<BookmarkCard
  title="Tutorial"
  description="How to build..."
  url="https://example.com"
  tags={['tutorial', 'javascript', 'react']}
  onPress={() => openURL(url)}
  onDelete={() => deleteBookmark(id)}
/>
```

---

### MediaCard

Display media content like videos and podcasts.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `'video' \| 'podcast' \| 'music'` | - | Media type |
| `title` | `string` | - | Media title |
| `creator` | `string` | - | Creator name |
| `thumbnail` | `string` | - | Thumbnail URL |
| `duration` | `number` | - | Duration in seconds |
| `progress` | `number` | `0` | Watch/listen progress |
| `platform` | `'youtube' \| 'spotify' \| 'apple'` | - | Media platform |
| `onPlay` | `() => void` | - | Play handler |
| `onQueue` | `() => void` | - | Add to queue handler |

#### Examples

```tsx
// YouTube video
<MediaCard
  type="video"
  title="React Tutorial"
  creator="Code Channel"
  thumbnail="https://..."
  duration={1200}
  progress={600}
  platform="youtube"
  onPlay={() => playVideo(id)}
  onQueue={() => addToQueue(id)}
/>

// Spotify podcast
<MediaCard
  type="podcast"
  title="Tech Talk Episode 42"
  creator="Tech Podcast"
  thumbnail="https://..."
  duration={3600}
  platform="spotify"
  onPlay={() => playPodcast(id)}
/>

// Apple Music
<MediaCard
  type="music"
  title="Song Title"
  creator="Artist Name"
  thumbnail="https://..."
  duration={240}
  platform="apple"
  onPlay={() => playSong(id)}
/>
```

---

## Platform Considerations

### Web-Specific Features

- Hover states on interactive components
- Keyboard navigation support
- Focus indicators
- Cursor styles
- CSS transitions

### Mobile-Specific Features

- Touch feedback
- Native gestures
- Platform-specific styling (iOS vs Android)
- Safe area insets
- Haptic feedback (where available)

### Writing Platform-Aware Code

```tsx
import { platformSelect, isWeb } from '@zine/design-system';

// Platform-specific styles
const styles = {
  container: platformSelect({
    web: { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    ios: { shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 4 }
  })
};

// Conditional rendering
{isWeb() && <WebOnlyFeature />}

// Platform-aware props
<Button 
  onPress={handlePress} // Works on both platforms
  style={styles.container}
>
  Universal Button
</Button>
```

## Best Practices

1. **Always use semantic variants** - Choose variants that communicate intent
2. **Leverage platform detection** - Let components handle platform differences
3. **Use design tokens** - Maintain consistency across the app
4. **Handle loading states** - Show skeletons or spinners during data fetching
5. **Provide feedback** - Use appropriate feedback components for user actions
6. **Test on both platforms** - Ensure components work well on web and mobile
7. **Follow accessibility guidelines** - Use proper labels and ARIA attributes
8. **Keep it simple** - Use the simplest component that meets your needs

## Contributing New Components

When adding new components:

1. Create both `.web.tsx` and `.native.tsx` implementations
2. Export from the main index file
3. Add TypeScript types
4. Include in this documentation
5. Add Storybook stories
6. Write unit tests
7. Ensure theme support
8. Test on both platforms