---
phase: 02-comic-experience
plan: 02
subsystem: ui
tags: [indexeddb, bidi, bdi, intersection-observer, container-queries, activity, css-3d, reduced-motion]

requires:
  - phase: 01-foundation (01-01)
    provides: zine tokens, .panel/.caption/.bubble primitives, art manifest, PageTurn
  - phase: 01-foundation (01-02)
    provides: Day/Panel types with consistency before/after, IndexedDB store, fixtures
  - phase: 02-comic-experience (02-01)
    provides: pipeline that saves days with blob image refs and `-before` images
provides:
  - Day reader that loads stored days from IndexedDB on the client and keeps sample days prerendered
  - Comic components in src/components/comic (Comic, Panel, Bubble, BidiText, FixedBadge, MoodBadge, FacesNote, view model)
  - splitBidiRuns/firstStrongDir in src/lib/bidi.ts (ISS-001 fix)
  - "Face fixed by SAM 3.1" toggle stamp with card flip to the before image
  - "How Comimo kept faces the same" note for checked days
affects: [02-03-checkin-safety-cast, 03-meta-model-pipeline, 04-magazine-and-art]

tech-stack:
  added: []
  patterns:
    - "PanelView view model: Day panels with names and images resolved ({kind: art, asset} or {kind: url, src}), built on the server for samples and in the browser for stored days"
    - "Mixed-language text goes through BidiText (one <bdi> per language run); base direction from the first strong letter"
    - "Scroll reveal via data-reveal on the observed grid cell; the clipped sheet is a child (IntersectionObserver ignores a target clipped by its own clip-path)"
    - "Lettering sizes in cqi against the panel (container-type: inline-size)"
    - "Modal dialogs close in a useLayoutEffect cleanup, because Next 16 hides pages with Activity instead of unmounting them"

key-files:
  created: [src/lib/bidi.ts, src/components/comic/view.ts, src/components/comic/BidiText.tsx, src/components/comic/Bubble.tsx, src/components/comic/Panel.tsx, src/components/comic/Comic.tsx, src/components/comic/FixedBadge.tsx, src/components/comic/MoodBadge.tsx, src/components/comic/FacesNote.tsx, src/components/comic/comic.module.css, src/app/day/[id]/DayView.tsx, src/app/day/[id]/DayReader.tsx]
  modified: [src/app/day/[id]/page.tsx, src/app/day/[id]/day.module.css, src/app/record/MakingComic.tsx, src/lib/models/mock.ts, src/fixtures/days.ts, src/app/page.tsx, src/app/cast/page.tsx]

key-decisions:
  - "Sample ids render DayView on the server (prerendered); every other id renders the client DayReader, which reads IndexedDB and falls back to fixtures"
  - "Bubble base direction comes from the line's first strong letter; the script's dir is only a fallback. Each run is isolated, so punctuation is right in either base"
  - "Tail side: characters are imagined left to right in characterIds order; a lone or off-panel speaker alternates sides"
  - "Reveal skips panels already on screen while server HTML hydrates (no blink) but animates them when the comic mounts on the client"
  - "Phones read one panel per row; from 48rem the first panel is wide, middle panels pair, and the last is wide when the count is even"

patterns-established:
  - "Pattern: before/after is a toggle button with aria-pressed and a stable accessible name; card flip, crossfade under reduced motion"
  - "Pattern: panels are visible by default; motion only holds back what is below the fold"

issues-created: []

duration: 21min
completed: 2026-10-30
---

# Phase 2 Plan 2: Comic Reader Summary

**Saved days now open as comics: panels ink in on a diagonal wipe as you scroll, bubbles keep Arabic and English punctuation in place, and a pink "Face fixed by SAM 3.1" stamp flips a panel to its before image**

## Performance

- **Duration:** 21 min
- **Started:** 2026-10-30T13:27:00Z
- **Completed:** 2026-10-30T13:48:00Z
- **Tasks:** 2
- **Files modified:** 19 (12 created, 7 modified)

## Accomplishments
- /day/[id] reads IndexedDB on the client for stored days (object URLs for Blobs, revoked on unmount; cast names from the store; pager to neighbouring stored days; document title set). Sample days still prerender on the server. A brand-new day from the 02-01 flow now lands on its comic, not "This day isn't on this device"
- Bubbles: speaker name, tail toward the speaker's side, base direction from the first strong letter, every language run in its own `<bdi>`. "I won't make it, مش هلحق" keeps the comma right after "it" (ISS-001 closed); home and cast bubbles use the same helper
- Reveal: panels below the fold wait, then ink in on a diagonal wipe with a sunflower halftone edge and a small camera push, then the caption tapes in and bubbles pop from their tails, staggered in reading order
- Before/after: fixed panels carry a "Face fixed by SAM 3.1" stamp; pressing it (mouse, Enter or Space) card-flips the art to the before image, which reads as a proof (pink dashed border, BEFORE tag) and back. Reduced motion gets a short crossfade
- Day-weather badge (manifest icon on a mood ring, "Day weather: Cloudy day"); "How Comimo kept faces the same" lists each fixed character with links to their panels
- Lettering (captions, bubbles, stamp) scales with the panel through container query units, so wide desktop panels don't carry tiny text

## Task Commits

1. **Task 1: Day reader from the store with bidi-safe bubbles**
   - `2c141f7` fix(02-02): isolate Arabic and English runs so punctuation stays with its words
   - `acaed61` feat(02-02): add comic panels with speaker-side bubbles, ink-in reveal and the SAM flip
   - `8b64408` feat(02-02): read saved days from IndexedDB in the day reader
2. **Task 2: Mood badge and consistency before/after**
   - `0c4de17` feat(02-02): add the day-weather badge and the faces-fixed note
   - (the stamp and flip landed with the panel in `acaed61`, since Panel renders FixedBadge)
3. **Requested fix and deviations**
   - `e694fad` fix(02-02): keep mock panel text clear of the panel number badge
   - `cf3306f` fix(02-02): close the progress dialog when Next hides the record page
   - `c0645f6` fix(02-02): isolate mixed-language runs in the home and cast bubbles

Each commit was pushed right after it was made.

## Files Created/Modified
- `src/lib/bidi.ts` - splitBidiRuns, firstStrongDir
- `src/components/comic/view.ts` - PanelView/BubbleView/FixedFace, tailSide, toPanelViews, fixedFaces
- `src/components/comic/BidiText.tsx` - one `<bdi>` per language run
- `src/components/comic/Bubble.tsx` - speech bubble with physical tail side
- `src/components/comic/Panel.tsx` - cell + sheet, flip card, caption, bubbles, stamp
- `src/components/comic/Comic.tsx` - page grid and IntersectionObserver reveal
- `src/components/comic/FixedBadge.tsx` - the SAM toggle stamp
- `src/components/comic/MoodBadge.tsx`, `FacesNote.tsx` - weather badge, faces note
- `src/components/comic/comic.module.css` - layout, reveal, flip, stamp, badge, note
- `src/app/day/[id]/page.tsx` - samples on the server, other ids to DayReader
- `src/app/day/[id]/DayView.tsx` - shared day layout, MissingDay, crisis pause note
- `src/app/day/[id]/DayReader.tsx` - IndexedDB loader with loading frames
- `src/app/day/[id]/day.module.css` - comic styles moved out; pause and loading styles
- `src/app/record/MakingComic.tsx` - dialog closes when the page is hidden
- `src/lib/models/mock.ts` - mock panel layout keeps the top-start corner clear
- `src/fixtures/days.ts` - deadline line is "I won't make it, مش هلحق"
- `src/app/page.tsx`, `src/app/cast/page.tsx` - BidiText in their bubbles

## Decisions Made
- First-strong base direction for bubbles instead of trusting the script's `dir`; it matches how the speaker started the line, and isolation makes punctuation correct either way. The fixture line's `dir` was set to match
- Crisis days get a short pause note with a findahelpline.com link until 02-03's safety card replaces it (no numbers added, per 02-03's "verify first" rule)
- The check-in shell stays as it was (02-03 wires saving); its stale "Saving arrives with on-device storage" note now says answers arrive in the next update

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Panel number badge covered the mock panel text (requested)**
- **Issue:** On the progress screen the "1" badge sat on the mock SVG's "MOCK PANEL N" label and first words. The cause was the mock art putting text in the top-start corner, where the app also places its caption box
- **Fix:** Mock SVG keeps that corner empty: scene text in the middle band, label bottom-end, FIXED stamp lower so a 2:1 crop keeps it
- **Committed in:** e694fad

**2. [Rule 1 - Bug] Day page inert after making a comic**
- **Found during:** Task 1 browser check
- **Issue:** Next 16 (cacheComponents) hides the record page with Activity instead of unmounting it, so the 02-01 progress `<dialog>` stayed open as a modal. The new day page could not be clicked or scrolled (html:has(dialog[open]) locks scroll)
- **Fix:** The dialog opens in a layout effect and closes in its cleanup; returning to /record after a finished run drops the progress screen instead of routing again
- **Committed in:** cf3306f

**3. [Rule 1 - Bug] Reveal never fired and hid panels from clicks**
- **Found during:** Task 1 browser check
- **Issue:** IntersectionObserver in Chrome measures the target through its own clip-path, so a fully clipped panel never intersects (and clipped areas take no clicks)
- **Fix:** The observed `<li>` cell stays unclipped; the clip and animation run on an inner sheet
- **Committed in:** acaed61 (before commit)

**4. [Rule 2 - Missing Critical] Home and cast bubbles had the same bidi problem**
- **Fix:** BidiText plus an explicit direction (with every run isolated, `plaintext` would fall back to the element's direction)
- **Committed in:** c0645f6

### Deferred Enhancements

None new. ISS-002 (placeholder label clipped) and ISS-006 (favicon 404) still stand.

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 missing critical), 0 deferred
**Impact on plan:** The dialog fix was required for the plan's own verification (a created day must render and be usable). No scope creep.

## Issues Encountered
- Panels skipped by a big jump (End key, anchor) stay held until they scroll into view; they then ink in as normal. Intended

## Verification
- `npx tsc --noEmit`, `npm run lint`, `npm run build` pass (only the known ISS-003 font warning); /day/[id] still prerenders the five sample days
- Production server with COMIMO_MOCK=1, headless Chrome over DevTools:
  - Upload a WAV, "Make my comic", routed to /day/{uuid}: comic renders (4 panels, every image loaded, 2 with before images), title, "Day weather: Cloudy day", faces note "Nour, fixed in panel 1 and panel 2"; no missing state
  - Reveal: on-screen panels play, below-fold panels wait and play when scrolled to
  - Flip: mouse click on the stamp gives face=before, aria-pressed=true, hint "Back to after"; click again returns. Tab reaches the stamp; Enter flips, Space flips back
  - Reduced motion: no panel is held; the flip switches with transform none and the before image fades in
  - ISS-001 on /day/sample-deadline: run "I won't make it," with the comma at x 174 to 178 right after "t" (ends 174), Arabic run to its right, same line
  - Unknown id still shows "This day isn't on this device"
  - Requests to meta.ai: 0. Console errors: only the favicon 404 (ISS-006)
- Screenshots: `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/02-02-day-saved-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/02-02-flip-before-phone.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/02-02-fixture-desktop-dark.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/02-02-saved-desktop-dark.png`, `/private/tmp/claude-501/-Users-khalid/ffadc688-f5fb-4cfe-a588-408a4bae3264/scratchpad/screens/02-02-progress-badge.png`

## Next Phase Readiness
- 02-03: CheckInCard and SafetyCard slot into `DayView.tsx` (the check-in shell and the crisis pause note are the places to replace). DayReader already holds the stored Day, so saving answers is `saveDay({...day, checkIn})`
- 02-03 sprites: Bubble has an `order` and the panel knows its speakers, if "talk while the bubble is on screen" is wanted in the reader
- Phase 3: real panels come in as blob refs, same as mock; the reader needs no change. Tell the image model to place characters left to right in `characterIds` order so bubble tails point at the right person

---
*Phase: 02-comic-experience*
*Completed: 2026-10-30*
