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

### ISS-007: Deleted custom character shows as an id in old comics
- **Found:** Phase 2, plan 02-03
- **Detail:** Keep a name snapshot on each panel's dialogue/characters, or a tombstone record on delete.
- **Address in:** Phase 4 polish

### ISS-008: Spending guard counters live in one server's memory
- **Found:** Phase 3, plan 03-01
- **Detail:** src/lib/guard.ts keeps per-visitor and daily counts in memory. Vercel instances don't share them and cold starts reset them, so the real ceiling is a multiple of the configured caps. Options: Vercel KV/Upstash Redis, or accept with low caps plus the Billing spend alert.
- **Address in:** 05-01 (deploy)

### ISS-009: Bubbles and captions cover faces on phones
- **Found:** Phase 3, plan 03-02 (first real comics)
- **Detail:** Panels now keep the top third empty, which works on desktop, but at 390 px the caption plus one or two bubbles cover most of a 3:2 frame, and wide 2:1 panels are cropped at the sides to 3:2, so faces end up under the lettering. A second bubble is placed lower and can cover a face on any screen. Needs reader layout work (bubble size and placement, or art crops per breakpoint), not prompts.
- **Address in:** the dynamic panel layout plan

### ISS-010: "How Comimo kept faces the same" claims SAM ran while the check is still mock
- **Found:** Phase 3, plan 03-02
- **Detail:** Real comics show "SAM 3.1 compared every face… nothing needed redrawing" although checkConsistency is still the mock (it now reports no drift for real panels). The copy becomes true in 03-03; until then real comics overstate it.
- **Address in:** 03-03

## Closed

### ISS-005: /api/panel body can exceed Vercel's 4.5 MB limit
- **Closed:** 2026-10-31, fixed in 03-02. Reference sheets are uploaded once to Meta's Files API (30-day expiry) and kept on the character as a server-signed file token per art style; panel requests carry the token instead of the image. Only a sheet without a token travels inline (Muse Image sheets are 0.1 to 0.9 MB), and an expired or unverifiable token answers 409 "stale-reference" so the browser resends the sheet once and gets a fresh token.

### ISS-001: Mixed Arabic/English bubble text misplaces punctuation
- **Closed:** 2026-10-30, fixed in 02-02. Bubbles split each line into language runs (src/lib/bidi.ts) and isolate each in a `<bdi>`; neutrals stay with the run they follow. "I won't make it, مش هلحق" now shows the comma right after "it" (checked in headless Chrome). Home and cast bubbles use the same helper.

### ISS-004: Starter cast has no teacher or younger sibling
- **Closed:** 2026-10-30, won't do. User keeps the cast as is (Nour, Karim, Teta Samia, Mishmish).

