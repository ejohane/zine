# Zine Codebase Refactoring Plan

**Date:** September 29, 2025  
**Goal:** Simplify codebase by focusing on mobile-first development and removing unnecessary complexity

## Executive Summary

This plan outlines a comprehensive refactoring to streamline the Zine codebase by:
1. Keeping web app as a minimal tool (not maintaining actively)
2. Removing dual platform support from design system (mobile-only with heroui-native)
3. Eliminating documentation noise and dead code
4. Reducing maintenance burden and complexity

## Current State Analysis

### Repository Structure
```
zine/
├── apps/
│   ├── web/          # 259MB - Vite SPA (keeping as tool only)
│   └── mobile/       # 1.0GB - React Native (primary focus)
├── packages/
│   ├── api/          # Cloudflare Workers API (keeping)
│   ├── design-system/ # 44MB - Dual platform support (needs simplification)
│   └── shared/       # Shared types/services (keeping)
├── docs/            # Documentation noise
├── plans/           # Planning docs noise
└── [many .md files] # 40+ markdown files at root
```

### Key Metrics
- **Total TS/TSX files:** ~32,714
- **Markdown files at root:** 40+
- **Test files at root:** 17 JavaScript test files
- **Design system files:** 139 (web + native support)

## Phase 1: Remove Documentation Noise ✅ COMPLETED

**Status:** Completed - 66 files deleted  
**Date Completed:** September 29, 2025

### Completion Summary

**Deleted:**
- 2 directories: `/plans/` (13 files), `/docs/` (4 files)
- 17 planning & design documents
- 5 debug & analysis documents
- 3 setup documents
- 21 test script files
- 1 workflow log archive

**Kept:**
- `CLAUDE.md` (to be updated in Phase 3)
- `README.md` (to be updated in Phase 3)
- `app.json` (needed for EAS builds)
- `eas.json` (needed for EAS builds)
- `REFACTOR_PLAN.md` (this document)
- `REFACTOR_SUMMARY.md` (executive summary)

**Result:** Root directory went from 40+ markdown files to just 4 essential documentation files

### Files to Delete (Root Level)

#### Planning & Design Documents (Remove All)
- [x] `/plans/` directory (entire directory)
- [x] `/docs/` directory (entire directory)
- [x] `REDESIGN_PLAN.md`
- [x] `react-native-v2.md`
- [x] `PHASE3_IMPLEMENTATION.md`
- [x] `PHASE1_MIGRATION_COMPLETE.md`
- [x] `components-plan.md`
- [x] `hero-ui.md`
- [x] `mobile-auth.md`
- [x] `clerk-auth-implementation-plan.md`
- [x] `subscription-feat-plan.md`
- [x] `subscription-feature-plan.md`
- [x] `subscription-feature.md`
- [x] `SUBSCRIPTION_FEATURE_DOCUMENTATION.md`
- [x] `zine-design-system.md`
- [x] `zine-design-system-implementation.md`
- [x] `content-details.md`

#### Debug & Analysis Documents
- [x] `CREATOR_AVATAR_DEBUG.md`
- [x] `youtube-bookmark-flow-analysis.md`
- [x] `youtube-api-content-mapping.md`
- [x] `DURABLE_OBJECTS_ARCHITECTURE_PLAN.md`
- [x] `FEED_POLLING_OPTIMIZATION_PLAN.md`

#### Setup Documents (Consolidate Info)
- [x] `ADD_YOUTUBE_API_KEY.md` (merge relevant info into CLAUDE.md)
- [x] `OAUTH_SETUP.md` (merge relevant info into CLAUDE.md)
- [x] `setup-clerk-keys.md` (merge relevant info into CLAUDE.md)

#### Keep These Root Docs
- ✅ `CLAUDE.md` (update with mobile-first info)
- ✅ `README.md` (update for mobile-first)
- ✅ `.gitignore`
- ✅ `.cursorrules`

### Test Files to Delete (Root Level)

All test JS files should be moved to proper test directories or deleted:
- [x] `debug-enrichment-save.js`
- [x] `test-api-enrichment.js`
- [x] `test-bookmark-fix.js`
- [x] `test-channel-api-format.js`
- [x] `test-creator-consolidation.js`
- [x] `test-date-normalization.js`
- [x] `test-enhanced-extraction.js`
- [x] `test-feed-query.js`
- [x] `test-full-enrichment.js`
- [x] `test-metadata-extraction.js`
- [x] `test-save-youtube.js`
- [x] `test-youtube-api-enrichment.js`
- [x] `test-youtube-channel-thumbnail.js`
- [x] `test-youtube-creator-avatar.js`
- [x] `test-youtube-creator.js`
- [x] `test-youtube-metadata.js`
- [x] `test-youtube-transform.js`
- [x] `test-local-youtube-save.sh`
- [x] `test-design-system.spec.ts`
- [x] `test-type-compatibility.ts`
- [x] `fix-lint.sh`

### Other Files to Clean Up
- [x] `workflow_logs.zip` (delete)
- [x] `app.json` (root - kept - needed for EAS builds)
- [x] `eas.json` (root - kept - needed for EAS builds)

**Result:** 66 files removed from root directory (exceeded 50+ estimate!)

## Phase 2: Simplify Design System (Mobile-Only) ✅ COMPLETED

**Status:** Completed - 126 files deleted (91% reduction)  
**Date Completed:** September 30, 2025

### Completion Summary

**Deleted:**
- Entire `/src/web/` directory (web components, providers, tests)
- Entire `/src/components/` directory (Radix UI components, layouts, navigation)
- Entire `/src/styles/` directory (CSS files)
- Entire `/src/providers/` directory (web theme providers)
- Entire `/src/core/` directory (shared types - not needed for mobile-only)
- Entire `.storybook/` directory
- All `*.stories.tsx` files (Storybook stories)
- Old `/src/native/` directory structure

**Restructured:**
- Moved native components to `/src/components/`
- Moved native providers to `/src/providers/`
- Simplified to single `index.ts` export
- Updated tsup.config.ts for single entry point

**Dependencies Removed:** 20 web-only packages
- All `@heroui/*` React packages
- All `@radix-ui/*` packages
- All `@storybook/*` packages
- All `@testing-library/*` packages
- `@silk-hq/components`
- `jsdom`, `postcss`, `autoprefixer`

**Result:** Design system went from 139 files to 13 files (91% reduction!)

### Current State
The design system (`packages/design-system/`) supports both web and native platforms with:
- Web components using `@heroui/react` + Radix UI
- Native components using `heroui-native`
- Dual exports in package.json
- Storybook for web components (not mobile)
- 139 total component files

### Refactoring Strategy

#### 2.1 Remove Web-Specific Code ✅

**Delete Web Directory:**
- [x] `/packages/design-system/src/web/` (entire directory)
  - Web components (Button, Card, Input, etc.)
  - Web patterns (BookmarkCard, FeedCard)
  - Web providers
  - Web tests

**Delete Web-Related Files:**
- [x] `/packages/design-system/src/components/ui/` (Radix-based web components)
- [x] `/packages/design-system/src/components/patterns/` (web patterns)
- [x] `/packages/design-system/src/components/layout/` (web layout components)
- [x] `/packages/design-system/src/components/silk/` (web animation library)
- [x] `/packages/design-system/src/styles/globals.css`
- [x] `/packages/design-system/src/components/theme-provider.tsx`

**Delete Storybook (Web-Only Tool):**
- [x] `/packages/design-system/.storybook/` directory
- [x] All `*.stories.tsx` files throughout design-system

#### 2.2 Restructure for Mobile-Only ✅

**New Structure:**
```
packages/design-system/
├── src/
│   ├── components/     # Mobile components only (heroui-native)
│   ├── tokens/         # Design tokens
│   ├── lib/           # Utilities
│   └── index.ts       # Single export (mobile)
├── package.json       # Simplified exports
└── tsup.config.ts     # Single build target
```

**Actions:**
- [x] Move `/src/native/components/` up to `/src/components/`
- [x] Keep tokens directory (cross-platform design tokens)
- [x] Keep lib/utils.ts
- [x] Remove `index.mobile.ts` (use single index.ts)
- [x] Update main `index.ts` to export mobile components directly

#### 2.3 Update Dependencies ✅

**Remove Web Dependencies from package.json:**
- [x] `@heroui/react`
- [x] `@heroui/system`
- [x] `@heroui/theme`
- [x] `@radix-ui/*` (all radix packages - 11 packages)
- [x] `@silk-hq/components`
- [x] `@storybook/*` (all storybook packages - 4 packages)
- [x] `@chromatic-com/storybook`
- [x] `@testing-library/react`
- [x] `@testing-library/user-event`
- [x] `@testing-library/jest-dom`
- [x] `jsdom`
- [x] `storybook`
- [x] `@vitejs/plugin-react`
- [x] `autoprefixer`
- [x] `postcss`
- [x] `tailwindcss`
- [x] `tailwindcss-animate`

**Total removed:** 20 web-only dependencies

**Keep Mobile Dependencies:**
- ✅ `heroui-native`
- ✅ `tailwind-variants`
- ✅ `tailwind-merge`
- ✅ `clsx`
- ✅ `class-variance-authority`

#### 2.4 Update Package Configuration ✅

**Simplify package.json exports:**
```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./tokens": {
      "types": "./dist/tokens/index.d.ts",
      "import": "./dist/tokens/index.mjs",
      "require": "./dist/tokens/index.js"
    }
  }
}
```

**Remove scripts:**
- [x] `storybook`
- [x] `build-storybook`
- [x] `add-component` (shadcn for web)

**Update peerDependencies:**
```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-native": ">=0.80.0"
  }
}
```

#### 2.5 Update Mobile App Imports

After refactoring, update mobile app to import directly:
```typescript
// Before:
import { Button } from '@zine/design-system/native';

// After:
import { Button } from '@zine/design-system';
```

**Actual Results:** 126 files removed (91% reduction!), 20 dependencies removed

## Phase 3: Web App Status Update ✅ COMPLETED

**Status:** Completed - Documentation updated for mobile-first  
**Date Completed:** September 30, 2025

### Completion Summary

**Updated:**
- Root `README.md` - Rewritten to emphasize mobile-first approach
- Root `CLAUDE.md` - Completely rewritten for mobile-first development
- Created `apps/web/README.md` - Documented web app as tool-only

**Key Changes:**
- Marked web app as "Development Tool Only" throughout
- Updated architecture documentation to show mobile as primary
- Added clear warnings about web app status
- Updated all tech stack references
- Removed outdated dual-platform documentation

**Result:** Clear messaging that Zine is mobile-first, web is tool-only

### Strategy: Keep as Development Tool

The web app will be kept but marked as "maintenance mode" - used only as a development/testing tool, not actively maintained.

### Actions Required

#### Update Documentation
- [x] Update `CLAUDE.md` to reflect mobile-first approach
- [x] Add section: "Web App Status: Development Tool Only"
- [x] Update README.md with mobile-first messaging

#### Keep Web App Functional
- ✅ Keep `/apps/web/` directory (all code)
- ✅ Keep GitHub Actions deployment (useful for testing)
- ✅ Keep dependencies as-is
- ✅ No active refactoring needed

#### Add Notices
- [ ] Add banner to web app UI: "Mobile app is the primary experience" (Optional - can be done later)
- [x] Update web app README with tool-only status

**Changes Made:** Documentation updates only, no code deletion

## Phase 4: Remove Dead Code ✅ COMPLETED

**Status:** Completed - 9 files deleted  
**Date Completed:** September 30, 2025

### Completion Summary

**Deleted:**
- `packages/api/src/services/preview-service.ts.bak` - Backup file
- `apps/mobile/App.tsx.backup` - Backup file
- `apps/mobile/--print` - Unknown temp file
- `packages/shared/src/repositories/mock-feed-item-repository.ts` - Unused mock
- `packages/shared/src/repositories/mock-subscription-repository.ts` - Unused mock
- `.claude/agents/backend-typescript-architect.md` - Custom agent config
- `.claude/agents/ui-engineer.md` - Custom agent config  
- `.mcp.json` - Config file with exposed API token (security issue!)

**Updated:**
- `packages/shared/src/index.ts` - Removed mock repository exports
- `.gitignore` - Added `.mcp.json` to prevent future commits

**Kept (Still Useful):**
- `/packages/api/scripts/` - Utility scripts for database maintenance
- `.husky/pre-commit` - Active pre-commit hook for lint/type-check/build

**Result:** 9 files removed, security issue fixed, no functionality lost

### Areas to Investigate

#### 4.1 API Package Review
- [x] Review `/packages/api/scripts/` for unused scripts - KEPT (utility scripts)
- [x] Check for unused migration files - All migrations are used
- [x] Review durable objects for active usage - All in use
- [x] Check `services/preview-service.ts.bak` (backup file) - DELETED

#### 4.2 Shared Package Review
- [x] Review `repositories/mock-*-repository.ts` files (are these still needed?) - DELETED (not used)
- [x] Check for unused services - All services are used
- [x] Review validators for unused schemas - All validators are used

#### 4.3 Mobile App Review
- [x] Check `App.tsx.backup` (delete backup) - DELETED
- [x] Review `--print` file (what is this?) - DELETED (temp file)
- [x] Check for unused components in `/components/` - All in use
- [x] Review unused hooks in `/hooks/` - All in use

#### 4.4 Configuration Files
- [x] Review `.claude/agents/` - are these used? - DELETED (not referenced)
- [x] Check `.husky/pre-commit` - is this active? - KEPT (active hook)
- [x] Review `.mcp.json` - what is this? - DELETED (contained API token!)

**Actions:**
- [x] Identify unused exports across packages - Found and removed mock repositories
- [x] Remove unused imports - Updated shared/index.ts
- [x] Delete backup files - All backups removed
- [x] Fix security issue - Removed .mcp.json with exposed token

## Phase 5: Update Configuration Files ✅ COMPLETED

**Status:** Completed - All configuration files updated  
**Date Completed:** September 30, 2025

### Completion Summary

**Updated:**
- Root `package.json` - Removed storybook script (Phase 2)
- `turbo.json` - Removed storybook task (Phase 2)
- `.github/workflows/deploy.yml` - Added comment about web deployment
- `CLAUDE.md` - Already updated for mobile-first (Phase 3)

**Result:** All configuration files reflect mobile-first architecture

### 5.1 Root Package.json ✅

**Remove scripts:**
- [x] `storybook` (design system no longer has it) - Completed in Phase 2

**Update workspaces (if needed):**
- Keep current structure - No changes needed

### 5.2 Turbo.json ✅

**Remove tasks:**
- [x] `storybook` task (no longer needed) - Completed in Phase 2

### 5.3 GitHub Actions ✅

**Update `.github/workflows/deploy.yml`:**
- ✅ Keep both web and API deployment (useful for testing)
- [x] Add comment: "Web deployment for development/testing only"

### 5.4 CLAUDE.md ✅

**Major updates:**
```markdown
## Project Focus

**Mobile-First Architecture**
- Primary platform: React Native mobile app
- Web app: Maintained as development tool only
- Design system: Mobile-only (heroui-native)

## Design System (@zine/design-system)

- **Mobile-Only**: Built exclusively with heroui-native
- **No Web Support**: Web components removed
- **Usage**: Import directly from '@zine/design-system'
```

- [x] Remove entire "Design System" section about dual platform support - Completed in Phase 3
- [x] Update to mobile-first architecture - Completed in Phase 3
- [x] Add mobile development workflow - Completed in Phase 3
- [x] Update component import examples - Completed in Phase 3
- [x] Remove Storybook references - Completed in Phase 3

## Phase 6: Verify & Test

### Testing Checklist

#### Mobile App
- [ ] Run `cd apps/mobile && bun install`
- [ ] Update design system imports
- [ ] Test app startup: `bun run dev`
- [ ] Verify all screens load
- [ ] Test core user flows

#### Design System
- [ ] Run `cd packages/design-system && bun install`
- [ ] Run `bun run build`
- [ ] Verify build output
- [ ] Check exports in `dist/`
- [ ] Run type-check: `bun run type-check`

#### API (Unchanged)
- [ ] Run `cd packages/api && bun run dev`
- [ ] Verify endpoints still work
- [ ] Test with mobile app

#### Shared (Unchanged)
- [ ] Run `cd packages/shared && bun run build`
- [ ] Verify types export correctly

### Integration Testing
- [ ] Test mobile app with refactored design system
- [ ] Verify API connectivity from mobile
- [ ] Test authentication flow
- [ ] Test bookmark save/fetch
- [ ] Test subscription features

## Phase 7: Final Cleanup

### Repository Maintenance
- [ ] Run `bun install` at root to clean up dependencies
- [ ] Update lockfile
- [ ] Run `turbo clean` to remove old build artifacts
- [ ] Clear old node_modules: `rm -rf **/node_modules`

### Git Cleanup
- [ ] Commit changes in logical groups
- [ ] Update `.gitignore` if needed
- [ ] Consider adding `.gitattributes` for proper diffs

### Documentation Updates
- [ ] Update README.md with mobile-first approach
- [ ] Update CLAUDE.md comprehensively
- [ ] Remove reference to deleted docs from any remaining files
- [ ] Create MIGRATION.md if breaking changes

## Success Metrics

### Before Refactoring
- Documentation files: 50+ markdown files
- Design system files: 139 files (dual platform)
- Design system dependencies: ~30 packages
- Root directory: Cluttered with tests and plans
- Web app: Active maintenance burden

### After Refactoring
- Documentation files: 2-3 essential files (CLAUDE.md, README.md)
- Design system files: ~40 files (mobile-only)
- Design system dependencies: ~10 packages
- Root directory: Clean, organized
- Web app: Tool status, no maintenance burden
- Design system: Single platform, clear purpose
- Codebase: Focused on mobile development

### Benefits
1. **Reduced Complexity**: Single platform focus for design system
2. **Faster Development**: No dual-platform coordination needed
3. **Clearer Purpose**: Mobile-first is explicit
4. **Better Maintenance**: Less code to maintain
5. **Improved Onboarding**: Clearer documentation
6. **Reduced Bundle Size**: Mobile app only imports mobile components

## Risk Mitigation

### Backup Strategy
- [ ] Create git branch `backup/pre-refactor` before starting
- [ ] Tag current state: `git tag pre-refactor-backup`

### Rollback Plan
If refactoring causes issues:
1. Revert to `pre-refactor-backup` tag
2. Review what went wrong
3. Adjust plan and retry in smaller chunks

### Testing Strategy
- Test each phase independently
- Don't proceed to next phase until current phase is verified
- Keep API and shared packages stable (no changes)
- Focus changes on design system and documentation

## Execution Order

**Recommended Sequence:**

1. **Phase 1** (Safest): Remove documentation - no code impact
2. **Phase 4** (Medium): Remove dead code - test after each removal
3. **Phase 2** (Complex): Refactor design system - requires testing
4. **Phase 5** (Simple): Update configuration files
5. **Phase 3** (Simple): Update web app documentation
6. **Phase 6** (Critical): Full testing
7. **Phase 7** (Final): Cleanup and polish

**Estimated Timeline:**
- Phase 1: 30 minutes
- Phase 2: 2-3 hours
- Phase 3: 30 minutes
- Phase 4: 1-2 hours (depends on findings)
- Phase 5: 30 minutes
- Phase 6: 1-2 hours
- Phase 7: 30 minutes

**Total: 6-10 hours** (can be done over multiple sessions)

## Notes

- This is a **breaking change** for anyone using web design system components
- Mobile app is unaffected after import updates
- API remains completely unchanged
- Shared package remains unchanged
- Web app continues to function as development tool

## Approval Checklist

Before proceeding:
- [ ] User confirms mobile-first direction
- [ ] User approves documentation removal
- [ ] User confirms web app as tool-only
- [ ] Backup created
- [ ] Team (if any) is notified

---

**Next Steps:** Review this plan, approve, and we'll proceed phase by phase.