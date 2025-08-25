# @zine/design-tokens

Unified design tokens for the Zine app ecosystem.

## Overview

This package contains all the design tokens used across Zine's web and mobile applications. It provides a single source of truth for colors, typography, spacing, and other design values.

## Installation

```bash
bun add @zine/design-tokens
```

## Usage

### In TypeScript/JavaScript

```typescript
import { colors, spacing, typography, tokens } from '@zine/design-tokens';

// Use individual token groups
const primaryColor = colors.brand.primary[500];
const baseSpacing = spacing[4];

// Or use the unified tokens object
const { colors, spacing } = tokens;
```

### With Tailwind CSS

```javascript
// tailwind.config.js
const baseConfig = require('@zine/design-tokens/tailwind');

module.exports = {
  ...baseConfig,
  content: [
    // Add your content paths here
  ],
  // Extend or override as needed
};
```

## Token Categories

### Colors
- **Brand**: Primary and secondary brand colors
- **Neutral**: Gray scale from 0 (white) to 1000 (black)
- **Semantic**: Success, warning, error, and info colors
- **Platform**: Spotify, YouTube, Apple, Google, RSS, and Podcast colors
- **Functional**: Background, text, and border colors

### Typography
- **Font Families**: Sans, mono, and display fonts
- **Font Sizes**: From xs to 6xl with corresponding line heights
- **Font Weights**: From thin (100) to black (900)
- **Letter Spacing**: From tighter to widest
- **Line Heights**: Various line height options

### Spacing
- Comprehensive spacing scale from 0px to 384px
- Includes pixel-perfect values and common increments

### Breakpoints
- Mobile-first responsive breakpoints
- sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px

### Shadows
- Multiple shadow depths from sm to 2xl
- Inner shadow option

### Borders
- Border radius options from none to full
- Border width options

## Platform Support

- ✅ Web (React)
- ✅ Mobile (React Native with NativeWind)
- ✅ Desktop (Electron/Tauri)

## Development

```bash
# Type checking
bun run type-check
```