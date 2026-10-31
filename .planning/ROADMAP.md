# Roadmap: Comimo

## Overview

Build the app in the order the credits allow. First a Next.js skeleton with the design system, on-device storage and a mock mode. Then the whole comic experience running on mock data. When the Meta API credits arrive, swap in the real model pipeline (voice, Spark, Image, SAM). Then the monthly magazine, the Muse-generated site art and the demo content. Last, deploy and prepare the submission.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation** - Next.js skeleton, design system, art manifest with placeholders, on-device storage, mock mode
- [x] **Phase 2: Comic Experience** - Record, progress, comic reader with RTL bubbles, check-in card, day weather and cast, all on mock data
- [x] **Phase 3: Meta Model Pipeline** - Real Voice Transcribe, Spark, Image and SAM 3.1 calls with the consistency fix loop and a spending guard
- [ ] **Phase 3.1: Design Refresh (INSERTED)** - Real Muse art on the home page, simpler path, more interaction
- [x] **Phase 3.2: Accounts and Cloud (INSERTED)** - Quick email/password accounts, comics synced per account, photo albums with QR codes
- [ ] **Phase 4: Magazine and Art** - Monthly flip-through comic book, Muse-generated site art and sprites, sample days and demo content
- [ ] **Phase 5: Ship** - Vercel deploy with rate limits, README, voice-note scripts, demo video prep and submission

## Phase Details

### Phase 1: Foundation
**Goal**: A running Next.js app with the visual identity, page shells, an art manifest that serves placeholder art, IndexedDB storage for days and cast, and a mock mode for every model call
**Depends on**: Nothing (first phase)
**Research**: Unlikely (standard Next.js setup)
**Plans**: 2 plans

Plans:
- [x] 01-01: Scaffold Next.js app, design tokens, fonts, layout, page shells and art manifest with placeholders
- [x] 01-02: Data model, IndexedDB store, mock model layer with fixtures for an invented cast and sample days

### Phase 2: Comic Experience
**Goal**: The full journey works end to end on mock data: record or upload, watch the comic being made, read it, answer the check-in card on heavy days, manage the cast
**Depends on**: Phase 1
**Research**: Unlikely (internal UI on Phase 1 patterns)
**Plans**: 3 plans

Plans:
- [x] 02-01: Recorder (mic and upload) and the "making your comic" progress screen
- [x] 02-02: Comic reader with panels, Arabic and English speech bubbles, day weather icon
- [x] 02-03: Check-in card, safety helpline card, cast screen, Sprite component (CSS steps sprite-sheet player) with placeholder sheets

### Phase 3: Meta Model Pipeline
**Goal**: Real calls replace the mocks: transcription, comic script with mood and heavy-day detection, character reference sheets, panels, and the SAM 3.1 check-and-redraw loop with visible before and after, protected by a spending guard
**Depends on**: Phase 2, and the credits being on the Billing page
**Research**: Likely (external API)
**Research topics**: Meta Model API model ids and request shapes for Muse Voice Transcribe, Muse Image (reference images, edits or inpainting), SAM 3.1 (prompted segmentation, masks); Muse Spark structured JSON output; pricing per call
**Plans**: 6 plans

Plans:
- [x] 03-01: Server model client, transcription and comic script generation with spending guard
- [x] 03-02: Character reference sheets and panel generation, with a second art theme: Painterly
- [x] 03-03: SAM 3.1 consistency check and redraw loop
- [x] 03-04: Dynamic manga-style page layouts (shot types, varied panel sizes, splash, slants, insets)
- [x] 03-05: Storytelling modes (narrated / dialogue / both) and cast recognised by name
- [x] 03-06: Ask about new names before drawing: add to cast or keep as a one-off character

### Phase 3.1: Design Refresh (INSERTED)
**Goal**: More beautiful, easier and more interactive site with real Muse Image art (user request)
**Depends on**: Phase 3 plan 03-02 (image client)
**Research**: Unlikely
**Plans**: 1 plan

Plans:
- [x] 03.1-01: Real site art and mascot sprites with Muse Image; home and nav refresh; user design check

### Phase 3.2: Accounts and Cloud (INSERTED)
**Goal**: Each person has their own Comimo across devices; real photo albums linked by QR (user request)
**Depends on**: Phase 3
**Research**: Likely (Upstash Redis REST client, Vercel Blob SDK, Next 16 auth patterns)
**Plans**: 2 plans

Plans:
- [x] 03.2-01: Quick accounts (email + password, no verification), sessions, per-account shared limits, guest try-out
- [x] 03.2-02: Cloud comics and cast per account, photo album with QR code on the last page

### Phase 4: Magazine and Art
**Goal**: The monthly comic book, the real Muse-generated art across the site, and demo content that makes the site impressive even without recording
**Depends on**: Phase 3
**Research**: Unlikely (internal patterns; image calls already built)
**Plans**: 2 plans

Plans:
- [x] 04-01: Monthly magazine flip-through with the mood strip
- [ ] 04-02: Walkthrough motion video (Remotion): our story and cast, new-faces choice, photos and QR, page building, month merging into one comic book; on the site and reused in the demo

### Phase 5: Ship
**Goal**: Live URL, public repo, README, voice-note scripts and a ready demo, submitted before the deadline
**Depends on**: Phase 4
**Research**: Unlikely (Vercel CLI)
**Plans**: 1 plan

Plans:
- [ ] 05-01: Deploy with a shared spending guard, README, demo script, submission pack, submit

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-10-30 |
| 2. Comic Experience | 3/3 | Complete | 2026-10-30 |
| 3. Meta Model Pipeline | 6/6 | Complete | 2026-10-31 |
| 3.1. Design Refresh (INSERTED) | 1/1 | Complete (merged; user review pending) | 2026-10-31 |
| 3.2. Accounts and Cloud (INSERTED) | 2/2 | Complete | 2026-10-31 |
| 4. Magazine and Art | 1/2 | In progress (video in review) | - |
| 5. Ship | 0/1 | Not started | - |
