# Zine – Sync & Local‑First Architecture (Replicache + Durable Objects)

## Purpose

This document defines the **sync and local‑first architecture** for Zine, based on the following decisions:

- Mobile‑first (Expo / React Native)
- Per‑user isolated data
- Local‑first UX with offline support
- Cloudflare Durable Objects as the authoritative server
- Replicache as the sync protocol and client contract

---

## High‑Level Architecture

Client (Mobile)
└─ Replicache
   └─ Local KV Store
      └─ UI reads (instant, offline)

⇅ push / pull

Cloudflare Durable Object (per user)
└─ SQLite (authoritative)

---

## Core Principles

- Local‑first reads
- Server‑authoritative truth
- Single‑writer per user
- Replicache‑first design
- Simple conflict semantics (last write wins)

---

## Client Data Model (Replicache KV)

- item/{id}
- state/{id}
- source/{id}

Client data is denormalized and optimized for UI reads.

---

## Index Strategy

Primary list:
- idx/list/{state}/{timeKey}/{id}

Provider filter:
- idx/provider/{state}/{provider}/{timeKey}/{id}

ContentType filter:
- idx/type/{state}/{contentType}/{timeKey}/{id}

Search:
- s/{state}/title/{token}/{id}
- s/{state}/publisher/{token}/{id}

---

## Sorting Rules

Inbox:
- Sorted by ingestedAt

Bookmarks (future screen):
- Sorted by bookmarkedAt

---

## Search (MVP)

- Screen‑scoped
- Local‑first
- Offline supported
- Prefix‑based matching

---

## Ingestion Interaction

- Runs inside user Durable Object
- Writes directly to SQLite
- Replicache pull syncs changes to client

---

## Non‑Goals

- No global canonical content
- No collaborative editing
- No real‑time guarantees

---

End of document.
