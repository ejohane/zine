# Phase 7: Testing & Validation Guide

## Overview
This document provides step-by-step instructions for manually validating the data persistence implementation in the Zine mobile app.

## Automated Tests

Run the automated test suite:

```typescript
// In any component or hook, import and run:
import { runPersistenceTests } from '../lib/testPersistence';

// Call this function to run tests
runPersistenceTests();
```

Or add to a settings/debug screen for easy access during development.

## Manual Test Scenarios

### Test 1: Basic Persistence (App Restart)

**Objective**: Verify cached data displays immediately on app reopen

**Steps**:
1. Open the Zine mobile app
2. Navigate to the home screen and wait for bookmarks to load
3. Scroll through the recent bookmarks section
4. Close the app completely (force quit, not just background)
5. Reopen the app
6. Navigate to the home screen

**Expected Result**:
- ✅ Recent bookmarks display IMMEDIATELY (no skeleton)
- ✅ Data appears in < 100ms
- ✅ Small "Updating..." indicator appears briefly in top-right
- ✅ Fresh data loads in background without disrupting UI

**Actual Result**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 2: Stale-While-Revalidate Behavior

**Objective**: Verify stale data shows immediately while fresh data loads

**Steps**:
1. Open the app and load some bookmarks
2. Note the current time
3. Close the app
4. Wait 6 minutes (past the 5-minute staleTime)
5. Reopen the app
6. Observe the home screen

**Expected Result**:
- ✅ Old (stale) data displays immediately
- ✅ Background refetch starts automatically
- ✅ "Updating..." indicator shows during refetch
- ✅ UI updates with fresh data when complete
- ✅ No skeleton states during the process

**Actual Result**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 3: Offline Support

**Objective**: Verify cached data available offline

**Steps**:
1. Open app and load bookmarks (ensure data is cached)
2. Close app
3. Enable Airplane Mode on device
4. Reopen app
5. Try to view cached bookmarks

**Expected Result**:
- ✅ Cached bookmarks display correctly
- ✅ No error messages about network
- ✅ User can browse previously loaded content
- ✅ Appropriate message if trying to load new content

**Actual Result**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 4: Cache Invalidation on Version Change

**Objective**: Verify cache clears on app version bump

**Steps**:
1. Open app and load some data
2. Check current app version in `app.json`
3. Update version number in `app.json` (e.g., 1.0.0 → 1.0.1)
4. Rebuild and reinstall the app
5. Open the app

**Expected Result**:
- ✅ Cache cleared (skeleton shows on first load)
- ✅ Fresh data fetched from API
- ✅ New cache created with new version
- ✅ No corrupt cache errors

**Actual Result**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 5: Storage Quota Handling

**Objective**: Verify graceful handling when storage fills up

**Steps**:
1. Load large amounts of data (browse many bookmarks, creators)
2. Monitor cache size using the test suite
3. Continue loading data until approaching storage limits
4. Observe app behavior

**Expected Result**:
- ✅ App continues functioning normally
- ✅ Oldest queries automatically removed
- ✅ No crashes or errors
- ✅ Cache size stays under 10MB

**Actual Result**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 6: Performance Testing

**Objective**: Measure cache restoration speed and storage usage

**Steps**:
1. Load typical amount of data (10-20 bookmarks)
2. Close app
3. Run automated test suite (see above)
4. Check console logs for timing metrics

**Expected Metrics**:
- ✅ Cache restoration: < 100ms
- ✅ Storage usage: < 10MB for typical user
- ✅ No memory leaks (monitor over time)

**Actual Result**:
- Cache restoration time: _______ ms
- Storage usage: _______ MB
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 7: Navigation Performance

**Objective**: Verify instant navigation to cached pages

**Steps**:
1. Open app and view a specific bookmark detail page
2. Navigate back to home
3. Navigate to another bookmark detail page
4. Navigate back to home
5. Navigate back to the first bookmark detail page

**Expected Result**:
- ✅ First bookmark shows instantly from cache
- ✅ Navigation feels instant (< 50ms perceived)
- ✅ Background refresh happens without disruption
- ✅ No skeleton states on cached pages

**Actual Result**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 8: Error Recovery

**Objective**: Verify graceful recovery from cache corruption

**Steps**:
1. Use the test suite to manually corrupt the cache:
   ```typescript
   import AsyncStorage from '@react-native-async-storage/async-storage';
   await AsyncStorage.setItem('ZINE_QUERY_CACHE', 'invalid-json{{{');
   ```
2. Restart the app
3. Observe behavior

**Expected Result**:
- ✅ App detects corrupt cache
- ✅ Cache automatically cleared
- ✅ Fresh data fetched from API
- ✅ No app crash
- ✅ Error logged to console

**Actual Result**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 9: Sensitive Data Exclusion

**Objective**: Verify auth tokens not persisted

**Steps**:
1. Login to the app
2. Close and reopen app
3. Inspect cached data using test suite
4. Check for any auth-related query keys

**Expected Result**:
- ✅ Only successful bookmark/account queries cached
- ❌ No 'auth' or 'token' in query keys
- ❌ No sensitive data in AsyncStorage

**Actual Result**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

### Test 10: Cross-Platform Consistency

**Objective**: Verify persistence works on both iOS and Android

**Steps**:
1. Repeat Tests 1-3 on iOS device/simulator
2. Repeat Tests 1-3 on Android device/emulator
3. Compare behavior

**Expected Result**:
- ✅ Identical behavior on iOS and Android
- ✅ Cache restoration speed similar on both
- ✅ No platform-specific issues

**Actual Result (iOS)**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

**Actual Result (Android)**:
- [ ] Pass
- [ ] Fail
- Notes: ___________________________________________

---

## Acceptance Criteria Checklist

### Functional Requirements
- [ ] **F1**: Cached data displays immediately on app reopen (< 100ms)
- [ ] **F2**: Stale data refetches in background without UI disruption
- [ ] **F3**: Cache persists for 24 hours across app restarts
- [ ] **F4**: Cache invalidates automatically on app updates
- [ ] **F5**: Sensitive data (auth tokens, etc.) never persisted
- [ ] **F6**: Manual cache clear option available to users
- [ ] **F7**: Offline mode shows cached data

### Non-Functional Requirements
- [ ] **NF1**: Cache restoration completes in < 100ms
- [ ] **NF2**: Storage usage < 10MB for typical user
- [ ] **NF3**: No memory leaks from persistence layer
- [ ] **NF4**: Graceful degradation on persistence failures
- [ ] **NF5**: Works on iOS and Android

### User Experience Goals
- [ ] **UX1**: No skeleton states when reopening app
- [ ] **UX2**: Instant navigation between previously visited pages
- [ ] **UX3**: Subtle background refresh indicators (no full-screen spinners)
- [ ] **UX4**: App feels "instant" even with poor network
- [ ] **UX5**: Users can recover from corrupt cache states

---

## Success Metrics

### Before Implementation Baseline
- App reopen time to interactive: ~2-3 seconds (with skeleton)
- Background tab return time: ~1-2 seconds (with skeleton)
- User-perceived performance: "Feels slow on reopen"

### Target Metrics (After Implementation)
- App reopen time to interactive: < 100ms (instant with cached data)
- Background tab return time: < 50ms (instant)
- User-perceived performance: "Feels instant"
- Storage usage: < 10MB for typical user
- Cache hit rate: > 80% on app reopen

### Actual Metrics (To Be Filled)
- App reopen time to interactive: _______ ms
- Background tab return time: _______ ms
- User-perceived performance: _________________
- Storage usage: _______ MB
- Cache hit rate: _______ %

---

## Testing Checklist

### Automated Tests
- [x] Cache storage functionality test
- [x] Cache restoration speed test
- [x] Cache size monitoring test
- [x] Query persistence test
- [x] Cache invalidation test

### Manual Tests
- [ ] Basic persistence (app restart)
- [ ] Stale-while-revalidate behavior
- [ ] Offline support
- [ ] Cache invalidation on version bump
- [ ] Storage quota handling
- [ ] Performance metrics
- [ ] Navigation performance
- [ ] Error recovery
- [ ] Sensitive data exclusion
- [ ] iOS testing
- [ ] Android testing

---

## Known Issues / Notes

(Document any issues found during testing here)

---

## Sign-Off

**Tested By**: _________________  
**Date**: _________________  
**Platform**: [ ] iOS  [ ] Android  [ ] Both  
**Overall Result**: [ ] Pass  [ ] Fail  [ ] Partial Pass  

**Notes**:
________________________________________________________________
________________________________________________________________
________________________________________________________________
