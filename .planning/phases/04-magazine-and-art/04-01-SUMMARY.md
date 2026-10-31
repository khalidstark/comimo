---
phase: 04-magazine-and-art
plan: 01
subsystem: magazine
tags: [css-3d, page-curl, muse-spark, muse-image, indexeddb, print]

requires:
  - phase: 03-meta-model-pipeline
    provides: multi-page comics (Day.pages), the comic page renderer, the guard and usage meter, bounded request bodies
  - phase: 03.1-design-refresh
    provides: the refreshed zine design language and site art
provides:
  - /month as a comic magazine reader (cover, contents, the month's weather, comic spreads, next issue, back cover)
  - Bending CSS 3D page turn with drag, edge clicks, keys, scrubber; reduced motion slides
  - Month switcher over every month kept on the device, plus the sample issue
  - POST /api/cover (Muse Spark concept and cover line, Muse Image art from the main cast's sheets), cached per month on the device
  - /month/print (every page on A4 for print or PDF) and "Save cover as image" (canvas PNG)
affects: [04-02, 05-ship]

tech-stack:
  added: []
  patterns:
    - "Issue layout is pure (src/lib/magazine/issue.ts): inside pages always even, so covers sit alone"
    - "Turning leaf = N sibling strips per face placed with JS (no nested 3D, so each strip can clip)"
    - "Desktop magazine pages set the designed comic at 672px and scale it to fit; phones keep the phone layout"

key-files:
  created:
    - src/lib/magazine/issue.ts, issue.test.ts, build.ts, load.ts, sample.ts, coverStore.ts
    - src/components/magazine/FlipBook.tsx, flip.module.css, IssuePages.tsx, magazine.module.css, Magazine.tsx, reader.module.css, saveCover.ts, PrintIssue.tsx, print.module.css
    - src/lib/models/meta/cover.ts, src/app/api/cover/route.ts, src/app/month/print/page.tsx
    - public/art/site/cover-sample-2026-10.webp
  modified:
    - src/app/month/page.tsx, month.module.css, src/lib/guard.ts ("cover" action), src/lib/types.ts (CoverRequest/Response), src/art/manifest.ts (month.sampleCover)

key-decisions:
  - "Pages reuse <Comic> (ComicBook's page renderer) with `still`; no fork of src/components/comic"
  - "Paper stays paper in dark mode: pages pin their own ink colours, only the desk darkens"
  - "Covers are drawn only on an explicit button press (never on page view) to protect credits"
  - "Back cover words: counts of days, weather and who was there; the narrator is left out of the 'was in' line"

issues-created: []

duration: 30 min
completed: 2026-10-31
---

# Phase 4 Plan 1: Monthly Magazine Summary

**The month reads like a real comic magazine: a Muse-drawn cover starring the month's cast, contents, the month's weather, every comic page as spreads, and a back cover with the month in words, turned with a bending 3D page curl**

## Performance
- Started 10:58, completed 11:28 (2026-10-31); 6 commits; 2 tasks

## Accomplishments
- Magazine reader on /month: two-page spreads on desktop (closed covers centred), one page at a time on phones; drag a page and it follows the finger and settles or springs back; click a page edge, arrow keys / Page Up/Down / Home / End, Back and Turn buttons and a bookmark-ribbon scrubber with spoken page labels
- Works with the sample issue (server-rendered) and every month in IndexedDB, single- and multi-page comics, Zine and Painterly (painterly pages print on black)
- Real cover for the sample issue drawn through the new route: "Tea, cake, and one missing bus!" with Nour, Teta Samia and Karim on the rooftop (the bus in the distance)
- Print route lays the whole issue out on A4 (12 pages for a 5-day month; PDF checked headless), Save cover as image composes the cover on a canvas

## Spend
One cover: concept ~$0.004 + image $0.01, about $0.014 (dev server capped at 3 image calls).

## Deviations from Plan
- [Rule 2] Contents run onto more pages after 9 days; a "next issue" page keeps the back cover alone when the inside would be odd
- Mood strip lives on the cover's spine and on a dedicated "The month's weather" page (MoodCalendar) rather than the contents page
- Sample days are all single-page, so multi-page screenshots used invented days seeded into IndexedDB with the demo panel art (not committed)

## Issues Encountered
- Shared shadow tokens are resolved at :root (pink in dark mode); pages override --shadow-panel/--shadow-small too
- Panel lettering fit measures getBoundingClientRect, so on scaled desktop pages it may take its last shrink step one step early (cosmetic)

## Next Step
Ready for 04-02
