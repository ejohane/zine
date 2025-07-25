# Clerk Authentication Implementation Plan

## Overview

This plan implements Clerk authentication with a fresh, simplified frontend approach while reusing the existing backend infrastructure. The entire app will be protected behind authentication with email-based login/signup functionality.

## Current State Analysis

### ✅ Already Implemented (Backend)
- Complete Clerk backend integration with JWT verification
- Protected API endpoints with user isolation
- User database schema with foreign key relationships
- Authentication middleware in `packages/api/src/middleware/auth.ts`
- Environment variable setup for `CLERK_SECRET_KEY`

### ❌ Needs Implementation (Frontend)
- Clerk React integration
- Authentication components (Login/Signup)
- Protected route logic
- Token management for API calls
- Auth state management

## Implementation Steps

### Phase 1: Dependencies & Environment Setup

#### 1.1 Install Clerk React Package
```bash
cd apps/web
bun add @clerk/clerk-react
```

#### 1.2 Environment Variables Setup
- Reuse existing Clerk application and keys
- Ensure `VITE_CLERK_PUBLISHABLE_KEY` is configured in:
  - `apps/web/.env.local` (development)
  - GitHub Actions secrets (production)

### Phase 2: Core Authentication Setup

#### 2.1 Clerk Provider Configuration
- **File**: `apps/web/src/main.tsx`
- Wrap the app with `<ClerkProvider>`
- Configure publishable key from environment variables
- Set up basic Clerk appearance customization

#### 2.2 Authentication Context Integration
- **File**: `apps/web/src/lib/auth.tsx`
- Create authentication utilities and hooks
- Replace mock auth context with real Clerk integration
- Export `useAuth`, `useUser` hooks for components

#### 2.3 Root Route Protection
- **File**: `apps/web/src/routes/__root.tsx`
- Remove mock authentication context
- Implement `<SignedIn>` and `<SignedOut>` components
- Redirect unauthenticated users to sign-in

### Phase 3: Authentication Pages

#### 3.1 Sign-In Page
- **File**: `apps/web/src/routes/sign-in.tsx`
- Simple email/password login form using `<SignIn />` component
- Inline error handling
- Redirect to dashboard after successful login
- Remember me functionality (Clerk handles this automatically)

#### 3.2 Sign-Up Page
- **File**: `apps/web/src/routes/sign-up.tsx`
- Email/password registration form using `<SignUp />` component
- Inline error handling
- Email verification flow
- Auto-redirect to dashboard after successful signup

#### 3.3 Authentication Layout
- **File**: `apps/web/src/components/auth/AuthLayout.tsx`
- Shared layout for sign-in/sign-up pages
- Clean, centered design with your app branding
- Loading states and error boundaries

### Phase 4: Navigation & User Interface

#### 4.1 Navigation Updates
- **File**: `apps/web/src/components/Header.tsx` (or main nav component)
- Add user profile dropdown
- Implement logout functionality using `<SignOutButton>`
- Display user email/name from Clerk

#### 4.2 User Profile Management
- **File**: `apps/web/src/routes/profile.tsx`
- Basic profile page using `<UserProfile />` component
- Leverage Clerk's user management dashboard
- No custom profile editing needed

### Phase 5: API Integration & Token Management

#### 5.1 API Client Updates
- **File**: `apps/web/src/lib/api.ts`
- Replace `null` token with real JWT from Clerk
- Use `getToken()` from `useAuth()` hook
- Implement automatic token refresh

#### 5.2 TanStack Query Integration
- **File**: `apps/web/src/hooks/useBookmarks.ts`
- Update data fetching hooks to include authentication
- Handle 401 errors with automatic sign-out
- Implement proper loading states

### Phase 6: Route Protection & UX

#### 6.1 Protected Route Implementation
- **File**: `apps/web/src/components/auth/ProtectedRoute.tsx`
- Wrapper component for authenticated routes
- Loading spinner while checking auth status
- Automatic redirect to sign-in for unauthenticated users

#### 6.2 Route Configuration Updates
- Update TanStack Router route definitions
- Wrap all app routes with protection
- Configure proper redirects after authentication

#### 6.3 Loading & Error States
- **File**: `apps/web/src/components/auth/AuthLoadingSpinner.tsx`
- Consistent loading UI during auth checks
- Error boundaries for authentication failures
- Graceful fallbacks for network issues

## Technical Implementation Details

### Authentication Flow
1. User visits app → Clerk checks authentication status
2. If unauthenticated → Redirect to `/sign-in`
3. User signs in → JWT token generated
4. Token passed to API calls → Backend validates with Clerk
5. API returns user-specific data

### Token Management
```typescript
// In API calls
const { getToken } = useAuth();
const token = await getToken();

// Pass token to backend
fetch('/api/v1/bookmarks', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Error Handling Strategy
- **Network Errors**: Retry with exponential backoff
- **401 Unauthorized**: Automatic sign-out and redirect
- **Clerk Errors**: Display inline with specific error messages
- **Loading States**: Skeleton UI during authentication checks

## File Structure After Implementation

```
apps/web/src/
├── components/
│   ├── auth/
│   │   ├── AuthLayout.tsx           # Shared auth page layout
│   │   ├── ProtectedRoute.tsx       # Route protection wrapper
│   │   └── AuthLoadingSpinner.tsx   # Loading states
│   └── ui/                          # Existing UI components
├── routes/
│   ├── sign-in.tsx                  # Login page
│   ├── sign-up.tsx                  # Registration page
│   ├── profile.tsx                  # User profile page
│   └── __root.tsx                   # Updated with auth protection
├── lib/
│   ├── auth.tsx                     # Auth utilities and hooks
│   └── api.ts                       # Updated with token management
└── hooks/
    └── useBookmarks.ts              # Updated with auth integration
```

## Environment Variables Required

### Development (.env.local)
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_existing_key
```

### Production (GitHub Actions)
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_your_existing_key
```

## Testing Strategy

### 1. Authentication Flow Testing
- [ ] Sign-up with email/password
- [ ] Sign-in with existing account
- [ ] Sign-out functionality
- [ ] Protected route access
- [ ] Token refresh handling

### 2. Integration Testing
- [ ] API calls with authentication
- [ ] User data isolation
- [ ] Error handling for expired tokens
- [ ] Network error recovery

### 3. UX Testing
- [ ] Loading states during auth checks
- [ ] Error message display
- [ ] Redirect flows
- [ ] Remember me functionality

## Success Criteria

- [ ] Users can sign up with email/password
- [ ] Users can sign in and are remembered across sessions
- [ ] Entire app is protected behind authentication
- [ ] API calls include proper JWT tokens
- [ ] Backend authentication middleware works seamlessly
- [ ] Users can sign out and are properly redirected
- [ ] Inline error messages display for auth failures
- [ ] Existing backend infrastructure remains unchanged
- [ ] All environment variables are preserved

## Deployment Considerations

- Ensure GitHub Actions includes Clerk environment variables
- Verify production Clerk application is configured correctly
- Test authentication flow in production environment
- Monitor for authentication-related errors in production

## Timeline Estimate

- **Phase 1-2**: 2-3 hours (Setup & Core Auth)
- **Phase 3**: 2-3 hours (Auth Pages)
- **Phase 4**: 1-2 hours (Navigation & UI)
- **Phase 5**: 2-3 hours (API Integration)
- **Phase 6**: 1-2 hours (Route Protection)
- **Testing**: 2-3 hours

**Total Estimated Time**: 10-16 hours

## Notes

- This plan leverages your existing backend authentication infrastructure
- No changes needed to backend code or database schema
- Frontend approach is simplified but comprehensive
- All Clerk configuration reuses existing setup
- Remember me functionality is handled automatically by Clerk
- User management through Clerk dashboard as requested