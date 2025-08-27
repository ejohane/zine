# Zine - Universal Bookmark & Content Manager

A modern, platform-aware bookmark and content manager supporting web and mobile platforms with a unified design system.

## 🚀 Tech Stack

### Frontend
- **Web App**: React + TypeScript + Vite
- **Mobile App**: React Native + Expo
- **Routing**: TanStack Router (web) / Expo Router (mobile)
- **Design System**: Unified component library (@zine/design-system)
- **Styling**: Tailwind CSS (web) / NativeWind (mobile)
- **State Management**: TanStack Query + Zustand

### Backend
- **API**: Hono + Cloudflare Workers
- **Database**: Cloudflare D1 + Drizzle ORM
- **Authentication**: Clerk
- **OAuth**: Spotify & YouTube integration

### Infrastructure
- **Monorepo**: Turborepo
- **Package Manager**: Bun
- **Hosting**: Cloudflare Pages + Workers
- **Mobile**: Expo + EAS Build

## 📁 Project Structure

```
zine/
├── apps/
│   ├── web/               # Web application (React + Vite)
│   └── mobile/            # Mobile application (React Native + Expo)
│       └── zine/
├── packages/
│   ├── api/               # API (Hono + Cloudflare Workers)
│   ├── design-system/     # Unified component library
│   │   ├── components/
│   │   │   ├── primitives/  # Platform-aware components
│   │   │   ├── patterns/    # Complex components
│   │   │   └── ui/          # shadcn/ui components
│   │   ├── tokens/        # Design tokens
│   │   └── lib/           # Utilities & platform detection
│   ├── shared/            # Shared types and business logic
│   └── ui/                # Legacy UI (being migrated)
├── package.json           # Root package.json
├── turbo.json            # Turborepo configuration
└── tsconfig.json         # TypeScript configuration
```

## 🎯 Key Features

- **Platform-Aware Components**: Single component API works on both web and mobile
- **Dark Mode Support**: Built-in theme system with persistence
- **Content Subscriptions**: Connect Spotify, YouTube, and podcast platforms
- **Smart Bookmarks**: AI-enhanced content extraction and categorization
- **Offline Support**: Local-first architecture with sync
- **Cross-Platform Sync**: Seamless data sync across devices

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Bun 1.0+
- iOS Simulator (for mobile development)
- Android Studio (optional, for Android development)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/zine.git
   cd zine
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Set up environment variables**:
   ```bash
   # Web app
   cp apps/web/.env.example apps/web/.env.local
   
   # API
   cp packages/api/.dev.vars.example packages/api/.dev.vars
   ```

4. **Sync database for worktrees** (if using git worktrees):
   ```bash
   bun run sync-db
   ```

### Development

#### Web Development
```bash
# Start all services (recommended)
bun dev

# Or start individually
bun dev --filter=@zine/web      # Web app only
bun dev --filter=@zine/api      # API only
bun dev --filter=@zine/design-system  # Storybook
```

#### Mobile Development
```bash
# Navigate to mobile app
cd apps/mobile/zine

# Start Expo dev server
bun run start

# Run on iOS simulator
bun run ios

# Run on Android emulator
bun run android
```

#### Design System Development
```bash
cd packages/design-system

# Start Storybook
bun run storybook

# Build package
bun run build

# Watch mode
bun run dev
```

## 🗄️ Database Setup

### Local Development

1. **Create D1 database**:
   ```bash
   cd packages/api
   wrangler d1 create zine-db
   ```

2. **Update wrangler.toml** with your database ID

3. **Run migrations**:
   ```bash
   bun run db:generate  # Generate migrations
   bun run db:migrate   # Apply migrations
   ```

### Production Database

Migrations are automatically applied during deployment via GitHub Actions.

## 🚢 Deployment

### Web & API Deployment

Deploy through GitHub Actions (recommended):
1. Push to `main` branch
2. GitHub Actions automatically deploys to production

Manual deployment:
```bash
# Deploy everything
bun deploy

# Deploy individually
cd packages/api && bun deploy    # API
cd apps/web && bun deploy         # Web app
```

### Mobile App Deployment

Using EAS Build:
```bash
cd apps/mobile/zine

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to stores
eas submit
```

## 📦 Package Structure

### @zine/design-system
Unified component library supporting both web and mobile:
- Platform-aware components
- Design tokens
- Theme system
- Utilities

### @zine/shared
Business logic and types:
- Repository pattern
- Service layer
- Zod schemas
- API types

### @zine/api
Backend services:
- Hono framework
- Cloudflare Workers
- D1 database
- OAuth integration

## 🧪 Testing

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Type checking
bun run type-check

# Linting
bun run lint
```

## 📚 Documentation

- [Design System Documentation](./packages/design-system/README.md)
- [Component Documentation](./packages/design-system/docs/components.md)
- [Migration Guide](./packages/design-system/MIGRATION.md)
- [API Documentation](./packages/api/README.md)
- [Mobile App Documentation](./apps/mobile/zine/README.md)

## 🔧 Development Commands

### Root Commands
- `bun dev` - Start all development servers
- `bun build` - Build all packages
- `bun test` - Run all tests
- `bun lint` - Lint all packages
- `bun type-check` - TypeScript checks
- `bun clean` - Clean build artifacts
- `bun deploy` - Deploy to production
- `bun sync-db` - Sync database for worktrees

### Package-specific Commands

#### Design System
- `bun run storybook` - Start Storybook
- `bun run build` - Build package
- `bun run dev` - Watch mode

#### Mobile App
- `bun run start` - Start Expo dev server
- `bun run ios` - Run on iOS
- `bun run android` - Run on Android
- `bun run build:ios` - Build iOS app
- `bun run build:android` - Build Android app

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure tests pass
5. Submit a pull request

### Development Workflow

1. **Use the unified design system** for all UI components
2. **Follow platform conventions** when adding platform-specific code
3. **Test on both platforms** before submitting PRs
4. **Update documentation** for new features
5. **Use semantic commit messages**

## 📄 License

MIT

## 🆘 Support

- [GitHub Issues](https://github.com/yourusername/zine/issues)
- [Discord Community](https://discord.gg/zine)
- [Documentation](https://docs.zine.app)