# Zine Mobile App

A React Native mobile app for Zine built with Expo SDK 53 and Tamagui.

## Phase 1 Implementation ✅

### Completed Tasks

#### 1.1 Project Setup ✅
- ✅ Created `apps/mobile/zine` directory in monorepo
- ✅ Verified Expo SDK version 53 in `package.json`
- ✅ App configured with TypeScript template

#### 1.2 TypeScript Configuration ✅
- ✅ Configured `tsconfig.json` extending monorepo base config
- ✅ Added path aliases for `@/` imports
- ✅ Set up strict TypeScript rules matching web app
- ✅ Verified TypeScript compilation with `bun run type-check`

#### 1.3 Monorepo Integration ✅
- ✅ Updated package name to `@zine/mobile`
- ✅ Configured Turborepo tasks for mobile app in `turbo.json`
- ✅ Added mobile-specific scripts to root package.json
- ✅ Verified shared package imports work (`@zine/shared`)

#### 1.4 Tamagui Installation ✅
- ✅ Installed core Tamagui packages
- ✅ Installed `@tamagui/lucide-icons` for icon support
- ✅ React Native Reanimated is included and configured
- ✅ Created `tamagui.config.ts` with basic theme
- ✅ Tamagui provider wraps app root

#### 1.5 Tamagui Theme Configuration ✅
- ✅ Mapped existing web design tokens to Tamagui tokens
- ✅ Configured light theme with brand colors
- ✅ Configured dark theme with appropriate colors
- ✅ Set up typography scale matching web app
- ✅ Created spacing tokens (0-32)
- ✅ Theme switching works with system preference

#### 1.6 Expo Router Setup ✅
- ✅ Expo Router v5 is installed (latest version)
- ✅ Created basic `app/_layout.tsx` root layout with Tamagui
- ✅ Created `app/(tabs)/_layout.tsx` for tab navigation
- ✅ Created placeholder screens for tabs:
  - Feed (index.tsx)
  - Bookmarks (bookmarks.tsx)
  - Discover (discover.tsx)
  - Profile (profile.tsx)
- ✅ Navigation between tabs configured with Lucide icons

#### 1.7 Development Environment ✅
- ✅ Configured Metro bundler for monorepo (`metro.config.js`)
- ✅ Set up Babel config for Tamagui (`babel.config.js`)
- ✅ Added development scripts to `package.json`
- ✅ ESLint configured with React Native rules
- ✅ TypeScript compilation working

## Tech Stack

- **Expo SDK 53** - Latest Expo with React Native 0.79
- **React 19** - Latest React version
- **TypeScript 5.8** - Type safety
- **Tamagui** - Universal component library
- **Expo Router v5** - File-based routing
- **Lucide Icons** - Icon library via Tamagui

## Project Structure

```
apps/mobile/zine/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── index.tsx      # Feed screen
│   │   ├── bookmarks.tsx  # Bookmarks screen
│   │   ├── discover.tsx   # Discover screen
│   │   ├── profile.tsx    # Profile screen
│   │   └── _layout.tsx    # Tab layout
│   ├── _layout.tsx        # Root layout with Tamagui
│   └── +not-found.tsx     # 404 screen
├── components/            # Reusable components
├── hooks/                 # Custom hooks
├── assets/               # Images and fonts
├── tamagui.config.ts     # Tamagui theme configuration
├── babel.config.js       # Babel configuration
├── metro.config.js       # Metro bundler config
├── tsconfig.json         # TypeScript config
└── package.json          # Dependencies

```

## Getting Started

### Prerequisites

- Node.js 18+
- Bun package manager
- iOS Simulator (Mac only) or Android Emulator
- Expo Go app on your phone (optional)

### Installation

```bash
# From the root of the monorepo
bun install
```

### Running the App

```bash
# From monorepo root
bun run mobile

# Or directly from the mobile app directory
cd apps/mobile/zine
bun run start

# Run on iOS
bun run ios

# Run on Android
bun run android
```

### Development Commands

```bash
# Type checking
bun run type-check

# Linting
bun run lint

# Start development server
bun run dev
```

## Tamagui Theme

The app uses a custom Tamagui theme that matches the web app's design system:

- **Colors**: Primary (purple), Secondary (slate), Platform colors (Spotify, YouTube, etc.)
- **Spacing**: Consistent scale from 0-32 (0px to 128px)
- **Typography**: System font with multiple size scales
- **Dark/Light Mode**: Automatic based on system preference

## Next Steps (Phase 2)

- [ ] Set up TanStack Query for data fetching
- [ ] Configure API client
- [ ] Implement MMKV storage
- [ ] Add Clerk authentication
- [ ] Create reusable UI components

## Troubleshooting

### Module Resolution Issues
If you encounter module resolution errors, ensure:
1. Metro is configured correctly for the monorepo
2. TypeScript paths are properly set
3. Babel is configured with Tamagui plugin

### Build Issues
1. Clear Metro cache: `npx expo start -c`
2. Clear watchman: `watchman watch-del-all`
3. Reinstall dependencies: `bun install`

## Contributing

Follow the existing code patterns and ensure all TypeScript checks pass before committing.
