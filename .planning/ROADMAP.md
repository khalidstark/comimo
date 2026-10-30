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
- [ ] **Phase 3: Meta Model Pipeline** - Real Voice Transcribe, Spark, Image and SAM 3.1 calls with the consistency fix loop and a spending guard
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
**Plans**: 3 plans

Plans:
- [x] 03-01: Server model client, transcription and comic script generation with spending guard
- [ ] 03-02: Character reference sheets and panel generation
- [ ] 03-03: SAM 3.1 consistency check and redraw loop

### Phase 4: Magazine and Art
**Goal**: The monthly comic book, the real Muse-generated art across the site, and demo content that makes the site impressive even without recording
**Depends on**: Phase 3
**Research**: Unlikely (internal patterns; image calls already built)
**Plans**: 2 plans

Plans:
- [ ] 04-01: Monthly magazine flip-through with the mood strip
- [ ] 04-02: Art generation script for site art and character/mascot sprite sheets (idle, blink, talk, wave), sample days and example comics

### Phase 5: Ship
**Goal**: Live URL, public repo, README, voice-note scripts and a ready demo, submitted before the deadline
**Depends on**: Phase 4
**Research**: Unlikely (Vercel CLI)
**Plans**: 1 plan

Plans:
- [ ] 05-01: Deploy with rate limits, README, voice-note scripts, demo checklist, submit

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-10-30 |
| 2. Comic Experience | 3/3 | Complete | 2026-10-30 |
| 3. Meta Model Pipeline | 1/3 | In progress | - |
| 4. Magazine and Art | 0/2 | Not started | - |
| 5. Ship | 0/1 | Not started | - |
