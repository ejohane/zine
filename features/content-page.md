# Feature Requirements Document: Content Page

## Overview
This document outlines the requirements for the "Content Page" feature in the app. This feature allows users to view detailed information about a content item selected from the queue list view.

## Purpose
The purpose of this feature is to provide users with a dedicated page displaying metadata, visuals, and actions related to a piece of saved content, enhancing the user's ability to understand, manage, and take actions on the content.

## User Flow
1. User taps on a content item in the queue list view.
2. App navigates to a dedicated content detail page.
3. User can:
   - View title, thumbnail, creator, publish date, and description.
   - Perform quick utility actions (archive, add to folder, share).
   - Open the content via a context-aware button.
4. User can swipe back or tap the back button to return to the queue list.

## Requirements

### 1. Navigation
- Tapping a content item from the queue list opens a new full-screen page.
- Page includes a back button in the top-left corner and supports iOS swipe-to-go-back gesture.

### 2. Header
- Header includes:
  - Back button (standard iOS style).
  - Center-aligned title displaying the **name of the content**.

### 3. Content Details Layout
The layout should follow this vertical stack:

#### a. Thumbnail
- Prominently displayed below the header.
- Should maintain aspect ratio (e.g., 16:9 or square, based on content type).

#### b. Creator Info Row
- Horizontally aligned row containing:
  - Creator’s name (left-aligned).
  - Published date (right-aligned).
- Style: Subtle, secondary text style.

#### c. Utility Actions Row
- Positioned under the creator info row.
- Horizontally aligned icons (no text):
  - Archive (checkbox icon)
  - Add to folder (folder with a plus icon)
  - Share (standard iOS share icon)
- Aligned to the left.
- Tappable areas with a minimum touch target of 44x44 pts.

#### d. Open Link Button
- Positioned on the right side of the utility actions row.
- Button is:
  - Context-aware:
    - YouTube → Red, YouTube logo
    - Spotify → Green, Spotify logo
    - Generic → Neutral gray, link icon
  - Text should be: "**Open in [Platform]**"
  - Includes an "external link" icon on the **right** of the text.
- Uses platform branding guidelines when available.

#### e. Description
- Positioned below the actions.
- Full paragraph-style description with line spacing optimized for readability.
- Scrollable if the description overflows.

## Edge Cases
- If no thumbnail is available, show a placeholder.
- If content source is unrecognized, fall back to a generic "Open Link" style and neutral branding.
- If no publish date is available, hide it from the UI.

## Out of Scope (for initial release)
- Comments or user-generated content
- Related content recommendations
- Editing content metadata from the detail page
