# Zine - Mobile-First Bookmark Manager

> **Note:** Zine is now **mobile-first**. The React Native mobile app is the primary platform. The web app is maintained as a development/testing tool only.

A modern bookmark manager built with React Native, TypeScript, and Cloudflare. Features a mobile-native experience with HeroUI Native components.

## 🎯 Platform Focus

- **✅ Mobile App (Primary)**: React Native + Expo - Full-featured, actively maintained
- **⚠️ Web App (Tool Only)**: React SPA - Development/testing tool, not actively maintained

## Tech Stack

### Mobile App (Primary Platform)
- **Framework**: React Native 0.81 + Expo 54
- **UI**: HeroUI Native + NativeWind (Tailwind for React Native)
- **State**: TanStack Query
- **Auth**: Clerk Expo
- **Routing**: Expo Router

### Backend
- **API**: Hono + Cloudflare Workers
- **Database**: Cloudflare D1 + Drizzle ORM
- **Authentication**: Clerk
- **Hosting**: Cloudflare Workers

### Web App (Development Tool)
- **Framework**: React 19 + Vite
- **Routing**: TanStack Router
- **Status**: Maintained for development/testing only

### Shared Packages
- **Design System**: Mobile-only (HeroUI Native)
- **Shared**: Common types and utilities
- **API**: Backend services

## Project Structure

```
zine/
├── apps/
│   ├── mobile/       # 📱 React Native mobile app (PRIMARY)
│   └── web/          # 🌐 React SPA (development tool only)
├── packages/
│   ├── api/          # Hono API (Cloudflare Workers)
│   ├── shared/       # Shared types and utilities
│   └── design-system/# Mobile-only design system (HeroUI Native)
├── package.json      # Root package.json
├── turbo.json        # Turborepo configuration
└── tsconfig.json     # TypeScript configuration
```

## Getting Started

### Prerequisites
- **Bun** (package manager)
- **Expo CLI** (for mobile development)
- **Wrangler** (for API deployment)

### Installation

```bash
# Install dependencies
bun install
```

### Mobile App Development (Primary)

```bash
# Start mobile app
cd apps/mobile
bun run dev

# iOS
bun run ios

# Android
bun run android
```

### API Development

```bash
# Start API locally
cd packages/api
bun run dev
```

### Web App (Development Tool)

```bash
# Start web app (for testing/development only)
cd apps/web
bun run dev
```

## Database Setup

1. **Create D1 database**:
   ```bash
   cd packages/api
   wrangler d1 create zine-db
   ```

2. **Update wrangler.toml** with your database ID

3. **Generate and run migrations**:
   ```bash
   bun db:generate
   bun db:migrate
   ```

## Deployment

### Mobile App

```bash
cd apps/mobile

# iOS Preview Build
bun run build:ios:preview

# Android Preview Build
bun run build:android:preview

# Production builds use EAS
```

### API

```bash
cd packages/api
bun deploy:production
```

### Web App (Optional - for testing)

```bash
cd apps/web
bun deploy:production
```

## Development Commands

### Monorepo Commands
- `bun dev` - Start all development servers
- `bun build` - Build all packages
- `bun lint` - Run linting
- `bun type-check` - Run TypeScript checks
- `bun clean` - Clean build artifacts

### Mobile-Specific
- `bun run ios` - Start iOS app
- `bun run android` - Start Android app
- `bun run build:ios:preview` - Build iOS preview

## Design System

The design system is **mobile-only**, built with HeroUI Native:

```typescript
// Import from design system
import { Button, Card, BookmarkCard } from '@zine/design-system';

// All components are React Native compatible
<Button variant="primary" onPress={handlePress}>
  Click me
</Button>
```

See `packages/design-system/` for available components.

## Authentication

Zine uses Clerk for authentication:

- **Mobile**: `@clerk/clerk-expo`
- **Web**: `@clerk/clerk-react`
- **API**: Clerk secret key validation

Setup instructions in `CLAUDE.md`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes (focus on mobile app)
4. Run tests and linting
5. Submit a pull request

## Architecture Notes

- **Mobile-First**: All new features target the mobile app
- **Design System**: Mobile-only (heroui-native), web support removed
- **Web App**: Kept as development tool, not actively maintained
- **Monorepo**: Uses Turborepo for efficient builds

## License

MIT

---

**Primary Platform**: Mobile App (React Native)  
**Maintenance Status**: Active development on mobile, web tool-only