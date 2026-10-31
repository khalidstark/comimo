---
phase: 03-meta-model-pipeline
plan: 03
subsystem: api
tags: [sam-3.1, meta-sam-parser, muse-spark-vision, muse-image-edits, consistency, lettering, phone-layout, sharp]

requires:
  - phase: 03-meta-model-pipeline (03-01)
    provides: metaFetch, spending guard and usage meter
  - phase: 03-meta-model-pipeline (03-02)
    provides: reference sheets per style (Files API ids), panels drawn from sheets
  - phase: 03-meta-model-pipeline (03-04, 03-05)
    provides: page templates, frames per panel, multi-page comics, SAM person crop for photos
provides:
  - SAM 3.1 location of every cast member per panel (noun phrase from the look) plus person and face sweeps, parsed with @meta-sam/parser
  - Muse Spark vision judge (json_schema) of each SAM cut-out against its reference sheet
  - Redraw loop (instruction edit, then a full redraw with the differences), at most 2, before and after kept
  - Per-panel figures (boxes and heads) stored on the Day; lettering placed in free space off every head
  - Phone pages that fill the width (full-width panels and pairs, cover crop centred on the characters)
  - Desktop insets moved off a face when the hero's other corner is clearer
  - Truthful faces note and progress counts (ISS-010 closed); COMIMO_SAM_CHECK switch
  - Forgotten-speech rule in the storyteller prompt and a code check
affects: [03-06, 03.2-accounts-and-cloud, 04-01-magazine, 05-01-ship]

tech-stack:
  added: ["@meta-sam/parser@0.1.0"]
  patterns:
    - "SAM requests: one concept per request, run in parallel, store:false, metered as \"sam\", sent a 1280 px copy"
    - "Pure halves (samMatch.ts, placeLettering.ts, crop.ts) are unit-tested; server and browser share crop.ts so object-position and lettering agree"
    - "Detailed logs and review crops only with NODE_ENV development or COMIMO_SAM_DEBUG=1, never on Vercel"

key-files:
  created: [src/lib/models/meta/sam.ts, src/lib/models/meta/samMatch.ts, src/lib/models/meta/samMatch.test.ts, src/lib/models/meta/consistency.ts, src/lib/layout/crop.ts, src/lib/layout/placeLettering.ts, src/lib/layout/placeLettering.test.ts, src/lib/models/storyMode.test.ts]
  modified: [src/lib/types.ts, src/lib/models/index.ts, src/lib/models/mock.ts, src/lib/models/meta/index.ts, src/lib/models/meta/image.ts, src/lib/models/meta/prompts.ts, src/lib/models/meta/photo.ts, src/lib/models/meta/script.ts, src/lib/models/storyMode.ts, src/app/api/panel/route.ts, src/lib/pipeline.ts, src/app/record/MakingComic.tsx, src/lib/layout/page.ts, src/lib/layout/pickLayout.test.ts, src/components/comic/pageView.ts, src/components/comic/Panel.tsx, src/components/comic/Bubble.tsx, src/components/comic/FacesNote.tsx, src/components/comic/FixedBadge.tsx, src/components/comic/view.ts, src/components/comic/comic.module.css, src/components/comic/page.module.css, "src/app/day/[id]/DayReader.tsx", "src/app/day/[id]/DayView.tsx", package.json]

key-decisions:
  - "SAM noun phrase = kind of figure + ONE feature (headscarf, hair, coloured garment, glasses, facial hair); two features made SAM find nobody in tests"
  - "Heads come from a SAM \"face\" sweep (works on lying figures, cats, background faces), else from the top of the mask"
  - "Matching: greedy best-score plus improving swaps with a left-to-right order bonus; at most 12 figures and 8 characters (security review)"
  - "Judge = one Spark Responses call per panel (sheet + cut-out per character, file_id sheets work); drift needs sameCharacter false, confidence >= 0.6 and a named difference"
  - "Redraw 1 = instruction edit of the panel with the drifted sheets; redraw 2 = the whole panel again with the differences in the prompt; a redraw is kept only if no drifted character is lost and fewer are wrong"
  - "COMIMO_SAM_CHECK=0 keeps the SAM pass (lettering needs boxes) and skips judge and redraws"
  - "Phone: rows of one full-width panel or a pair, shown height 0.55 to 1.3 of width, splash at least 0.85 and edge to edge, 4 px gutters, object-position from the union of character boxes (heads when bodies don't fit)"
  - "Free lettering ranks: clear of heads first, then legible over roomy (shrinks below 0.88 only to clear a face)"

patterns-established:
  - "Pattern: anything SAM-related shown to the user is computed from what is stored on the panel (method, sam report); practice mode never says SAM"
  - "Pattern: test servers are built from a scratch copy so the user's :3000 server and its .next stay untouched"

issues-created: []

duration: 3h40m
completed: 2026-10-31
---

# Phase 3 Plan 3: SAM 3.1 Consistency and Lettering Summary

**SAM 3.1 finds every character in each panel, Muse Spark compares each cut-out with its reference sheet, Muse Image redraws drifted characters (before and after kept), and the same boxes keep bubbles off every face and steer the new full-width phone pages**

## Performance

- **Duration:** about 3 h 40 min
- **Started:** 2026-10-31T08:45Z
- **Completed:** 2026-10-31T12:25Z
- **Tasks:** 3 plan tasks plus the coordinator's phone-page redesign, two security fixes and the storyteller rule
- **Files modified:** 33 (8 created, 25 modified)

## Accomplishments

- **Detection:** per panel, in parallel: one SAM request per cast member with a phrase from their look ("woman with curly dark hair", "old woman with lilac headscarf", "man in olive bomber jacket", "orange tabby cat"), plus "person" and "face" sweeps. Masks (capped at 1024 px by the API, so stretched over the box) give clean cut-outs and head estimates. Real panels: every cast member found in the Zine and Painterly comics (15 of 15 and 8 of 8); a stray "face in the window" was not mistaken for Karim after the person-sweep weighting
- **Judge and redraw:** Spark vision via /v1/responses (store:false, json_schema, sheets by file_id). Forced drift (panel 3 of the Zine comic drawn without sheets): the judge named real differences for all three ("pale dress instead of yellow floral dress", "brown claw clip instead of pink clip", "black undershirt instead of red T-shirt"); the instruction edit was not better, the full redraw fixed Nour and was kept; the reader shows the flip and the note says two faces still differ. A natural drift also showed up in another run (Mishmish's ears)
- **Lettering:** panels with figures letter in free space: never over a padded head, an inset or the face-fix stamp, over bodies only if nothing else fits, in reading order, near the speaker with the tail under their head; shrinks step by step. Checked in headless Chrome against the stored head boxes: 0 overlaps on all real comics, phone and desktop
- **Phone pages (coordinator request):** no narrowed panels or black voids; full-width singles and filling pairs, height from slants and ratios, thin gutters, crop centred on the characters; old days keep a slice of their lettering zone and give the rest of the view to the art
- **Insets:** a desktop inset over a face moves to the hero's other corner when that covers less
- **Truthful note (ISS-010):** "SAM 3.1 found 8 faces across 5 panels; Muse Spark compared all 8 with the cast's reference sheets and nothing needed redrawing." / "SAM 3.1 found 15 faces across 6 panels; 1 was redrawn: Nour, panel 3. Muse Spark still saw 2 faces differ from the cast sheets after the redraws." Practice mode: "This comic was made in practice mode, so no model checked the faces…"; days before 03-03 get no note; the stamp says "by SAM 3.1" only on SAM-checked panels. Progress: "SAM 3.1 found 4 of 4 faces"
- **Storyteller:** the prompt names the "I don't remember what Karim said" case (nobody speaks); a code check empties the dialogue of any panel whose narration or caption says the words were forgotten (English and Egyptian Arabic, unit-tested). The Painterly test note ("I don't remember what exactly") came back with that panel silent

## Task Commits

1. **Task 1: SAM location** - `62baa48` feat, `968d5d7` fix (bounded matching, security), `ff052e3` fix (1280 px copy)
2. **Task 2: Judge and redraw** - `ebded52` feat, `6321ebd` feat (pipeline and progress counts), `bd33a22` fix (truthful note), `4193f90` fix (logs, security), `bf69526` fix (note), `4a7f6fe` fix (judge failure non-fatal)
3. **Task 3: Lettering off faces** - `01c49d4` feat, `37006c7` fix (legibility)
4. **Phone pages (coordinator)** - `1ecc368` feat (includes inset move), `f1c7dc2` fix (old-day crop)
5. **Storyteller rule** - `ed47d92` fix

Each commit was pushed right after it was made.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] Masks over 1024 px are downscaled by SAM** - raster no longer matched the box; masks are now stretched over their box (`62baa48`)
2. **[Rule 1 - Bug] Lying figures got whole-body "heads"** - added the SAM "face" sweep (`62baa48`)
3. **[Rule 1 - Bug] A judge answer cut at 2,000 tokens failed a whole panel (502, retried by the browser)** - judge failures are non-fatal, 4,000 tokens (`4a7f6fe`)
4. **[Performance] Locate took 8 to 23 s with full-size uploads** - SAM gets a 1280 px copy: 2 to 5 s (`ff052e3`)

### Coordinator requests during the plan
- Phone page redesign (full width, pairs, cover crop from boxes, thin gutters)
- Security: bounded matching (12 figures, 8 characters, greedy + swaps, 30-detection test); no names or judge text in production logs

### Deferred / notes
- The instruction edit rarely fixes three drifted characters at once; the full redraw does better. Single-character drift is the common real case
- "Faces" in the counts means cast members SAM found (one per character), not raw face detections

## Real-call Results (invented content only)

| Comic | Panels | Wall time | Notes |
|---|---|---|---|
| Zine, typed, dialogue, forced drift on panel 3 | 6 | 228 s | 15/15 found, 1 fixed by full redraw, before/after in reader |
| Painterly, typed, both | 5 | 108 s | 8/8 found, no drift, forgotten words left silent |
| Painterly, typed, both (progress counts) | 5 | 185 s | 4/4 live count; judge cut-off found and fixed |
| Practice mode | 6 | 9 s | note says practice, no SAM |

**Latency added per panel** (after the 1280 px fix, panels run two at a time): no drift 6 to 10 s (locate 2 to 5 s, 3 to 5 SAM calls in parallel; judge 4 to 7 s); each redraw adds about 45 s (edit or full draw, plus re-locate and re-judge). COMIMO_SAM_CHECK=0: about 3.7 s (SAM only).

**Spend:** about $0.80 of the $1.00 allowed: SAM about 120 calls ($0.30), Spark judges about $0.23, images 23 ($0.23), scripts $0.04, probes included. Total project spend so far about $2.90.

## Verification

- `npx tsc --noEmit`, `npx eslint src`, `npm test` (52 tests: samMatch, placeLettering, storyMode, crop and phone-fill invariants), `next build` (copy in scratchpad, only the ISS-003 font warning) pass
- Screenshots (headless Chrome, 390 px at 2x and 1280 px), `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/`:
  - (a) bubbles clear of every face in a busy panel: `03-03-zine-busy-phone.png`, `03-03-zine-busy-desktop.png`, full pages `03-03-zine-phone.png`, `03-03-zine-desktop.png`, `03-03-painterly5-desktop.png`
  - (b) real before/after flip: `03-03-zine-flip-after-phone.png`, `03-03-zine-flip-before-phone.png`, `03-03-zine-flip-after-desktop.png`, `03-03-zine-flip-before-desktop.png`
  - (c) truthful faces note: `03-03-zine-faces-note-desktop.png`, `03-03-painterly5-faces-note-desktop.png`, practice `03-03-mock-faces-note-desktop.png`; progress `03-03-short-progress-phone.png`
  - Phone pages: `03-03-phone-painterly-5-panels.png`, `03-03-phone-painterly-6-panels.png` (03-04 day, no boxes), `03-03-phone-user-story-p1.png`, `03-03-phone-user-story-p2.png`
- SAM crops for review: `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/art/sam/` (61 files, incl. box and head overlays)

## Next Phase Readiness

- Phase 3 has 03-06 (new names before drawing) left, added to the roadmap during this plan
- Magazine (04-01) can reuse figures and free lettering for its pages
- ISS-008 (in-memory guard counters) still applies to the extra SAM calls: about 4 to 5 per panel count against the daily image cap

---
*Phase: 03-meta-model-pipeline*
*Completed: 2026-10-31*
