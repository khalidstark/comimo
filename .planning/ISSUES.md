# Deferred Issues

## Open

### ISS-001: Mixed Arabic/English bubble text misplaces punctuation
- **Found:** Phase 1, plan 01-01 (design screenshots)
- **Detail:** "I won't make it ,مش هلحق" renders the comma on the wrong side. Needs per-run bidi isolation (`<bdi>` or unicode-bidi: isolate per language run) in speech bubbles.
- **Address in:** 02-02 (comic reader bubbles)

### ISS-002: "placeholder" label clipped on small panel SVGs
- **Found:** Phase 1, plan 01-01
- **Detail:** Cosmetic; art is replaced in Phase 4.

### ISS-003: Font override warning for Playpen Sans Arabic at build
- **Found:** Phase 1, plan 01-01
- **Detail:** Harmless build warning; no visible effect.

### ISS-004: Starter cast has no teacher or younger sibling
- **Found:** Phase 1, plan 01-02
- **Detail:** 01-02 planned a cast of You, best friend, teacher and younger sibling. The approved 01-01 cast (Nour, Karim, Teta Samia, Mishmish) was kept so the UI and placeholder sprites stay as approved. `CharacterRole` already includes `teacher`. Decide whether to add or swap members before the Phase 4 art run.
- **Address in:** 04-02 (art and sample days), or earlier if the user wants it

### ISS-005: /api/panel body can exceed Vercel's 4.5 MB limit
- **Found:** Phase 1, plan 01-02
- **Detail:** References travel as base64 JSON (up to 8 characters, 5 MB each). Real reference sheets for 3+ characters can pass 4.5 MB. Options: compress or downscale references client-side, or cache reference sheets server-side by id.
- **Address in:** 03-02 (reference sheets and panel generation)

## Closed

None yet.
