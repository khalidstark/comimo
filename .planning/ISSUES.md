# Deferred Issues

## Open

### ISS-002: "placeholder" label clipped on small panel SVGs
- **Found:** Phase 1, plan 01-01
- **Detail:** Cosmetic; art is replaced in Phase 4.

### ISS-003: Font override warning for Playpen Sans Arabic at build
- **Found:** Phase 1, plan 01-01
- **Detail:** Harmless build warning; no visible effect.

### ISS-005: /api/panel body can exceed Vercel's 4.5 MB limit
- **Found:** Phase 1, plan 01-02
- **Detail:** References travel as base64 JSON (up to 8 characters, 5 MB each). Real reference sheets for 3+ characters can pass 4.5 MB. Options: compress or downscale references client-side, or cache reference sheets server-side by id.
- **Address in:** 03-02 (reference sheets and panel generation)

### ISS-006: No favicon, so every page load logs a 404
- **Found:** Phase 2, plan 02-01 (browser check console)
- **Detail:** 01-01 removed the default Next.js favicon and nothing replaced it. Harmless, but it is the only console error on a clean run. Add an icon through the art pipeline (app/icon) when site art is made.
- **Address in:** 04-02 (site art)

### ISS-007: Deleted custom character shows as an id in old comics
- **Found:** Phase 2, plan 02-03
- **Detail:** Keep a name snapshot on each panel's dialogue/characters, or a tombstone record on delete.
- **Address in:** Phase 4 polish

## Closed

### ISS-001: Mixed Arabic/English bubble text misplaces punctuation
- **Closed:** 2026-10-30, fixed in 02-02. Bubbles split each line into language runs (src/lib/bidi.ts) and isolate each in a `<bdi>`; neutrals stay with the run they follow. "I won't make it, مش هلحق" now shows the comma right after "it" (checked in headless Chrome). Home and cast bubbles use the same helper.

### ISS-004: Starter cast has no teacher or younger sibling
- **Closed:** 2026-10-30, won't do. User keeps the cast as is (Nour, Karim, Teta Samia, Mishmish).

