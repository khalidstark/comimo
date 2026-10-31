# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-30)

**Core value:** Talking about your day for a minute gives you back a comic that feels like your life, with the same faces in every panel; the check-in card and monthly magazine matter equally.
**Current focus:** Phase 3 — Meta Model Pipeline

## Current Position

Phase: 3 of 5 (Meta Model Pipeline)
Plan: 4 of 5 in current phase (03-03 SAM next)
Status: In progress
Last activity: 2026-10-31 — 03-04 layouts, 03-05 storyteller/pages/cast-by-name and 03.1 design refresh merged on main

Progress: ███████░░░ 71% (10 of 14 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 46 min
- Total execution time: 6.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 2 | 48 min | 24 min |
| 2. Comic Experience | 3 | 87 min | 29 min |
| 3. Meta Model Pipeline | 3 | 5.3 h | 106 min |

**Recent Trend:**
- Last 5 plans: 21, 50, 22, 75, 225 min
- Trend: longer (real model calls, visual review rounds)

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
- 03-02: Two art themes (Zine, Painterly); sheets per character per style; ~$0.42 spent.
- User requests (2026-10-31): storytelling modes, cast reused by name, design refresh (Muse art; Higgsfield/Google Flow not connected in this session).
- Build on mock data until the Meta API credits appear on the Billing page; the card is saved, so any real call before then is charged to it.
- 03-01: ComicModels.sources switches methods to Meta one at a time (transcribe and script real, panels mock). Run real calls with COMIMO_MOCK=0 on the command line; .env.local keeps COMIMO_MOCK=1.
- 03-01: Every Meta request goes through metaFetch with onSend → meter.beforeCall(kind); image and SAM calls must be metered per call (daily cap); refunds only when nothing was sent.
- 03-01: Visitor id only from Vercel's platform-set forwarded headers (VERCEL=1), else "local"; X-Real-IP never read.
- 03-01: Voice notes are converted to 16 kHz mono WAV in the browser; Spark scenes are English, dialogue keeps the speaker's language mix.
- 03-04: Pages use 13 hand-designed templates (src/lib/layout); the layout is picked after the script, stored on the Day, never repeats the previous day's template; old days get one on read (layoutChain).
- 03-04: Each panel is drawn at its slot's aspect (nearest of 15 Muse sizes) with a lettering zone Muse Image keeps empty; the frame is stored on the panel. Phone pages keep each image's aspect (no crop).
- 03-04: `npm test` (Vitest 4) covers layout invariants; lint with `npx eslint src` (the whole folder also scans .claude/worktrees).

### Deferred Issues

6 open (ISS-002 placeholder label, ISS-003 font warning, ISS-006 missing favicon, 04-02; ISS-007 deleted character id, Phase 4; ISS-008 in-memory guard counters, 05-01; ISS-010 SAM copy while mock, 03-03) — see ISSUES.md

### Blockers/Concerns

- Credits arrived ($150) and the key works. Free credits: Meta may use submitted content, so test with invented days. 03-04 spent about $0.36.
- Billing spend alert was set to $500; user asked to lower it to $140.

## Session Continuity

Last session: 2026-10-31 07:40
Stopped at: Completed 03-04-PLAN.md; next are 03-03 (SAM consistency) and 03-05 (storytelling modes, cast by name)
Resume file: None
