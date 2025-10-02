# Manual Testing Results - YouTube Connect Feature

## Test Date: October 1, 2025
## Phase: Phase 0 - Mobile OAuth Fix

---

## Pre-Test Verification ✅

### Code Changes Verified
- ✅ `apps/mobile/lib/api.ts` line 336: Changed to `/api/v1/accounts`
- ✅ `apps/mobile/lib/api.ts` line 71: Fixed HeadersInit type to `Record<string, string>`
- ✅ `apps/mobile/lib/api.ts` line 338-343: Response mapping implemented correctly

### Environment Setup
- ✅ API server running on `http://localhost:8787`
- ✅ API environment variables configured (.dev.vars)
  - YOUTUBE_CLIENT_ID: Set
  - YOUTUBE_CLIENT_SECRET: Set
  - CLERK_SECRET_KEY: Set
  - API_BASE_URL: Set
- ✅ Mobile app environment configured
  - EXPO_PUBLIC_API_URL: `http://100.90.89.84:8787` (Tailscale)
- ✅ Mobile app built successfully (0 errors, 1 warning)
- ✅ Mobile app installed on iPhone 16 Pro Max simulator

### API Endpoint Verification
- ✅ `/api/v1/accounts` endpoint exists and requires auth (returns 401 when unauthenticated)
- ✅ `/api/v1/auth/health` endpoint exists and requires auth
- ✅ `/api/v1/auth/youtube/connect` endpoint exists and requires auth
- ✅ `/api/v1/auth/spotify/connect` endpoint exists and requires auth

---

## Manual Testing Checklist

**Note**: The following tests require physical interaction with the iOS simulator. The app has been built and installed successfully.

### Test 1: Connection Status Display
**Status**: ⏳ PENDING MANUAL TEST

**Steps**:
1. [ ] Launch Zine app on simulator
2. [ ] Sign in with Clerk (if not already signed in)
3. [ ] Navigate to Settings tab
4. [ ] Locate YouTube account section
5. [ ] Verify connection status displays correctly

**Expected Results**:
- [ ] Status loads (not blank/loading forever)
- [ ] Shows correct state (Connected/Not Connected)
- [ ] No console errors about "accounts" being undefined
- [ ] No crash or error messages

**Actual Results**:
_To be filled during manual testing_

---

### Test 2: Connect YouTube Account
**Status**: ⏳ PENDING MANUAL TEST

**Steps**:
1. [ ] Ensure YouTube is not connected
2. [ ] Tap "Connect YouTube" button
3. [ ] Observe browser opening behavior
4. [ ] Complete Google OAuth flow
5. [ ] Grant YouTube permissions
6. [ ] Observe return to app
7. [ ] Verify status update

**Expected Results**:
- [ ] OAuth browser opens successfully
- [ ] Google consent screen loads
- [ ] Can complete OAuth flow
- [ ] Browser returns to app after OAuth
- [ ] Status updates to "Connected"
- [ ] Shows connection timestamp
- [ ] Shows "Disconnect" option

**Actual Results**:
_To be filled during manual testing_

---

### Test 3: Disconnect YouTube Account
**Status**: ⏳ PENDING MANUAL TEST

**Prerequisites**: YouTube must be connected (complete Test 2 first)

**Steps**:
1. [ ] While connected, tap "Disconnect" button
2. [ ] Confirm disconnection (if prompted)
3. [ ] Observe status update
4. [ ] Verify "Connect" button reappears

**Expected Results**:
- [ ] Disconnect removes connection
- [ ] Status updates immediately to "Not Connected"
- [ ] "Connect YouTube" button appears again
- [ ] Can reconnect after disconnecting

**Actual Results**:
_To be filled during manual testing_

---

### Test 4: Save YouTube Video (Connected)
**Status**: ⏳ PENDING MANUAL TEST

**Prerequisites**: YouTube must be connected

**Test URL**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`

**Steps**:
1. [ ] Ensure YouTube is connected
2. [ ] Navigate to Save Bookmark screen
3. [ ] Paste test URL
4. [ ] Save the bookmark
5. [ ] View the saved bookmark
6. [ ] Check metadata richness

**Expected Results**:
- [ ] Bookmark saves successfully
- [ ] Shows video title: "Rick Astley - Never Gonna Give You Up"
- [ ] Shows channel name: "Rick Astley"
- [ ] Shows thumbnail image
- [ ] Shows view count (if visible in UI)
- [ ] Shows duration (if visible in UI)
- [ ] No errors in console

**Actual Results**:
_To be filled during manual testing_

---

### Test 5: Save YouTube Video (Not Connected)
**Status**: ⏳ PENDING MANUAL TEST

**Prerequisites**: YouTube must NOT be connected

**Test URL**: `https://www.youtube.com/watch?v=jNQXAC9IVRw`

**Steps**:
1. [ ] Ensure YouTube is NOT connected (disconnect if needed)
2. [ ] Navigate to Save Bookmark screen
3. [ ] Paste test URL
4. [ ] Save the bookmark
5. [ ] View the saved bookmark
6. [ ] Compare with connected version

**Expected Results**:
- [ ] Bookmark saves successfully (doesn't fail)
- [ ] Shows basic metadata (title, thumbnail from oEmbed)
- [ ] May have less detailed info than connected version
- [ ] Still creates bookmark (fallback works)
- [ ] No errors that prevent save

**Actual Results**:
_To be filled during manual testing_

---

## Known Issues / Observations

_To be filled during manual testing_

---

## Test Summary

**Total Tests**: 5
**Passed**: 0 (pending manual testing)
**Failed**: 0
**Blocked**: 0
**Pending**: 5

---

## Next Steps

After completing manual tests:

1. [ ] Fill in "Actual Results" sections above
2. [ ] Document any issues found in "Known Issues" section
3. [ ] If all tests pass:
   - [ ] Update `YOUTUBE_CONNECT_PLAN.md` Phase 0 status to "FULLY COMPLETED"
   - [ ] Mark Phase 0 manual test checkboxes as complete
   - [ ] Commit changes with message documenting test completion
4. [ ] If tests fail:
   - [ ] Document failures
   - [ ] Create GitHub issues for bugs
   - [ ] Fix issues and re-test

---

## Testing Notes

**How to Run Manual Tests**:

1. **Start API Server**:
   ```bash
   cd packages/api
   bun run dev
   # Should show: Ready on http://0.0.0.0:8787
   ```

2. **Start Mobile App**:
   ```bash
   cd apps/mobile
   bun run ios
   # App will open in simulator
   ```

3. **Access Simulator**:
   - App should already be installed and open
   - If not open, tap the Zine app icon
   - Sign in if needed

4. **Follow Test Steps**:
   - Execute each test in order
   - Check off boxes as you complete steps
   - Document actual results
   - Note any deviations from expected results

---

**Tested By**: _To be filled_  
**Test Duration**: _To be filled_  
**Overall Result**: ⏳ PENDING

