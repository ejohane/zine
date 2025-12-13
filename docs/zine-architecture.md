# Zine – Ground-Up Architecture & Domain Definition

## Purpose of This Document

This document defines the **core domain model, architectural boundaries, and ingestion philosophy** for the Zine app.  
Its primary goal is to enable:

- **Fast iteration**
- **A clean, evolvable data model**
- **Reliable, extensible ingestion pipelines**

This is intentionally not a full technical implementation spec. It establishes **what the system is**, **what it is not**, and **where responsibilities live**, so future design and implementation decisions stay coherent.

---

## High-Level Product Intent

Zine is a **content capture and curation tool**.

- Users save links to content they want to return to later
- Content can arrive **manually** (user saves a URL)
- Content can arrive **automatically** via subscriptions (Sources)
- The app helps users decide what to keep (Bookmark) vs pass on (Archive)
- Zine does **not** try to consume or play content itself

Zine optimizes for:
- Intentional saving
- Clear inbox triage
- Long-term reference and rediscovery

---

## Core Domain Objects (First-Class)

Zine intentionally has **only three first-class domain objects** at the core.

### Bookmark

**What it is**
- A deliberate, user-created reference to a piece of content
- Always links out to the original content

**Solves**
- Saving links for later reference or consumption

**Does NOT**
- Play or embed content
- Act as a feed
- Automatically ingest content

---

### Inbox

**What it is**
- A queue of content **automatically ingested** from Sources

**Solves**
- Triage: decide what is worth bookmarking
- Separates passive intake from intentional saving

**Does NOT**
- Store bookmarks
- Accept manually saved URLs
- Act as a long-term content store

**Lifecycle**
- New → Archived (default action)
- Bookmarking removes it from Inbox but keeps the canonical item

---

### Source

**What it is**
- A subscription to a specific content-producing entity inside a provider

Examples:
- YouTube channel
- Spotify podcast
- RSS feed URL
- Newsletter feed

**Does NOT**
- Define the domain model
- Perform deduplication
- Decide what becomes a Bookmark

---

## Canonical Content Model

### Canonical Item

A **canonical item** represents *one piece of content* across the system.

- Inbox items and Bookmarks both reference the same canonical item
- The same content arriving from multiple Sources resolves to one canonical item

---

## Identity Strategy

- **Primary**: Provider-native IDs (scoped by provider)
- **Fallback**: Canonical URL (after normalization)

---

## Field Model (Layered)

### Required at Creation

- id
- contentType
- providerId OR canonicalUrl
- createdAt
- sourceRefs

### Enriched Asynchronously

- title
- summary
- author
- publisher
- publishedAt
- thumbnailUrl
- duration
- language
- normalizedCanonicalUrl
- rawProviderRefs

---

## Ingestion Architecture

### Principle
**Sources fetch raw data. Ingestion owns normalization.**

### Source Fetch Layer
- Fetch provider-shaped data
- Emit raw envelopes
- No domain logic

### Ingestion Layer
- Deduplication
- Canonical resolution
- Inbox creation
- Enrichment scheduling

---

## Sync Model

- Hourly background sync
- On-demand refresh
- No real-time guarantees

---

## Non-Goals

- No in-app media playback
- No auto-bookmarking
- No strict ingestion blocking on enrichment
- No premature large-scale optimization

---

## Open Design Areas

1. Data model & persistence
2. Ingestion mechanics
3. Sync & local-first
4. Search & filtering
5. Failure modes
