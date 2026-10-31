---
phase: 03-meta-model-pipeline
plan: 05
subsystem: story-and-cast
tags: [muse-spark, storyteller, multi-page, flashback, aliases, sam-3.1, sharp, sprites]

requires:
  - phase: 03-meta-model-pipeline
    provides: real script and image pipeline (03-01, 03-02), page layouts (03-04)
provides:
  - Storyteller rewrite (faithful, cinematic, PDF-like narration) with Narrated / Dialogue / Both modes
  - Multi-page comics (1 to 3 pages, layout per page, page turns, swipe/keys), flashback panels, typed days, "What you said"
  - Cast by name and alias (Arabic/English), NewPeopleCard, one-time sheets per style, name snapshots (ISS-007)
  - Add a person from a photo (SAM crop, Spark vision look, Muse sheet) and generated sprite sheets for new characters
  - Bounded request bodies on every route; refunds only before decode
affects: [03-03, 04-magazine-and-art, 05-ship]

tech-stack:
  added: [sharp@0.35.5, vitest@4.1.11]
  patterns:
    - "Day.pages holds panel indexes per page; Day.panels stays flat"
    - "Every route reads bodies through a bounded stream helper (src/lib/requestBody.ts)"

key-decisions:
  - "Heavy flag only for genuinely hard days; never check-ins on sunny/rainbow days"
  - "No invented speech: silent panels over made-up lines"
  - "Photos never stored; only server-drawn sheets are signed and reusable"

issues-created: []

duration: 3h (two parallel builders)
completed: 2026-10-31
---

# Phase 3 Plan 5: Storyteller, Pages and Cast by Name Summary

**Muse Spark retells each day like a manga chapter across 1 to 3 pages with flashbacks and narration, and the cast is created once (even from a photo) and reused by name with animated sprites**

## Accomplishments
- User's own English story became a 2-page Painterly comic "Warmth and Quiet Ache" with memory panels and PDF-like narration
- Omar added from an invented photo: SAM crop, Spark description, Muse sheet, animated sprite; reused by name in the next comic
- Phone layout fixes from user feedback: insets get their own place, captions never collide, lettering shrinks to fit

## Commits
Task 1 (main): ce7d9db … b6eaabf (18 commits). Task 2 (cast-features, merged in 123989e): ed1ae1c … 86db81b (12 commits). Security fixes: f60abc7, 4d7f1b7.

## Spend
About $0.77 ($0.56 story, $0.21 cast). Total so far about $2.10.

## Deviations from Plan
- [User requests] multi-page comics, typed days, flashbacks, English-only story test, photo-based cast, sprites for new characters
- [Security review] bounded bodies on all routes; no refund after decode
- Bubble "move to next panel" last resort not built; lettering shrinks inside its own panel instead

## Issues Encountered
- Muse Image sometimes ignores the covered-corner instruction for desktop insets (fixed by SAM placement in 03-03)
- One generic invented Karim line in the user's story despite the rule; tighten in 03-03
- One content_policy refusal on a Dialogue panel; retry works

## Next Phase Readiness
- 03-03: SAM consistency loop + SAM-guided bubble placement + truthful "faces" note (ISS-010)

---
*Phase: 03-meta-model-pipeline*
*Completed: 2026-10-31*
