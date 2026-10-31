---
phase: 03-meta-model-pipeline
plan: 02
subsystem: api
tags: [muse-image, files-api, reference-sheets, art-styles, hmac]

requires:
  - phase: 03-meta-model-pipeline
    provides: Meta client and spending guard (03-01)
provides:
  - Reference sheets per character per art style, uploaded once to the Files API
  - Panels drawn from sheets via /v1/images/edits (1 to 3 references, left-to-right order)
  - Art-style registry with Zine and Painterly; style picked per comic
  - Server-signed sheet and file tokens; uploads metered
affects: [03-03, 03-04, 03-05, 03.1-design-refresh, 04-magazine-and-art]

tech-stack:
  added: []
  patterns:
    - "Every Muse Image call goes through metaFetch onSend -> meter.beforeCall"
    - "Only server-generated or shipped sheets can be uploaded (HMAC sheetToken / hash allowlist)"

key-files:
  created: [src/lib/artStyles.ts, src/lib/models/meta/image.ts, src/lib/models/fileTokens.ts, src/app/api/character/route.ts, src/lib/wireImage.ts, public/art/cast/*-sheet.webp, public/art/cast/*-sheet-painterly.webp]
  modified: [src/lib/models/meta/prompts.ts, src/app/api/panel/route.ts, src/lib/guard.ts, src/lib/pipeline.ts, src/lib/cast.ts, src/lib/types.ts, src/app/cast/CastEditor.tsx, src/app/record/RecordPanel.tsx]

key-decisions:
  - "Painterly theme added at the user's request (reference PDF); lighting follows the scene's time of day"
  - "Panels 2:1 when wide, 3:2 otherwise (to be replaced by slot aspect ratios in 03-04)"
  - "Top third of each panel left empty for bubbles"

issues-created: [ISS-009, ISS-010]

duration: 75min
completed: 2026-10-31
---

# Phase 3 Plan 2: Reference Sheets, Real Panels and the Painterly Theme Summary

**Muse Image reference sheets for the cast in two themes (Zine, Painterly), panels drawn from those sheets with strong face consistency, Files API caching, and hardened upload security**

## Accomplishments
- 8 starter sheets (4 characters x 2 themes) shipped in the repo; consistency across panels is strong in both themes
- Style picker on the record review step; style stored on each Day
- Security: only server-made or shipped sheets are uploadable, magic-byte checks, uploads metered and capped

## Task Commits
1. **Task 1: Reference sheets** - `b78111d`, `336f155`, `6a57cd5`, `7981bd9`, `a7f025e`
2. **Task 2: Panels from sheets** - `d529185`, `4fad347`, `d8823d8`, `008dfd0`, `020e525`
3. **Extras:** `5c69a8a` (check-in prompt), `7d08f97` (security), `872e560` (mock consistency on real panels), `cb9a626`, `92480e4` (art styles), `f280c30` (issues)
4. **Task 3: User check** - user reviewed both themes and asked for storytelling modes, name-based cast reuse and a design refresh (planned as 03-05 and 03.1); no style changes requested

## Spend
About $0.42 (8 sheets plus 6 comics). Remaining credits about $149.50.

## Deviations from Plan
- [User request] Painterly art style and per-style sheets
- [Security review] Upload restriction and metering
- Panel aspect 2:1 / 3:2 instead of square to fit the reader frames

## Issues Encountered
- Karim's Painterly sheet hit content_policy_violation once; succeeded on retry
- Two network drops of the builder; resumed without loss

## Next Phase Readiness
- ISS-009 (bubbles cover faces / side cropping on phones) handled by 03-04 layouts
- ISS-010 (SAM copy shows while check is mock) handled by 03-03

---
*Phase: 03-meta-model-pipeline*
*Completed: 2026-10-31*
