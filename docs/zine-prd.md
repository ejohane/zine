# Product Requirements Document (PRD): Zine

## Overview

Zine is a modern bookmarking app designed to save and organize web content across multiple platforms. It intelligently identifies the content type and source of each bookmark and provides powerful tools for categorization, organization, and discovery.

## Problem Statement

Current bookmarking solutions are either too generic or too limited in functionality. Users need a smarter way to organize saved content — one that recognizes what they're saving, helps them group related content, and keeps their collections fresh via automated syncing.

## Goals
• Provide a seamless experience for saving, organizing, and retrieving content from across the web
• Automatically enrich bookmarks with metadata (e.g., title, platform, content type)
• Support flexible organization via collections and tags
• Enable ongoing content discovery via connected data sources

⸻

## Core Features

### 1. Save Bookmark
• Ability to save any URL via mobile or web app
• Normalize and store metadata: title, favicon, hostname, canonical URL
• Persist user info: createdAt, source (manual, synced), user ID

### 2. Source Detection
• Detect platform (e.g., Spotify, YouTube, X, Substack) based on the URL
• Store source type for filtering and grouping

### 3. Content Type Detection
• Determine content type: article, video, podcast, music, tweet, link, etc.
• Enable filtering and searching by content type

### 4. Collections / Lists
• Create named collections
• Add bookmarks to one or more collections
• Reorder bookmarks within a collection

### 5. Archive / Delete
• Archive bookmarks to hide them from main views while retaining history
• Permanently delete bookmarks

### 6. Data Source Syncing
• Add data source integrations (e.g., Spotify shows, RSS feeds)
• Periodically pull new content (e.g., latest podcast episodes)
• De-duplicate synced content
• Support manual refresh

### 7. Tagging
• Add multiple tags to each bookmark
• Support suggested tags based on content

### 8. Search and Filtering
• Search bookmarks by tag, title, source, content type
• Filter by collection, archive state, or date saved