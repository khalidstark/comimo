# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-30)

**Core value:** Talking about your day for a minute gives you back a comic that feels like your life, with the same faces in every panel; the check-in card and monthly magazine matter equally.
**Current focus:** Phase 2 — Comic Experience

## Current Position

Phase: 2 of 5 (Comic Experience)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-10-30 — Completed 02-01-PLAN.md (recorder, pipeline, progress screen)

Progress: ███░░░░░░░ 27% (3 of 11 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 21 min
- Total execution time: 1.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 2 | 48 min | 24 min |
| 2. Comic Experience | 1 | 16 min | 16 min |

**Recent Trend:**
- Last 5 plans: 36, 12, 16 min
- Trend: steady (autonomous plans)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 01-01: Zine design approved; all art through src/art/manifest.ts.
- 01-01: Small commits, push after each (user request).
- Sprite sheets for cast and mascot added to scope (Phase 2 component, Phase 4 art).
- 01-02: Mock mode is on when COMIMO_MOCK=1 or MODEL_API_KEY is empty; non-mock is a stub (503) until Phase 3. Nothing calls api.meta.ai.
- 01-02: Records hold ImageRef (blob id or manifest path), never data URLs; images cross the API as {mimeType, base64}.
- 01-02: Kept the approved starter cast; ISS-004 closed, user keeps it as is.
- 02-01: Progress is a modal <dialog> over /record; cancel keeps the voice note. ComicPipeline resumes at the failed step.
- 02-01: Saved days use blob ImageRefs `<dayId>-panel-<n>` (and `-before`); starter cast is seeded into the store on first run.
- Build on mock data until the Meta API credits appear on the Billing page; the card is saved, so any real call before then is charged to it.

### Deferred Issues

5 open (ISS-001 bidi punctuation in bubbles, fix in 02-02; ISS-005 panel body size, fix in 03-02; ISS-006 missing favicon, 04-02) — see ISSUES.md

### Blockers/Concerns

- Phase 3 needs the $150 credits (form submitted 2026-10-30, waiting for the batch).
- Billing spend alert was set to $500; user asked to lower it to $140.

## Session Continuity

Last session: 2026-10-30 15:27
Stopped at: Completed 02-01-PLAN.md; next is 02-02 (day reader from IndexedDB; new days currently land on the "not on this device" state)
Resume file: None
