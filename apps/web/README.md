# Zine Web App - Development Tool Only

⚠️ **IMPORTANT: This web app is NOT actively maintained**

## Status

This web application serves as a **development and testing tool only**. It is not the primary platform for Zine.

### Current State
- **Purpose**: Internal development, API testing, and debugging
- **Maintenance**: Not actively maintained
- **Build Status**: May have errors due to removed web design system support
- **Production Use**: Not recommended

### Why Tool-Only?

As of September 2025, Zine has pivoted to be **mobile-first**:

1. **Primary Platform**: React Native mobile app
2. **Design System**: Simplified to mobile-only (heroui-native)
3. **Web Support**: Removed from design system to reduce complexity
4. **Focus**: 100% on delivering excellent mobile experience

### Known Issues

- ❌ Build may fail (imports `@zine/design-system/web` which no longer exists)
- ❌ Type check errors due to removed web components
- ⚠️ Not receiving new features
- ⚠️ No active bug fixes

### What This Means

- **For Users**: Use the mobile app for production
- **For Developers**: Use this app for:
  - API endpoint testing
  - Quick database queries
  - Debugging backend issues
  - Internal tooling

## If You Need the Web App

If you absolutely need the web app to work:

1. **Revert to commit before Phase 2**: `git checkout pre-refactor-backup`
2. **Use older design system**: The web design system exists in git history
3. **Accept maintenance burden**: You'll need to maintain web components yourself

## Recommended: Use Mobile App

The mobile app is where all development happens:

```bash
# Navigate to mobile app
cd ../mobile

# Start mobile development
bun run dev
bun run ios    # iOS simulator
bun run android # Android emulator
```

See main project README for mobile app setup.

## Architecture (Historical)

This was built with:
- React 19
- Vite
- TanStack Router
- TanStack Query
- Tailwind CSS
- Radix UI (removed)
- Clerk Authentication

## API Connection

The web app connects to the same API as the mobile app:
- **Local**: `http://localhost:8787`
- **Production**: `https://api.myzine.app`

## For Testing Purposes

If you want to run this for API testing:

```bash
# Install dependencies
bun install

# Start dev server (may have errors)
bun run dev

# The app will start on http://localhost:5173
```

Expected errors related to missing web design system components.

---

**Last Updated**: September 30, 2025  
**Status**: Development Tool Only  
**Primary Platform**: Mobile App (React Native)  
**Recommendation**: Use mobile app for all production needs