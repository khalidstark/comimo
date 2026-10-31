---
phase: 03-meta-model-pipeline
plan: 04
subsystem: ui
tags: [page-layout, manga, clip-path, container-queries, muse-image, muse-spark, vitest]

requires:
  - phase: 03-meta-model-pipeline (03-01)
    provides: Muse Spark structured script, metaFetch with the usage meter
  - phase: 03-meta-model-pipeline (03-02)
    provides: panels drawn from reference sheets, art styles (Zine, Painterly)
  - phase: 02-comic-experience (02-01, 02-02)
    provides: ComicPipeline and progress screen, comic reader with reveal and SAM flip
provides:
  - Shots (establishing, wide, medium, closeup, detail, splash), beats and emphasis in every script panel; exactly one splash
  - 13 hand-designed page templates (4, 5, 6 panels) with movable hero bands, slanted gutters, insets and bleeds
  - pickLayout (story-driven, deterministic per day, never repeats the previous day's template) and layoutChain for old days
  - Phone pages derived from the same template (justified rows that keep each image's aspect, splash edge to edge)
  - Lettering zones per panel, sized from its own text, sent to Muse Image as space to leave empty
  - Panels drawn at their slot's aspect ratio (nearest of 15 standard sizes)
  - Reader and progress screen render the final page (server-renderable CSS variables + container query)
affects: [03-05 (narrated captions use the caption zone), 04-01 (magazine pages can reuse pageView), 03.1-design-refresh]

tech-stack:
  added: [vitest 4.1.11 (dev)]
  patterns:
    - "A page is 12 units wide; panels are quads cut by gutter lines; insetQuad opens gutters and margins"
    - "pageView() emits --p-* (phone) and --d-* (desktop) CSS variables per panel; page.module.css switches them with @container comic-page (min-width: 40rem)"
    - "Lettering sizes in CSS and the zone estimator in lettering.ts mirror each other (same clamp formulas)"
    - "The layout is chosen before drawing and stored on the Day; each panel stores the frame it was drawn for"

key-files:
  created: [src/lib/layout/geometry.ts, src/lib/layout/templates.ts, src/lib/layout/page.ts, src/lib/layout/pickLayout.ts, src/lib/layout/frames.ts, src/lib/layout/lettering.ts, src/lib/layout/pickLayout.test.ts, src/components/comic/pageView.ts, src/components/comic/page.module.css, src/components/comic/SlotOutline.tsx, vitest.config.ts]
  modified: [src/lib/types.ts, src/lib/models/meta/prompts.ts, src/lib/models/meta/script.ts, src/lib/models/meta/image.ts, src/lib/models/index.ts, src/lib/models/mock.ts, src/app/api/panel/route.ts, src/lib/pipeline.ts, src/components/comic/Comic.tsx, src/components/comic/Panel.tsx, src/components/comic/comic.module.css, src/app/day/[id]/DayView.tsx, src/app/day/[id]/DayReader.tsx, src/app/day/[id]/page.tsx, src/app/record/MakingComic.tsx, src/app/record/making.module.css, src/fixtures/days.ts, package.json]

key-decisions:
  - "Templates have variants per splash position (the hero band moves); every (count, splash index) pair has at least two templates, so 'never repeat yesterday' and 'splash is biggest' always both hold"
  - "Phone pages reuse each panel's drawn aspect ratio (no crop): splash alone and edge to edge, small beats in rows of 2 or 3, wordy panels alone; a lone small panel is narrowed and set to one side so the splash stays dominant"
  - "Lettering zone: a top band, or a left/right column for 2:1 and wider strips; at most 44% of the panel; an inset's corner is folded into the hero's band"
  - "In wide panels two bubbles share a row (first speaker left, or right and higher when they stand the other way round), which keeps the empty band thin"
  - "Gutters: white paper with navy ink lines (Zine), near-black with no lines (Painterly); insets carry an ink or cream line and a shadow"
  - "Caption boxes pinned to the panel's corner; Painterly captions are plain white boxes like the reference PDF"

patterns-established:
  - "Pattern: geometry and zones are pure functions shared by server (draw sizes, prompts) and browser (rendering)"
  - "Pattern: unit tests for layout invariants (coverage, splash dominance on both pages, lean angles, determinism, no repeat)"

issues-created: []

duration: 3h45m
completed: 2026-10-31
---

# Phase 3 Plan 4: Dynamic Page Layouts Summary

**Comic pages are now laid out like real manga or graphic-novel pages: a story-chosen template with a dominant splash, slanted gutters, insets and bleeds, panels drawn at their slot's shape with the lettering space left empty, and a phone page that keeps the rhythm**

## Performance

- **Duration:** about 3 h 45 min
- **Started:** 2026-10-31T03:45Z
- **Completed:** 2026-10-31T07:40Z
- **Tasks:** 2 (plus one review-and-fix round on the real comics)
- **Files modified:** 29 (11 created, 18 modified)

## Accomplishments

- Muse Spark now returns a shot, a beat and an emphasis flag for every panel; the server keeps exactly one splash (the climax, else an emphasised panel, else the second to last)
- 13 templates, each with 1 to 4 variants: Opening vista, The turn, Hero with an inset, Tall column (4, 5 and 6 panels), Staircase (5), Beat by beat (6). Gutters lean 3 to 8 degrees or stay straight; the splash is at least 1.25x the next panel on desktop and phone (unit-tested; in the real comics 1.8x to 8x)
- pickLayout scores templates by shot fit (establishing to wide slots, close-ups and details to small slots and insets, emphasis to big slots), is deterministic per day id, never reuses the previous day's template, and falls back to a safe page for other counts. Saved days without a layout get one on read via layoutChain
- The pipeline picks the layout right after the script, computes each panel's frame (aspect, lettering zone, covered corner and its size) and stores both on the Day; /api/panel validates the frame and Muse Image is asked for the slot's size plus framing from the shot ("close-up: one face fills the frame") and the zone to keep empty
- Reader: absolutely positioned slots with clip-path shapes, constant-width SVG ink lines, insets with shadows, bleeds, captions pinned to the corner, bubbles in the zone; ink-in reveal and SAM flip work on the shapes; reduced motion holds no panel and the flip is a crossfade; no horizontal scroll at 390 px
- Progress screen fills the same page (a sketch page before the script, then the real layout) in both themes

## Page templates

- `vista-4` Opening vista: big establishing splash over three beats, or three beats then the payoff (splash 0, 3)
- `turn-4` The turn: strip, splash across the page, pair; or pair, splash, closing strip (1, 2)
- `inset-4` Hero with an inset: reaction close-up over the hero's corner (2, 3)
- `column-4` Tall column: tall splash with two stacked beats beside it (0, 1)
- `vista-5` Opening vista: splash over two pairs, or two pairs then the splash (0, 4)
- `turn-5` The turn: strip, splash, three beats; or pair, splash, pair (1, 2)
- `inset-5` Hero with an inset: inset bottom-right of, or top-left over, the hero (2, 3, 4)
- `column-5` Tall column: tall splash beside a stack (0, 1)
- `steps-5` Staircase: strip, pair, wide splash, strip (3)
- `vista-6` Opening vista: splash, three beats, pair; or the reverse (0, 5)
- `inset-6` Hero with an inset: four variants moving the hero and its inset (2, 3, 4, 5)
- `column-6` Tall column: tall splash with a stack beside it (0, 1, 3)
- `beats-6` Beat by beat: strips and trios around a wide splash (1, 2, 4)

## Task Commits

1. **Task 1: Shot types in the script and a layout engine**
   - `3864da3` feat(03-04): add hand-designed manga page templates and a story-driven layout engine
   - `4916d06` test(03-04): add Vitest and unit tests for page layouts
   - `0fa38a0` feat(03-04): ask Muse Spark for shots, story beats and one splash panel per comic
2. **Task 2: Draw to the slot and render dynamic pages**
   - `bd34a00` feat(03-04): pick the page layout before drawing and draw each panel for its slot's shape and lettering zone
   - `5e4f664` fix(03-04): give wordy panels their own row on phones and keep side lettering columns readable
   - `f15bf38` feat(03-04): render comic pages in their layout with slanted gutters, insets, bleeds and lettering zones
   - `ec3db09` feat(03-04): build the progress page in the comic's final layout
3. **Review round on the real comics**
   - `c843716` fix(03-04): set two bubbles side by side in wide panels so the empty band stays thin and faces stay clear
   - `9096d50` fix(03-04): keep an inset's corner inside its hero's empty band and tell Muse Image how much it covers
   - `b498aa2` fix(03-04): keep the splash clearly the biggest panel on phones
   - `55c714a` fix(03-04): keep the Drawing tag inside slanted progress panels

Each commit was pushed right after it was made.

## Decisions Made

See key-decisions above. Also: mock scripts carry the samples' shots and add one or two quiet beats (close-up, detail) by transcript hash, so mock comics come in 4, 5 and 6 panels; mock panels are drawn at the slot's aspect with the lettering zone hatched and a covered corner tinted, which makes the zones visible without credits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest 5 would not install**
- **Issue:** vitest 5.0.5 needs @types/node 22+, the project pins ^20; npm's resolver then crashed on optional peers
- **Fix:** vitest 4.1.11 (supports @types/node 20) installed with --legacy-peer-deps; `npm test` runs `vitest run`
- **Committed in:** 4916d06

**2. [Rule 2 - Missing Critical] Templates as variants per splash position**
- **Issue:** with one fixed big slot per template, 10 to 14 templates cannot put the splash in the biggest slot for every position and also avoid yesterday's template
- **Fix:** each template moves its hero band to 1 to 4 splash positions (hand-designed variants); coverage of at least two templates per (count, splash) is a unit test
- **Committed in:** 3864da3

**3. [Rule 1 - Bug] Review of the real comics (fix once, as asked)**
- Stacked bubbles reached faces on a splash (zine 4-panel, phone): bubbles now share a row in wide panels, the zone asks for at most 44%
- An inset hid Teta's eyes on the Painterly 5-panel hero: the covered corner is now inside the hero's empty band and the prompt states its size
- A narrowed phone panel looked as big as the splash (Painterly 6): lone small panels now stay under 55% of the splash's area
- Committed in c843716, 9096d50, b498aa2

### Deferred Enhancements

None logged. Notes: lettering can spill across a gutter when the art model ignores the band (allowed on purpose, like comic bubbles); the eslint run on the whole folder also scans the other builder's worktree under .claude/, so lint was run on src.

---

**Total deviations:** 3 (1 blocking, 1 missing critical, 1 review round)
**Impact on plan:** No scope creep. The review fixes change how new comics are drawn; the six test comics drawn before them keep their stored zones.

## Real-call Results (invented content only)

- 7 real comics, 35 panels: one from an invented English voice note through Muse Spark (5 panels, Spark chose wide/detail/wide/medium/splash, splash last), six from invented scripts injected at /api/script in the test browser (zine 4 and 6, Painterly 4, 5, 5 and 6)
- Muse Image honoured every size: 1:1 → 1600x1600, 16:9 → 2048x1152, 3:2 → 1920x1280, 4:5 → 1408x1760, 4:3 → 1792x1344, 5:4 → 1760x1408, 2:3 → 1280x1920, 5:2 → 2480x992, 3:1 → 2736x912. 14 to 46 s per panel, all 200, no retries
- Lettering zones were respected in most panels (empty walls, sky and shadow where the caption and bubbles sit, characters on the other side of left-column zones). Muse Image does not always keep a 40%+ band empty, which led to the 44% cap and the bubble rows
- Checks on every comic, phone and desktop: no horizontal scroll, no caption or bubble outside its panel, splash the largest panel on both pages, no requests to other hosts, no console errors

**Spend:** 35 images $0.35, 1 Spark script $0.0092, 7 transcriptions $0.0044. **Total ≈ $0.364** of the $0.45 allowed.

## Verification

- `npm test` (16 tests), `npx tsc --noEmit`, `npx eslint src`, `npm run build` pass (only the known ISS-003 font warning)
- Unit tests: coverage per (count, splash), splash at least 1.25x the next panel on desktop and phone (also with wordy panels), leans 3 to 8 degrees or straight, every slot on the page, sizes vary (largest over 2x the smallest), valid layout for every count and splash position, splash in the biggest slot, deterministic, never the previous template, safe fallback, one splash after normalising, inferred shots for old days, no two days in a row share a template, frames use Muse sizes and leave zones only where there is text, inset corners inside the hero's band
- Sample days (server rendered) use inset-4, vista-4, inset-4, turn-4, inset-4: no two in a row alike
- Mock mode (COMIMO_MOCK=1): 4-, 5- and 6-panel mock comics in both styles flow and render; SAM flip toggles on a clipped panel (aria-pressed, rotateY), reduced motion holds no panel and uses no transform
- Screenshots (headless Chrome, 390 px phone at 2x and 1280 px desktop):
  - `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-zine4-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-zine4-desktop.png`
  - `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-zine-spark-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-zine-spark-desktop.png` (5 panels, real Spark script)
  - `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-zine6-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-zine6-desktop.png`
  - `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-painterly4-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-painterly4-desktop.png`
  - `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-painterly5-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-painterly5-desktop.png`, and the post-fix drawing `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-painterly5b-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-painterly5b-desktop.png`
  - `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-painterly6-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-painterly6-desktop.png`
  - Progress screens: `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-real-*-progress-phone.png`; before the review fixes: `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/03-04-prefix/`

## Issues Encountered

- The user's dev server on :3000 was left running; all checks used `next build` + `next start -p 3110`, stopped afterwards
- The full-page screenshots hide the phone's fixed bottom nav (it would otherwise cover the page in a stitched capture)

## Next Phase Readiness

- 03-05 (narrated mode): captions are already part of each panel's zone; longer first-person captions grow the zone automatically (and wordy panels get their own phone row). A narrated comic may want the caption box style per mode (Painterly white boxes already match the reference)
- 03-03 (SAM): panels are no longer 3:2; crop and mask code must use the drawn image's own size (stored as `frame.aspect`)
- ISS-009 closed (zones per slot, slot-shaped drawing, no side cropping on phones)

---
*Phase: 03-meta-model-pipeline*
*Completed: 2026-10-31*
