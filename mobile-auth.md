# Mobile Authentication with Clerk - Implementation Plan

## Overview
This document outlines the implementation plan for adding Clerk authentication support to the Zine mobile app using Expo. The implementation will mirror the existing web authentication architecture while following Expo and React Native best practices.

## Current Architecture Analysis

### Web Implementation (Reference)
- **Frontend**: Uses `@clerk/clerk-react` with `ClerkProvider` wrapped around the app
- **API**: Uses `@clerk/backend` to verify JWT tokens in middleware
- **Auth Flow**: 
  - Token is obtained via `getToken()` from `useAuth` hook
  - Token is sent as Bearer token in Authorization header
  - API verifies token using Clerk's `verifyToken` function

### Mobile Requirements
- Must work with existing API authentication
- Support both development and production environments
- Handle token caching securely using `expo-secure-store`
- Work seamlessly in local development (`bun run dev`)

## Implementation Plan

### Phase 1: Setup & Dependencies ✅ COMPLETED

#### 1.1 Install Required Packages ✅
```bash
cd apps/mobile
bun add @clerk/clerk-expo expo-secure-store
```
- Installed @clerk/clerk-expo@2.14.30
- Installed expo-secure-store@14.2.3

#### 1.2 Environment Configuration ✅
Created environment files for mobile app:
- `apps/mobile/.env.local` (for local development) - Created with actual Clerk key from web app
- `apps/mobile/.env.example` (template) - Created as template for other developers

```env
# apps/mobile/.env.local
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Z3Jvd2luZy1maWxseS00NS5jbGVyay5hY2NvdW50cy5kZXYk
EXPO_PUBLIC_API_URL=http://localhost:8787
```

#### 1.3 Update app.json Configuration ✅
Configured app identifiers in app.json:
- iOS bundle identifier: "com.zine.app"
- Android package: "com.zine.app"

### Phase 2: Core Authentication Setup ✅ COMPLETED

#### 2.1 Create Authentication Context ✅
Location: `apps/mobile/contexts/auth.tsx` - CREATED

Successfully implemented:
- Authentication context provider with full auth state management
- Token management with secure storage integration
- `useAuth` hook that mirrors the web implementation
- Automatic token caching on sign-in
- Token refresh and fallback mechanisms

#### 2.2 Token Cache Implementation ✅
Location: `apps/mobile/lib/tokenCache.ts` - CREATED

Implemented secure token storage with:
- `expo-secure-store` for encrypted token storage on mobile
- Fallback to sessionStorage for web platform compatibility
- Token save, retrieve, and clear operations
- Clerk-specific token cache adapter for integration
- Platform detection to use appropriate storage method

#### 2.3 Root Layout with ClerkProvider ✅
Updated `apps/mobile/app/_layout.tsx`:
- Wrapped app with `ClerkProvider` using publishable key from environment
- Configured token cache with our custom implementation
- Added `ClerkLoaded` wrapper for handling auth loading states
- Integrated `AuthProvider` for app-wide auth context
- Added environment variable warning for missing keys

### Phase 3: Authentication Screens ✅ COMPLETED

#### 3.1 Route Structure ✅
Successfully implemented the following route structure:
```
app/
├── _layout.tsx                 # Root with ClerkProvider ✅
├── (auth)/
│   ├── _layout.tsx             # Auth layout (redirect if signed in) ✅
│   ├── sign-in.tsx             # Sign in screen ✅
│   └── sign-up.tsx             # Sign up screen ✅
├── (app)/
│   ├── _layout.tsx             # Protected layout (redirect if not signed in) ✅
│   └── (tabs)/
│       ├── _layout.tsx         # Tab navigator ✅
│       ├── index.tsx           # Home/Bookmarks ✅
│       ├── search.tsx          # Search ✅
│       └── settings.tsx        # Settings with sign out ✅
```

#### 3.2 Sign In/Up Screens ✅
Implemented custom flows using Clerk's hooks:
- Email/password authentication ✅
- Email verification with 6-digit code ✅
- Error handling and validation ✅
- Password confirmation on sign-up ✅
- Loading states during authentication ✅
- Links between sign-in and sign-up screens ✅

#### 3.3 Protected Routes ✅
Successfully implemented protected routes:
- Auth guards in layouts ✅
- Loading states during auth checks ✅
- Redirect logic based on auth status ✅
- Automatic redirect to main app when signed in ✅
- Automatic redirect to sign-in when not authenticated ✅

#### 3.4 Settings Integration ✅
Updated settings screen with authentication features:
- Display user email and name when signed in ✅
- Sign out button with confirmation dialog ✅
- Sign in button for guest users ✅
- Dynamic UI based on auth state ✅

### Phase 4: API Integration ✅ COMPLETED

#### 4.1 API Client Configuration ✅
Location: `apps/mobile/lib/api.ts` - CREATED

Successfully implemented:
- Authenticated fetch wrapper with automatic token injection
- Token refresh on 401 responses
- Typed API client methods (GET, POST, PUT, DELETE, PATCH)
- Specific API endpoints for bookmarks, feeds, search, and user profile
- Environment-based API URL configuration

#### 4.2 Update Existing API Hooks ✅
Created and updated hooks with authentication:
- `hooks/useBookmarks.ts` - Created with full CRUD operations
- Integrated authentication token from auth context
- API Provider context to initialize client with auth
- Test API page for validating authentication flow

### Phase 5: Development Environment

#### 5.1 Local Development Setup
Ensure `bun run dev` from root works:
- Mobile app connects to local API (http://localhost:8787)
- Environment variables properly loaded
- Hot reload maintains auth state

#### 5.2 Turbo Configuration
Update `turbo.json` to include mobile environment variables:
```json
{
  "pipeline": {
    "dev": {
      "env": [
        "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "EXPO_PUBLIC_API_URL"
      ]
    }
  }
}
```

### Phase 6: Testing & Polish

#### 6.1 Authentication Flows
Test all auth scenarios:
- Sign up with email
- Sign in with email
- Password reset
- Email verification
- Sign out

#### 6.2 Error Handling
- Network errors
- Invalid credentials
- Token expiration
- API errors

#### 6.3 Performance
- Token caching
- Minimize re-renders
- Optimize loading states

## File Structure

```
apps/mobile/
├── app/
│   ├── _layout.tsx              # Root layout with ClerkProvider
│   ├── (auth)/
│   │   ├── _layout.tsx          # Auth group layout
│   │   ├── sign-in.tsx          # Sign in screen
│   │   └── sign-up.tsx          # Sign up screen
│   ├── (app)/
│   │   ├── _layout.tsx          # Protected group layout
│   │   └── (tabs)/
│   │       ├── _layout.tsx      # Tab navigator
│   │       ├── index.tsx        # Home
│   │       ├── search.tsx       # Search
│   │       └── settings.tsx     # Settings
├── components/
│   ├── auth/
│   │   ├── SignInForm.tsx      # Sign in form component
│   │   └── SignUpForm.tsx      # Sign up form component
├── contexts/
│   ├── auth.tsx                # Auth context provider
├── hooks/
│   ├── useAuth.ts              # Auth hook
│   ├── useBookmarks.ts         # Updated with auth
│   └── useSearch.ts            # Updated with auth
├── lib/
│   ├── api.ts                  # API client with auth
│   ├── tokenCache.ts           # Secure token storage
│   └── clerk.ts                # Clerk configuration
└── .env.local                  # Environment variables
```

## Security Considerations

1. **Token Storage**: Use `expo-secure-store` for encrypted storage
2. **API Communication**: Always use HTTPS in production
3. **Token Refresh**: Implement automatic token refresh
4. **Sign Out**: Clear all stored tokens and session data

## Migration Notes

### For Existing Users
- No changes needed for web users
- Mobile users will need to sign in on first app launch
- Shared authentication between web and mobile

### API Compatibility
- No changes to existing API endpoints
- Mobile app uses same auth middleware as web
- Token format remains unchanged

## Development Workflow

1. **Local Development**:
   ```bash
   # From root directory
   bun run dev
   
   # Or mobile only
   cd apps/mobile
   bun run dev
   ```

2. **Environment Setup**:
   - Copy `.env.example` to `.env.local`
   - Add Clerk publishable key
   - Configure API URL

3. **Testing Auth Flows**:
   - Use Clerk's test mode for development
   - Test with real accounts in staging
   - Verify token passing to API

## Implementation Status

### Completed Phases:
- ✅ **Phase 1: Setup & Dependencies** - All packages installed and configured
- ✅ **Phase 2: Core Authentication Setup** - ClerkProvider, token cache, and auth context implemented
- ✅ **Phase 3: Authentication Screens** - Sign-in/sign-up screens and protected routes implemented
- ✅ **Phase 4: API Integration** - Authentication integrated with all API calls

### Next Phase:
- 🔄 **Phase 5: Development Environment** - Ready to optimize development setup

## Success Criteria

- [x] Users can sign up/in on mobile app with email/password
- [x] Authentication context and provider setup complete
- [x] Token cache implementation with secure storage
- [x] Authentication persists across app restarts (via token cache)
- [x] API calls include valid authentication tokens (Phase 4)
- [x] Sign out clears all session data
- [x] Protected routes redirect appropriately
- [x] Works in local development environment (base setup)
- [x] Loading states during auth checks
- [x] Error messages for auth failures
- [x] Seamless experience between web and mobile (Phase 4)

## Next Steps

After implementing authentication:
1. Add OAuth providers (Google, Apple) for easier sign-in
2. Add subscription management for mobile (Spotify/YouTube)
3. Implement push notifications with user targeting
4. Add biometric authentication support
5. Implement offline mode with auth caching