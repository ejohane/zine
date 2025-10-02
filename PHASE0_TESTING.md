# Phase 0: Mobile OAuth Fix - Testing Guide

## ✅ Implementation Complete

### Changes Made

1. **Fixed API Endpoint** (`apps/mobile/lib/api.ts`):
   - Changed from `/api/v1/auth/health` to `/api/v1/accounts`
   - Updated response mapping to handle nested provider object

2. **Fixed Type Error** (`apps/mobile/lib/api.ts` line 71):
   - Changed `HeadersInit` to `Record<string, string>` to fix TypeScript error

3. **Response Mapping**:
   ```typescript
   // Old (incorrect):
   const response = await apiClient.get<AccountsResponse>('/api/v1/auth/health');
   return response?.accounts || [];
   
   // New (correct):
   const response = await apiClient.get<{ accounts: any[] }>('/api/v1/accounts');
   return (response?.accounts || []).map(account => ({
     provider: account.provider.id as 'spotify' | 'youtube',
     isConnected: account.connected,
     connectedAt: account.connectedAt || undefined,
     externalAccountId: account.externalAccountId || undefined
   }));
   ```

## Manual Testing Instructions

### Prerequisites

1. **API Running**:
   ```bash
   cd packages/api
   bun run dev
   # Should show: Ready on http://0.0.0.0:8787
   ```

2. **Environment Variables** (`.dev.vars`):
   - `YOUTUBE_CLIENT_ID` - Set ✅
   - `YOUTUBE_CLIENT_SECRET` - Set ✅
   - `CLERK_SECRET_KEY` - Set ✅
   - `API_BASE_URL=http://localhost:8787` - Set ✅

3. **Mobile App**:
   ```bash
   cd apps/mobile
   bun run ios  # or bun run android
   ```

### Test Scenarios

#### Test 1: Connection Status Display
**Expected Behavior**: 
- Open Settings screen
- Should see YouTube account with correct connection status
- If not connected: Shows "Connect YouTube" button
- If connected: Shows "Connected" with connection date

**Steps**:
1. Launch mobile app
2. Navigate to Settings (bottom tab)
3. Look for YouTube section
4. Verify status displays correctly

**Success Criteria**:
- ✅ Status loads (not blank/loading forever)
- ✅ Shows correct state (Connected/Not Connected)
- ✅ No console errors about "accounts" being undefined

---

#### Test 2: Connect YouTube Account
**Expected Behavior**: 
- Click "Connect YouTube" → Browser opens with Google OAuth
- Grant permissions → Browser redirects back to app
- Status updates to "Connected"

**Steps**:
1. Tap "Connect YouTube" button
2. Browser should open with Google OAuth consent screen
3. Sign in with Google account
4. Grant YouTube read permissions
5. Browser should close and return to app
6. Settings screen should refresh
7. YouTube status should show "Connected ✓"

**Success Criteria**:
- ✅ OAuth browser opens successfully
- ✅ Can complete OAuth flow
- ✅ Browser returns to app after OAuth
- ✅ Status updates to "Connected"
- ✅ Shows connection timestamp
- ✅ Shows "Disconnect" option

---

#### Test 3: Disconnect YouTube Account
**Expected Behavior**:
- Tap "Disconnect" → Account disconnects
- Status changes to "Not Connected"

**Steps**:
1. While connected, tap "Disconnect" button
2. Confirm disconnection (if prompted)
3. Status should update to "Not Connected"
4. "Connect YouTube" button should appear again

**Success Criteria**:
- ✅ Disconnect removes connection
- ✅ Status updates immediately
- ✅ Can reconnect after disconnecting

---

#### Test 4: Save YouTube Video (Connected)
**Expected Behavior**:
- When connected, saving a YouTube URL enriches it with full metadata

**Steps**:
1. Ensure YouTube is connected
2. Copy a YouTube video URL (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
3. Go to Save Bookmark screen
4. Paste the URL
5. Save the bookmark
6. View the saved bookmark

**Success Criteria**:
- ✅ Bookmark saves successfully
- ✅ Shows video title from YouTube API
- ✅ Shows channel name
- ✅ Shows thumbnail
- ✅ Shows view count, duration (if API enrichment worked)

---

#### Test 5: Save YouTube Video (Not Connected)
**Expected Behavior**:
- Without connection, falls back to oEmbed/OpenGraph enrichment

**Steps**:
1. Ensure YouTube is NOT connected
2. Copy a YouTube video URL
3. Save as bookmark
4. View the saved bookmark

**Success Criteria**:
- ✅ Bookmark saves successfully (doesn't fail)
- ✅ Shows basic metadata (title, thumbnail from oEmbed)
- ✅ May have less detailed info than connected version

---

## API Endpoint Verification

### Endpoint Response Structure

**GET /api/v1/accounts** (requires auth):
```json
{
  "accounts": [
    {
      "provider": {
        "id": "youtube",
        "name": "YouTube"
      },
      "connected": true,
      "connectedAt": "2025-10-01T20:00:00Z",
      "externalAccountId": "UCxxxxx"
    },
    {
      "provider": {
        "id": "spotify",
        "name": "Spotify"
      },
      "connected": false,
      "connectedAt": null,
      "externalAccountId": null
    }
  ]
}
```

### Mobile App Mapping

The mobile app transforms this to:
```typescript
[
  {
    provider: "youtube",
    isConnected: true,
    connectedAt: "2025-10-01T20:00:00Z",
    externalAccountId: "UCxxxxx"
  },
  {
    provider: "spotify",
    isConnected: false,
    connectedAt: null,
    externalAccountId: null
  }
]
```

## Troubleshooting

### Issue: "Connect YouTube" button does nothing
**Solution**: 
- Check console logs for API errors
- Verify API is running on correct port
- Check `EXPO_PUBLIC_API_URL` in `.env.development`

### Issue: OAuth browser doesn't open
**Solution**:
- Check that deep linking is configured (`zine://` scheme)
- Verify `app.json` has `"scheme": "zine"`
- Check Expo config

### Issue: OAuth completes but status doesn't update
**Solution**:
- Check if `queryClient.invalidateQueries(['accounts'])` is called
- Verify API is returning correct response structure
- Check network tab for API request/response

### Issue: "Unauthorized" error when fetching accounts
**Solution**:
- Check Clerk authentication is working
- Verify user is signed in
- Check `CLERK_SECRET_KEY` in API `.dev.vars`

## Verification Checklist

Before marking Phase 0 as complete:

- [ ] API `/api/v1/accounts` endpoint returns correct structure
- [ ] Mobile app successfully calls `/api/v1/accounts` (not `/api/v1/auth/health`)
- [ ] Connection status displays correctly in Settings
- [ ] "Connect YouTube" button opens OAuth flow
- [ ] OAuth callback returns to app successfully
- [ ] Status updates to "Connected" after OAuth
- [ ] "Disconnect" button works
- [ ] Saving YouTube videos works (both connected and not connected)

## Next Steps

After Phase 0 is verified:
1. Update `YOUTUBE_CONNECT_PLAN.md` to mark Phase 0 as complete
2. Test YouTube video enrichment end-to-end
3. (Optional) Implement Phase 7: Unit tests
