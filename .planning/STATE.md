# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-30)

**Core value:** Talking about your day for a minute gives you back a comic that feels like your life, with the same faces in every panel; the check-in card and monthly magazine matter equally.
**Current focus:** Phase 3 — Meta Model Pipeline

## Current Position

Phase: 3 of 5 (Meta Model Pipeline)
Plan: 2 of 5 in current phase
Status: In progress
Last activity: 2026-10-31 — Completed 03-02 (real sheets and panels, Painterly theme); planned 03-05 and inserted Phase 3.1 Design Refresh

Progress: █████░░░░░ 50% (7 of 14 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 26 min
- Total execution time: 2.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 2 | 48 min | 24 min |
| 2. Comic Experience | 3 | 87 min | 29 min |
| 3. Meta Model Pipeline | 1 | 22 min | 22 min |

**Recent Trend:**
- Last 5 plans: 12, 16, 21, 50, 22 min
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
- 03-02: Two art themes (Zine, Painterly); sheets per character per style; ~$0.42 spent.
- User requests (2026-10-31): storytelling modes, cast reused by name, design refresh (Muse art; Higgsfield/Google Flow not connected in this session).
- Build on mock data until the Meta API credits appear on the Billing page; the card is saved, so any real call before then is charged to it.
- 03-01: ComicModels.sources switches methods to Meta one at a time (transcribe and script real, panels mock). Run real calls with COMIMO_MOCK=0 on the command line; .env.local keeps COMIMO_MOCK=1.
- 03-01: Every Meta request goes through metaFetch with onSend → meter.beforeCall(kind); image and SAM calls must be metered per call (daily cap); refunds only when nothing was sent.
- 03-01: Visitor id only from Vercel's platform-set forwarded headers (VERCEL=1), else "local"; X-Real-IP never read.
- 03-01: Voice notes are converted to 16 kHz mono WAV in the browser; Spark scenes are English, dialogue keeps the speaker's language mix.

### Deferred Issues

6 open (ISS-002 placeholder label, ISS-003 font warning, ISS-005 panel body size, fix in 03-02; ISS-006 missing favicon, 04-02; ISS-007 deleted character id, Phase 4; ISS-008 in-memory guard counters, 05-01) — see ISSUES.md

### Blockers/Concerns

- Credits arrived ($150) and the key works. Free credits: Meta may use submitted content, so test with invented days.
- Billing spend alert was set to $500; user asked to lower it to $140.

## Session Continuity

Last session: 2026-10-30 17:20
Stopped at: Completed 03-01-PLAN.md; next is 03-02 (reference sheets and panel generation)
Resume file: None
