---
phase: 01-foundation
plan: 02
subsystem: api
tags: [typescript, indexeddb, idb, route-handlers, mock-mode, fixtures]

requires:
  - phase: 01-foundation (01-01)
    provides: Next.js 16 skeleton, art manifest, page shells, src/lib/sample.ts
provides:
  - Data model in src/lib/types.ts (Character with sprite sheet, Panel with SAM before/after, Day with check-in and safety flag, MonthBook, API wire types)
  - IndexedDB store (days, cast, images as Blobs) that degrades to empty results
  - Swappable server-side model interface (transcribe, writeScript, drawPanel, checkConsistency) chosen by getModels()
  - Fixture-backed mock with delays, heavy-day and crisis paths, SVG panels and a fake drift fix
  - POST /api/transcribe, /api/script, /api/panel
  - Typed fixtures: 4-member starter cast, 5 mixed Arabic/English sample days
affects: [02-comic-experience, 03-meta-model-pipeline, 04-magazine-and-art]

tech-stack:
  added: [idb@8.0.4]
  patterns:
    - "Records hold ImageRef ({kind: blob, id} or {kind: art, path}); images never inline as data URLs"
    - "Routes call getModels(); mock when COMIMO_MOCK=1 or MODEL_API_KEY is empty; X-Comimo-Mode header on responses"
    - "Images cross the wire as {mimeType, base64}"
    - "Store calls never throw: reads fall back to empty, writes return false"

key-files:
  created: [src/lib/types.ts, src/lib/store.ts, src/lib/format.ts, src/lib/models/index.ts, src/lib/models/mock.ts, src/lib/models/wire.ts, src/app/api/transcribe/route.ts, src/app/api/script/route.ts, src/app/api/panel/route.ts, src/fixtures/cast.ts, src/fixtures/days.ts]
  modified: [src/art/manifest.ts, src/app/page.tsx, src/app/cast/page.tsx, src/app/month/page.tsx, src/app/day/[id]/page.tsx, package.json, .env.example]

key-decisions:
  - "Kept the approved starter cast (Nour, Karim, Teta Samia, Mishmish) instead of swapping in a teacher and younger sibling; the role type supports teacher"
  - "Non-mock mode is a stub that throws ModelsNotConnectedError (503) and makes no network call until Phase 3"
  - "/api/panel runs draw and consistency check in one call and returns the final image plus the before image"
  - "Mock panels are generated SVG cards, not files read from public/, so mocks work in a serverless bundle"

patterns-established:
  - "Pattern: ArtPath ('scenes.street') + artAt() to point data at manifest art"
  - "Pattern: hand-written request validators in each route; errors as {error} JSON"

issues-created: [ISS-004, ISS-005]

duration: 12min
completed: 2026-10-30
---

# Phase 1 Plan 2: Data Model and Mock Layer Summary

**Typed data model, an IndexedDB store that never crashes, and three API routes answering from fixtures through one swappable model interface, so Phase 2 can build the full journey with no API spend**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-30T12:58:28Z
- **Completed:** 2026-10-30T13:10:00Z
- **Tasks:** 2
- **Files modified:** 18 (11 created, 6 modified, 1 deleted)

## Accomplishments
- `types.ts` covers Phase 2 to 4: SAM results per panel (drifted, fixed, before image; the after image is `Panel.image`), sprite sheets on `Character` (frame size, columns, idle/blink/talk/wave rows with frames, fps and loop), check-in questions and answers, safety flag, language mix, month book
- Store with `days` (by-date index), `cast` and `images` (Blob, out-of-line key); month listing by key range
- Mock layer: transcribe picks a fixture transcript, writeScript matches fixtures (heavy hints go to the deadline day, crisis hints return `safety: "crisis"` with no panels), maps fixture characters onto a caller's cast by role, drawPanel returns an SVG card, checkConsistency flags about one panel in three and stamps a "FIXED" after image
- Sample content moved from `src/lib/sample.ts` into `src/fixtures/`. Added a fifth day ("A grey Sunday", rainy) so all five moods appear. Pages render the same as before.

## Task Commits

1. **Task 1: Types and on-device store**
   - `d30552b` chore(01-02): add idb for the on-device store
   - `34b3232` feat(01-02): let records point at art by manifest path
   - `7bf39f6` feat(01-02): define the data model for days, panels, cast and API
   - `1f60020` feat(01-02): add the IndexedDB store for days, cast and images
2. **Task 2: Mock model layer, API routes and fixtures**
   - `db1216c` feat(01-02): add the invented starter cast as typed fixtures
   - `df9fa1c` feat(01-02): add five mixed Arabic and English sample days as fixtures
   - `dbb3848` feat(01-02): give mood words and date formatting their own module
   - `d928c35` chore(01-02): read sample content from fixtures and drop lib/sample.ts
   - `4543f3b` feat(01-02): add the swappable model interface with a fixture-backed mock
   - `af30ad6` feat(01-02): add JSON, error and image helpers for the API routes
   - `8f583ae` feat(01-02): add POST /api/transcribe on the model interface
   - `781bcc8` feat(01-02): add POST /api/script on the model interface
   - `77b7398` feat(01-02): add POST /api/panel with the draw and consistency check
   - `547a0f2` chore(01-02): default to mock mode in the env example

Each commit was pushed right after it was made.

## Files Created/Modified
- `src/lib/types.ts` - the data model and API request/response types
- `src/lib/store.ts` - IndexedDB store via idb, safe when storage is unavailable
- `src/lib/format.ts` - mood words, date formatting, count words (moved out of sample.ts)
- `src/lib/models/index.ts` - `ComicModels` interface, `getModels()`, `isMockMode()`, Phase 3 stub
- `src/lib/models/mock.ts` - fixture-backed mock implementation
- `src/lib/models/wire.ts` - JSON responses, error mapping, base64 image encoding
- `src/app/api/{transcribe,script,panel}/route.ts` - the three POST routes
- `src/fixtures/cast.ts`, `src/fixtures/days.ts` - starter cast and five sample days
- `src/art/manifest.ts` - `ArtPath` type and `artAt()` resolver
- Pages (home, cast, month, day) - read from fixtures; month lede counts the days
- `.env.example` and `.env.local` - `COMIMO_MOCK=1` appended (`.env.local` is not committed)

## Decisions Made
- **Starter cast unchanged.** The plan listed a teacher and a younger sibling, but 01-01 already shipped an approved cast with placeholder sprites and said to move it, not replace it. Swapping would change the approved UI and need new art. Logged as ISS-004.
- **Check-in questions unchanged.** The three approved questions are reflection prompts (no advice, diagnosis or score), so they were kept word for word.
- **Real mode is a stub.** With mock off and a key set, routes return 503 "not connected yet". Nothing calls api.meta.ai; `grep meta.ai src` is empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `src/lib/format.ts` and `src/lib/models/wire.ts`**
- **Found during:** Task 2
- **Issue:** `moodWords`/`formatDay` are UI helpers, not fixtures, and the three routes share response and image code
- **Fix:** Two small modules outside the plan's file list
- **Committed in:** dbb3848, af30ad6

**2. [Rule 2 - Missing Critical] Request validation and size limits on all routes**
- **Issue:** Public routes need to reject malformed input before it reaches a paid model in Phase 3
- **Fix:** Hand-written validators; audio capped at 4 MB (below Vercel's 4.5 MB body limit), images at 5 MB, cast at 20, panel characters at 8
- **Committed in:** 8f583ae, 781bcc8, 77b7398

### Deferred Enhancements

Logged to .planning/ISSUES.md:
- ISS-004: Starter cast has no teacher or younger sibling (discovered in Task 2)
- ISS-005: /api/panel JSON with several base64 references can exceed Vercel's 4.5 MB body limit (discovered in Task 2)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical), 2 deferred
**Impact on plan:** No scope creep; both additions support the planned routes.

## Issues Encountered
- Commit `dbb3848` also picked up the deletion of `src/lib/sample.ts` (staged earlier by `git rm`), so that one commit does not build on its own; `d928c35` right after it fixes the imports. Both were already pushed, so history was not rewritten.

## Verification
- `npx tsc --noEmit`, `npm run lint`, `npm run build` pass (only the known ISS-003 font warning)
- Dev server: `/api/script` returns a 4-panel script with mood; heavy and crisis hints work; `/api/transcribe` returns a mixed transcript for a multipart upload; `/api/panel` returns an SVG image, and one in about three panels comes back with a drifted character, a FIXED after image and a before image; bad input returns 400 JSON
- Every page returns 200; the month lede now says "five invented days"
- All responses carry `X-Comimo-Mode: mock`

## Next Phase Readiness
- Phase 2 can call the three routes and save results with `saveDay`/`putImage`. For base64 to Blob conversion, use `fetch("data:...")` or `Uint8Array` on the client.
- Phase 3 adds `src/lib/models/meta.ts` and replaces the stub in `getModels()`; routes do not change.
- Phase 2 day reader needs to resolve `{kind: "blob"}` refs client-side (object URLs from `getImage`).

---
*Phase: 01-foundation*
*Completed: 2026-10-30*
