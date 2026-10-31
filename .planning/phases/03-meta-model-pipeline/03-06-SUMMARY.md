---
phase: 03-meta-model-pipeline
plan: 06
subsystem: story-and-cast
tags: [new-faces, one-off-characters, muse-spark, muse-image, sam-3.1, progress-screen]

requires:
  - phase: 03-meta-model-pipeline (03-05)
    provides: newPeople from the script, quick form and photo flow, sheets per style, name snapshots
  - phase: 03-meta-model-pipeline (03-03)
    provides: SAM location, Spark judge and redraw loop, signed sheets
provides:
  - "New faces in this story" pause in the progress screen, after the script and before any panel
  - Add to cast (typed or from a photo; sheet drawn, then drawing goes on) / Just this story (one-off) / Never ask for this name; "Skip all" keeps the rest as one-offs
  - One-off characters (oneoff:<placeholder>) in the script, names snapshot, Day.oneOffs and the faces note
  - One-offs drawn freely from the note's description in their first panel; later panels get that panel, cut down to them, as their reference; the face judge compares them against it
  - The after-comic NewPeopleCard kept only for people skipped with "Skip all"
affects: [03.2-accounts-and-cloud, 04-01-magazine, 05-01-ship]

tech-stack:
  added: []
  patterns:
    - "The script model draws new people under placeholders new1..new4 (schema enum); the browser swaps them for a cast id or a one-off id before drawing (applyFaceChoices)"
    - "PanelResponse.imageToken signs a panel with a one-off, so it can come back as their reference; the route cuts it to the one-off's SAM box (oneOff.ts)"
    - "Later panels with a one-off wait for that one-off's first panel (per-one-off promise), then draw"

key-files:
  created: [src/components/NewFacesStep.tsx, src/components/NewFacesStep.module.css, src/lib/newPeopleChoices.ts, src/lib/models/oneOff.ts]
  modified: [src/lib/newPeople.ts, src/lib/newPeople.test.ts, src/lib/types.ts, src/lib/pipeline.ts, src/lib/cast.ts, src/lib/models/index.ts, src/lib/models/mock.ts, src/lib/models/meta/prompts.ts, src/lib/models/meta/script.ts, src/lib/models/meta/image.ts, src/lib/models/meta/consistency.ts, src/app/api/panel/route.ts, src/app/record/MakingComic.tsx, src/components/NewPeopleCard.tsx, src/components/comic/view.ts, src/components/comic/FacesNote.tsx, src/components/comic/comic.module.css, "src/app/day/[id]/DayReader.tsx", src/lib/magazine/issue.ts]

key-decisions:
  - "newPeople now also lists unnamed people who play a real part (\"the cashier\"), with named:false; at most 4"
  - "Never ask for this name = a one-off in this story too, and an automatic one-off (no question) in later stories"
  - "Skip all = one-offs today, and those people are offered once after the comic (NewPeopleCard, new copy); every explicit choice is settled and never offered again"
  - "A one-off's reference is their first panel cut to their SAM box (padded 12%, WebP); the whole panel when SAM didn't find them there"
  - "One-offs are left out of the magazine's month cast (dayCastIds)"

patterns-established:
  - "Pattern: anything waiting on the user inside the pipeline is a step with status active and a state field (meeting), resolved through a public method (chooseFaces); cancel rejects it, start() asks again"

issues-created: []

duration: 1h15m
completed: 2026-10-31
---

# Phase 3 Plan 6: New Faces Before Drawing Summary

**When the script meets someone who isn't in the cast, the progress screen stops before the first panel to ask: add them to the cast, keep them just for this story, or never ask; one-offs stay the same across the comic by reusing their first panel**

## Performance

- **Duration:** about 1 h 15 min
- **Completed:** 2026-10-31
- **Tasks:** 1 (plan task) plus two fixes found in the screenshot pass
- **Files modified:** 23 (4 created, 19 modified)

## Accomplishments

- **Script:** Muse Spark lists new people with ids new1 to new4 (named people and unnamed ones who take part, like "the cashier") and uses those ids in characterIds and as speakers. The server maps a "new" person the cast already covers (missed alias) to the cast id, merges duplicates and drops unknown placeholders (unit-tested)
- **Pause:** after "Writing the script", a "New faces" step appears; the page area becomes a casting call ("Before I draw · New faces in this story", one card per person with a dashed mugshot, what the note says about their look, three choices, rubber-stamp result). The caption reads "One quick question first…". Add to cast reuses the 03-05 quick form and photo flow; the sheet draws in the comic's style while other people can still be settled; "Draw the comic" carries on, "Skip all" keeps the rest as one-offs. No panel request is made before the answer (checked: 0 /api/panel calls at the pause)
- **One-offs:** drawn freely from the note's description ("appears only in this story, no sheet; a clear, distinct character"); their first panel comes back with an imageToken; later panels wait for it, then send it (signed) with the one-off's SAM box; the route cuts it down and uploads the cut once (fileToken reused). The prompt marks it "an earlier panel" and forbids copying its background
- **Face check:** SAM looks for one-offs in every panel; Spark judges them from their second panel on, against "how they looked in an earlier panel of this comic"; the redraw prompt says the same
- **Faces note:** "compared all 9 with the cast's reference sheets (one-offs with their first panel)", plus a "1×" ticket per one-off: "One-off, drawn just for this story from your note. First seen in panel 2, which later panels copied, and Muse Spark checked them against it in 1 later panel." Practice mode lists one-offs without claiming a check
- **After the comic:** NewPeopleCard only shows people skipped with "Skip all" ("Today they were drawn just for this story."); 03-05 days keep the old behaviour

## Task Commits

1. `9854ade` feat(03-06): script puts new people in panels under placeholder ids
2. `e761170` feat(03-06): draw one-offs from their first panel and judge them against it
3. `c950520` feat(03-06): pause before drawing to ask about new faces
4. `a733a61` feat(03-06): faces note names one-offs; the magazine cast leaves them out
5. `e3feb5f` fix(03-06): settle other faces while a sheet draws; full-width quick form; one-off ticket in the faces note

Each commit was pushed right after it was made.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] Other people couldn't be settled while Omar's sheet drew** (buttons disabled) - only the footer now waits for the sheet (`e3feb5f`)
2. **[Rule 1 - Bug] The photo panel overflowed the narrow card column on phones** - the quick form spans the whole card (`e3feb5f`)

### Notes
- Commit 1 also carries the one-off panel, judge and redraw prompt wording (same file as the script prompt)
- API route edits kept small: /api/panel parses `oneOff`/`box`, cuts one-offs (one call) and returns `imageToken`; /api/script unchanged; guard.ts and Nav untouched
- Practice mode "hears" Omar, the cashier and Salma in a note, so the step can be tried without credits

## Real-call Result (invented note)

Typed note (Zine, Both): walking to the corner shop with Omar; the cashier (older man, grey moustache, green apron) says the card machine is broken and "Take your time, young man"; Omar drops a coin under the fridge.

- Paused 9.7 s after start with Omar and the cashier, 0 panels requested
- Omar added from a description ("young man with short curly black hair, round glasses, a red cap and a mustard hoodie"): sheet 25.7 s, sprite drawn in the background
- The cashier kept as a one-off: first drawn in panel 2 from the note's look; panel 3 waited for it and drew him the same (grey hair, glasses, moustache, navy shirt, green apron); he speaks "Take your time, young man." under his one-off id
- SAM found 10 of 10; Spark judged 9 (the cashier in panel 3 against panel 2); no drift, no redraws
- "Coins Under the Fridge", 5 panels, 136 s in all

**Spend:** about $0.27 (script $0.013, Omar's sheet and 5 sprite poses, 5 panels, 20 SAM calls about $0.05, 5 judges about $0.05). Total project spend about $3.17.

## Verification

- `npx tsc --noEmit`, `npx eslint src`, `npm test` (62 tests, 4 new: placeholder resolution, face choices, remap), `next build` in the scratch copy pass
- Screenshots (headless Chrome, 390 px at 2x and 1280 px), `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/`:
  - Real: `03-06-real-ask-phone.png`, `03-06-real-form-phone.png`, `03-06-real-drawing-sheet-phone.png`, `03-06-real-settled-phone.png`, `03-06-real-progress-phone.png`, `03-06-real-day-phone.png`, `03-06-real-faces-note-phone.png`, `03-06-real-day-desktop.png`, `03-06-real-faces-note-desktop.png`
  - Practice mode: `03-06-mock-{ask,form,drawing-sheet,settled,progress,day,faces-note}-{phone,desktop}.png`
- Panels and Omar's sheet: `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/art/03-06-real/`

## Next Phase Readiness

- Phase 3 complete. Next: 03.2 (accounts and cloud): Day.oneOffs and the placeholder-free script sync like any other day field
- ISS-008 still applies: one-off references add no image calls, but each one-off adds a SAM call per panel

---
*Phase: 03-meta-model-pipeline*
*Completed: 2026-10-31*
