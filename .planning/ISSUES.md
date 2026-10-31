# Deferred Issues

## Open

### ISS-002: "placeholder" label clipped on small panel SVGs
- **Found:** Phase 1, plan 01-01
- **Detail:** Cosmetic; art is replaced in Phase 4.

### ISS-003: Font override warning for Playpen Sans Arabic at build
- **Found:** Phase 1, plan 01-01
- **Detail:** Harmless build warning; no visible effect.

### ISS-006: No favicon, so every page load logs a 404
- **Found:** Phase 2, plan 02-01 (browser check console)
- **Detail:** 01-01 removed the default Next.js favicon and nothing replaced it. Harmless, but it is the only console error on a clean run. Add an icon through the art pipeline (app/icon) when site art is made.
- **Address in:** 04-02 (site art)


### ISS-008: Spending guard counters live in one server's memory
- **Found:** Phase 3, plan 03-01
- **Detail:** src/lib/guard.ts keeps per-visitor and daily counts in memory. Vercel instances don't share them and cold starts reset them, so the real ceiling is a multiple of the configured caps. Options: Vercel KV/Upstash Redis, or accept with low caps plus the Billing spend alert.
- **Address in:** 05-01 (deploy)

## Closed

### ISS-010: "How Comimo kept faces the same" claimed SAM ran while the check was mock
- **Closed:** 2026-10-31, fixed in 03-03. The check is real now, and the note is built only from what each panel stores (method and SAM report): "SAM 3.1 found 15 faces across 6 panels; 1 was redrawn: Nour, panel 3." Practice-mode comics say no model checked the faces and never mention SAM; days made before 03-03 show no note; the stamp says "by SAM 3.1" only on SAM-checked panels.

### ISS-007: Deleted custom character shows as an id in old comics
- **Closed:** 2026-10-31, fixed in 03-05. Every new panel keeps a snapshot of its characters' and speakers' names (`Panel.names`); the day reader uses the current cast name, then that snapshot, then the starter cast, and shows "Someone" rather than a raw id for days made before snapshots.

### ISS-009: Bubbles and captions cover faces on phones
- **Closed:** 2026-10-31, fixed in 03-04. The page layout is picked before drawing, so every panel is drawn at its slot's aspect ratio (no side cropping: the phone page keeps each image's shape) and Muse Image is told exactly which part to leave as plain background for the lettering: a top band or a side column sized from that panel's caption and lines on the smallest page it is read on (at most 44%), with any inset corner folded into the band. Bubbles sit inside that zone (two to a row in wide panels), and wordy panels get their own row on phones. Checked on 7 real comics at 390 px and 1280 px: no lettering outside its panel; faces clear except where the art model ignored a band on the first drawings, which the 44% cap and bubble rows address.

### ISS-005: /api/panel body can exceed Vercel's 4.5 MB limit
- **Closed:** 2026-10-31, fixed in 03-02. Reference sheets are uploaded once to Meta's Files API (30-day expiry) and kept on the character as a server-signed file token per art style; panel requests carry the token instead of the image. Only a sheet without a token travels inline (Muse Image sheets are 0.1 to 0.9 MB), and an expired or unverifiable token answers 409 "stale-reference" so the browser resends the sheet once and gets a fresh token.

### ISS-001: Mixed Arabic/English bubble text misplaces punctuation
- **Closed:** 2026-10-30, fixed in 02-02. Bubbles split each line into language runs (src/lib/bidi.ts) and isolate each in a `<bdi>`; neutrals stay with the run they follow. "I won't make it, مش هلحق" now shows the comma right after "it" (checked in headless Chrome). Home and cast bubbles use the same helper.

### ISS-004: Starter cast has no teacher or younger sibling
- **Closed:** 2026-10-30, won't do. User keeps the cast as is (Nour, Karim, Teta Samia, Mishmish).

