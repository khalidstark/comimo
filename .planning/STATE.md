# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-30)

**Core value:** Talking about your day for a minute gives you back a comic that feels like your life, with the same faces in every panel; the check-in card and monthly magazine matter equally.
**Current focus:** Phase 2 — Comic Experience

## Current Position

Phase: 2 of 5 (Comic Experience)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-10-30 — Completed 02-02-PLAN.md (comic reader, bidi bubbles, SAM before/after)

Progress: ████░░░░░░ 36% (4 of 11 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 21 min
- Total execution time: 1.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 2 | 48 min | 24 min |
| 2. Comic Experience | 2 | 37 min | 19 min |

**Recent Trend:**
- Last 5 plans: 36, 12, 16, 21 min
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
- 02-02: /day/[id] prerenders sample days and reads any other id from IndexedDB on the client (DayReader); comic components live in src/components/comic.
- 02-02: Bubble direction follows the first strong letter; every language run is isolated in a <bdi> (ISS-001 closed).
- 02-02: Next 16 hides pages with Activity instead of unmounting; modal dialogs must close in a layout effect cleanup.
- Build on mock data until the Meta API credits appear on the Billing page; the card is saved, so any real call before then is charged to it.

### Deferred Issues

4 open (ISS-002 placeholder label, ISS-003 font warning, ISS-005 panel body size, fix in 03-02; ISS-006 missing favicon, 04-02) — see ISSUES.md

### Blockers/Concerns

- Phase 3 needs the $150 credits (form submitted 2026-10-30, waiting for the batch).
- Billing spend alert was set to $500; user asked to lower it to $140.

## Session Continuity

Last session: 2026-10-30 15:48
Stopped at: Completed 02-02-PLAN.md; next is 02-03 (check-in card, safety card, cast editor, sprite player; then the user checkpoint)
Resume file: None
