# Authentication Feature with Clerk

## Overview
Add comprehensive authentication to the Zine application using Clerk as the authentication provider. This will secure the application and provide user management capabilities.

## Authentication Provider
- **Service**: Clerk
- **Reason**: Modern auth service with React SDK, supports social providers, and integrates well with Cloudflare Workers

## User Flow

### Initial Access
1. User visits the application
2. If not authenticated, redirect to sign-in/sign-up page
3. User chooses to sign up or sign in

### Sign Up Flow
1. Present sign-up options:
   - Sign up with Google
   - Sign up with Apple
   - Sign up with Email/password
2. User completes authentication with chosen provider
3. Clerk handles the OAuth flow
4. On success, redirect to homepage (empty bookmark list for new users)

### Sign In Flow
1. Present sign-in options (same providers as sign-up)
2. User authenticates
3. Redirect to homepage

### Protected Navigation
- All routes except auth pages require authentication
- Unauthenticated users automatically redirected to sign-in
- Maintain original destination for post-auth redirect

## Technical Implementation Plan

### Frontend (apps/web)
1. **Clerk Integration**
   - Install `@clerk/clerk-react`
   - Configure Clerk provider at app root
   - Set up environment variables

2. **Auth Components**
   - Sign-in page component
   - Sign-up page component
   - User profile/menu component
   - Sign-out functionality

3. **Route Protection (TanStack Router)**
   - Implement `beforeLoad` hook for protected routes
   - Use Clerk's `useAuth` hook for auth state
   - Redirect to sign-in with return URL preservation
   - Create reusable auth context for route tree

4. **Router Updates**
   - Add auth routes (`/sign-in`, `/sign-up`) 
   - Configure authenticated route tree structure
   - Handle post-auth redirects to original destination

### Backend (packages/api)
1. **Clerk Webhook Handling**
   - User creation webhook
   - User deletion webhook
   - User update webhook

2. **JWT Verification**
   - Middleware to verify Clerk JWTs
   - Extract user ID from tokens
   - Protect API endpoints

3. **User Management**
   - Create user records in D1
   - Associate bookmarks with users
   - Handle user deletion cleanup

### Database Updates
1. **User Schema**
   - Add users table with Clerk user ID
   - Add user_id foreign key to bookmarks table
   - Migration to add user relationships (start fresh - no existing data migration)

2. **Shared Package Updates**
   - Add user context to BookmarkService constructor
   - Update repository interface to include user filtering
   - Maintain clean separation: service handles user context, repository handles data access

3. **Data Relationships**
   - All bookmark operations automatically scoped to authenticated user
   - Database-level constraints ensure data isolation

## Security Considerations
- All API endpoints protected with JWT verification
- User data isolation at database level
- Secure environment variable management
- CORS configuration for Clerk domains

## Environment Configuration

### Local Development
- `VITE_CLERK_PUBLISHABLE_KEY_LOCAL`
- `CLERK_SECRET_KEY_LOCAL` 
- `CLERK_WEBHOOK_SECRET_LOCAL`

### Development Environment  
- `VITE_CLERK_PUBLISHABLE_KEY_DEV`
- `CLERK_SECRET_KEY_DEV`
- `CLERK_WEBHOOK_SECRET_DEV`

### Production Environment
- `VITE_CLERK_PUBLISHABLE_KEY_PROD`
- `CLERK_SECRET_KEY_PROD`  
- `CLERK_WEBHOOK_SECRET_PROD`

Each environment will have separate Clerk applications for proper isolation.

## Routes Structure
```
/sign-in          # Sign in page
/sign-up          # Sign up page
/                 # Protected: Homepage with bookmarks
/bookmark/:id     # Protected: Bookmark details
/*                # Protected: All other routes
```

## User Experience
- Seamless OAuth with Google/Apple + email/password support
- Silent token refresh - users stay logged in across sessions
- Multi-device login support (no session conflicts)
- Clean sign-out experience (single device only)
- Responsive auth UI matching app design
- Each user starts with empty bookmark list

## Implementation Phases
1. **Phase 1**: Basic Clerk setup and frontend auth
2. **Phase 2**: Backend JWT verification and user management
3. **Phase 3**: Database updates and user data isolation
4. **Phase 4**: Webhook handling and advanced features

## Technical Architecture Decisions

### BookmarkService User Context
```typescript
// Constructor injection pattern for maintainability
class BookmarkService {
  constructor(private repository: BookmarkRepository, private userId: string) {}
}

// Usage in API endpoints
const service = new BookmarkService(repository, userIdFromJWT);
```

### TanStack Router Auth Pattern
```typescript
// Route-level auth using beforeLoad
const protectedRoute = createRoute({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect('/sign-in?redirect=' + encodeURIComponent(location.href));
    }
  }
});
```

## Success Criteria
- Users can sign up with Google/Apple/email
- Users can sign in with existing accounts  
- All routes are properly protected via TanStack Router
- User sessions persist across browser sessions and devices
- Bookmarks are completely isolated by user (fresh start)
- Auth state is reflected in UI (user menu, sign out)
- Three environments (local/dev/prod) properly configured