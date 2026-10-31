# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-30)

**Core value:** Talking about your day for a minute gives you back a comic that feels like your life, with the same faces in every panel; the check-in card and monthly magazine matter equally.
**Current focus:** Phase 3.2 complete (accounts, cloud comics, photo albums); next 04-02 and Phase 5 — Ship

## Current Position

Phase: 3.2 of 5 (Accounts and Cloud)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-10-31 — Completed 03.2-02: comics, cast and images synced per account; photo albums with QR codes; account deletion

Progress: █████████░ 88% (15 of 17 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 70 min
- Total execution time: about 14 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 2 | 48 min | 24 min |
| 2. Comic Experience | 3 | 87 min | 29 min |
| 3. Meta Model Pipeline | 6 | 13.3 h | 133 min |

**Recent Trend:**
- Last 5 plans: 75, 225, 180, 220, 75 min
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
- 03-03: Every panel gets a SAM 3.1 pass (one phrase per cast member + person + face sweeps, 1280 px copy, store:false); Spark judges cut-outs against sheets; at most 2 redraws; COMIMO_SAM_CHECK=0 keeps only the SAM pass. Panel.figures and consistency.method/sam are stored; UI copy about SAM comes only from them.
- 03-03: Phone pages are full-width rows (one panel or a pair), cover-cropped around the characters (crop.ts shared by pageView and lettering); panels with figures letter in free space off every head.
- 03-03: Test servers are built from a scratch copy so the user's :3000 server keeps its .next.
- 03-06: New people (named, or unnamed but taking part, e.g. "the cashier") are drawn under placeholders new1..new4 until the user answers the "New faces" step before drawing: Add to cast / Just this story (one-off, `oneoff:<placeholder>`, Day.oneOffs) / Never ask (one-off now and later). Skip all = one-offs, offered once after the comic.
- 03.2-02: Comics, cast, synced settings and images live with the account (/api/me/*, Upstash + private Vercel Blob; .data locally); IndexedDB is a per-account offline cache synced each page load, newest stamp wins. Pre-account comics are offered "Move these comics to your account".
- 03.2-02: Photo albums per day: up to 20 EXIF-free photos or an https link, 128-bit link id, public by link (noindex), QR on the comic's last page and in the magazine; Muse Spark captions only when the owner asks.
- 03.2-02: Account deletion removes everything behind a deleting mark (resumable via next sign-in or /api/maintenance/deletions).
- 03-06: A one-off's later panels use their first panel (signed via PanelResponse.imageToken, cut to their SAM box on the server) as the reference, and the face judge compares against it. One-offs are left out of the magazine cast.

### Deferred Issues

4 open (ISS-002 placeholder label, ISS-003 font warning, ISS-006 missing favicon, 04-02; ISS-008 in-memory guard counters, 05-01) — see ISSUES.md

### Blockers/Concerns

- REMIND USER (they said yes, do later): create a **Private** Vercel Blob store and accept Upstash Redis terms in the Vercel dashboard; set NEXT_PUBLIC_SITE_URL, COMIMO_GUARD_SALT and optionally COMIMO_MAINTENANCE_SECRET (+ cron). Needed for 03.2 in production and for 05-01 deploy.
- Vercel caps request bodies at 4.5 MB: photos are shrunk in the browser, but a comic image over 4.5 MB can't sync on Vercel.

- Credits arrived ($150) and the key works. Free credits: Meta may use submitted content, so test with invented days. 03-04 spent about $0.36, 03-03 about $0.80, 03-06 about $0.27, 03.2-02 about $0.01 (captions) (total about $3.18).
- Billing spend alert was set to $500; user asked to lower it to $140.

## Session Continuity

Last session: 2026-10-31 13:10
Stopped at: Completed 03.2-02-PLAN.md; Phase 3.2 complete
Resume file: None
