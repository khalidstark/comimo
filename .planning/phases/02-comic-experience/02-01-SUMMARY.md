---
phase: 02-comic-experience
plan: 01
subsystem: ui
tags: [mediarecorder, web-audio, canvas, indexeddb, dialog, usesyncexternalstore, view-transitions]

requires:
  - phase: 01-foundation (01-01)
    provides: zine design tokens, RecordStamp, PageTurn, art manifest (mascot, mood icons)
  - phase: 01-foundation (01-02)
    provides: types, IndexedDB store, /api/transcribe, /api/script, /api/panel on mock models, starter cast fixtures
provides:
  - useRecorder hook (MediaRecorder at 32 kbps, 2 minute cap, permission and file problems, upload as a take)
  - Record panel with live canvas level meter, review step (play back, record again, make my comic) and upload
  - ComicPipeline (src/lib/pipeline.ts) that resumes at the failed step, draws panels two at a time, stores image Blobs, saves the Day and reads it back
  - Full-screen "Making your comic" progress screen (modal dialog) that fills a comic page panel by panel, with the face-fix before/after flip
  - Cast seeding: the starter cast is written to the store on the first run
affects: [02-02-comic-reader, 02-03-checkin-safety-cast, 03-meta-model-pipeline]

tech-stack:
  added: []
  patterns:
    - "Pipeline as an external store: class with subscribe/getSnapshot read by useSyncExternalStore; immutable state updates"
    - "Resumable steps: every result is kept, start() skips finished work, so retry redoes only the failed step or panels"
    - "Image ids are `${dayId}-panel-${index}` and `${dayId}-panel-${index}-before` in the images store"
    - "Full-screen flows use a native <dialog> with showModal (inert page, focus return on close)"

key-files:
  created: [src/app/record/useRecorder.ts, src/lib/pipeline.ts, src/app/record/MakingComic.tsx, src/app/record/making.module.css]
  modified: [src/app/record/RecordPanel.tsx, src/app/record/record.module.css, src/app/record/page.tsx]

key-decisions:
  - "Progress screen is a modal <dialog> over the record page instead of a new route, so cancel returns to the same voice note"
  - "Face-fix reveal is presentational: /api/panel already returns before and after; the screen shows the before under a 'Fixing Karim's face' stamp, then card-flips to the after. Routing waits for every reveal to finish"
  - "Reference images are sent only when a character has a referenceSheet (stored Blob or manifest path); the starter cast has none yet, so panels go out with name and look only"
  - "Crisis scripts skip drawing, save the Day with safety 'crisis' and no panels, and route to the day page with a calm 'Let's pause here' heading"

patterns-established:
  - "Pattern: motion is wipes, stamps and flips with the site's ink easing; no fades or irises; the global reduced-motion rule makes them instant swaps"
  - "Pattern: one aria-live caption per screen; step list carries visually hidden status words"

issues-created: [ISS-006]

duration: 16min
completed: 2026-10-30
---

# Phase 2 Plan 1: Recorder and Pipeline Summary

**Record or upload a voice note, watch a comic page pencil, ink and fix itself panel by panel, and land on a Day saved in IndexedDB, all on mock models**

## Performance

- **Duration:** 16 min
- **Started:** 2026-10-30T13:11:00Z
- **Completed:** 2026-10-30T13:27:00Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- Recorder: idle, asking permission, recording (timer, canvas level meter, 2:00 cap), review (native player, record again, make my comic). Denied, missing or unsupported mic shows a clear note and promotes the upload button to the main action. Uploads over 4 MB, empty or non-audio files get a friendly message
- Pipeline: transcribe, script (with the stored cast, seeded from the starter cast on first run), panels with concurrency 2, Blobs into the images store, Day built with consistency before/after, saveDay then getDay read-back before routing to /day/[id] with the page-turn transition
- Progress screen: title strip goes from the mascot "Listening" to a "You said" bubble to the comic title and day weather; frames go from pencilled (scene in lettering) to drawing (camera push, spinning action lines) to inked (diagonal wipe); a drifted panel shows the before image under a pink "Fixing Nour's face" stamp, then flips to the fixed one; a "Done!" burst lands when everything is settled
- Cancel (or Escape) aborts in-flight requests and returns to the same voice note; errors show "Try again" on the failed step only

## Task Commits

1. **Task 1: Recorder with mic and upload**
   - `437ae17` feat(02-01): add a recorder hook for mic and uploaded voice notes
   - `d793868` feat(02-01): wire the record panel to the mic, level meter, review and upload
2. **Task 2: Comic pipeline and progress screen**
   - `19d57f4` feat(02-01): add a resumable client pipeline from voice note to saved day
   - `9ad9531` feat(02-01): add the making-your-comic progress screen
   - `2d1414d` feat(02-01): open the progress screen from the record panel's review step

Each commit was pushed right after it was made.

## Files Created/Modified
- `src/app/record/useRecorder.ts` - MediaRecorder hook (mime pick webm/mp4/ogg, 32 kbps, 2 minute cap, analyser node, file intake)
- `src/app/record/RecordPanel.tsx` - recorder UI, level meter, review, upload, opens MakingComic
- `src/app/record/record.module.css` - review, meter, problem note and upload styles
- `src/app/record/page.tsx` - removed the disabled "Upload" button and its "not connected" note from the side column
- `src/lib/pipeline.ts` - ComicPipeline, loadCast (seeds the starter cast), localIsoDate
- `src/app/record/MakingComic.tsx` - progress dialog, steps, ProgressFrame with the before/after flip
- `src/app/record/making.module.css` - sheet wipe-in, page, frames, stamps, steps

## Decisions Made
- Modal `<dialog>` instead of a separate route for progress (cancel keeps the take; focus returns to "Make my comic")
- Five visible steps: Listening, Writing the script, Drawing the panels, Checking faces, Saving to this device. Drawing and checking run together because /api/panel does both in one call
- Two minute cap as the plan says (the old shell said one minute); 2:00 at 32 kbps is about 480 KB

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale disabled upload button on the record page**
- **Found during:** Task 1
- **Issue:** The side column still had a disabled "Upload a voice note" button with "Uploads open together with recording"
- **Fix:** Removed it; the side now points to the working upload under the record button
- **Files modified:** src/app/record/page.tsx
- **Committed in:** d793868

**2. [Rule 2 - Missing Critical] Too-short and empty recordings rejected**
- **Issue:** An accidental tap would send a sub-second or empty clip to transcription
- **Fix:** Recordings under 1 s or 0 bytes return to idle with a message
- **Committed in:** 437ae17

**3. [Rule 1 - Bug] Finale showed while the last face fix was still flipping**
- **Found during:** Task 2 browser check
- **Issue:** "Your comic is ready" and the Done burst appeared over a "Fixing Nour's face" stamp, and the burst covered the comic title
- **Fix:** Finale (heading, burst, open link, routing) waits until every reveal settles; burst moved to the page's bottom corner
- **Committed in:** 9ad9531

### Deferred Enhancements

Logged to .planning/ISSUES.md:
- ISS-006: No favicon, so every page load logs a 404 for /favicon.ico (pre-existing since 01-01 removed the default icon)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical), 1 deferred
**Impact on plan:** No scope creep.

## Issues Encountered
- Headless Chrome's fake media UI always grants the mic, so the denied path was checked by stubbing getUserMedia to reject with NotAllowedError.

## Verification
- `npx tsc --noEmit`, `npm run lint`, `npm run build` pass (only the known ISS-003 font warning)
- Production server with COMIMO_MOCK=1 (X-Comimo-Mode: mock), driven over the DevTools protocol at 390x844 and 1280x860 (dark):
  - Fake mic: Start, 2 s of recording with the canvas meter, Stop gives an audio/webm Blob and the review step
  - WAV upload: "Make my comic" runs in about 9.5 s; 4 panels, 1 face fixed (Nour), day routed to /day/{uuid}
  - IndexedDB read-back: the Day has 4 panels with blob refs, 1 before image (5 images), mixed ar/en languages; cast store seeded with karim, mishmish, nour, teta
  - Injected 502 on the first /api/panel: "One panel didn't draw. Try it again." with Try again on the Drawing step; retry made exactly 1 panel call and routed
  - Injected crisis script: 0 panel calls, Day saved with safety crisis and no panels, routed
  - Denied mic: the note shows and the upload button turns ink
  - Requests to meta.ai: 0. Console errors: only the favicon 404 (ISS-006) and the injected 502
- Screenshots (phone width): `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/02-01-recorder-review.png`, `02-01-progress-drawing.png`, `02-01-progress-fixing.png`, `02-01-progress-done.png` in the same folder

## Next Phase Readiness
- 02-02: /day/[id] still renders fixtures only, so a freshly made day lands on "This day isn't on this device" until the reader loads from IndexedDB. Images are at `{kind: "blob", id: "<dayId>-panel-<n>"}`; before images at `...-before` via `consistency.beforeImage`
- 02-03: crisis days arrive with `safety: "crisis"`, `panels: []`, `title: "Today"`; heavy days carry `checkIn.questions` with empty answers
- 03-02: the pipeline already sends reference images when a character has a `referenceSheet`; ISS-005 (body size) still applies

---
*Phase: 02-comic-experience*
*Completed: 2026-10-30*
