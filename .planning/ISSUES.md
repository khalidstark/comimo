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

## Closed

None yet.
