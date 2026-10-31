# Comimo

## What This Is

Comimo (comics + memories) turns a voice note about your day, in Arabic, English or both mixed, into a short comic starring characters you create once. When the day sounds heavy, a check-in card after the comic asks a few gentle questions so you don't feel overwhelmed. At the end of the month your comics become a flip-through magazine of your own life. It's for people who want to remember their days but find journaling feels like work.

## Core Value

Talking about your day for a minute gives you back a comic that feels like your life, with the same faces in every panel. The check-in card and the monthly magazine matter just as much (the user rated all three equal for the demo).

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Record a voice note in the browser (or upload one) in Arabic, English or mixed, transcribed with Muse Voice Transcribe
- [ ] Muse Spark turns the transcript into a comic script: 4 to 6 panels, scenes, captions, dialogue, which cast members appear, and the day's mood
- [ ] Cast: create characters once (name, look, personality), each with a Muse Image reference sheet; ships with an invented starter cast
- [ ] Panels drawn with Muse Image using the reference sheets of the characters in each panel
- [ ] SAM 3.1 checks every panel, finds characters whose look drifted from their reference sheet, and redraws them; the app shows the before and after
- [ ] Long, detailed days become multi-page comics (1 to 3 pages, 4 to 6 panels each, one splash per page, page turns)
- [ ] Storytelling modes per comic: Narrated (first-person captions like the user's reference PDF), Dialogue, or Both (default)
- [ ] Cast created once and recognised by name or alias (Arabic or English); new people offered once after a comic
- [ ] Comic pages laid out like a real manga/graphic novel (varied panel sizes from shot types, splash panel, slanted gutters, insets), never equal boxes
- [ ] Comic page reader with speech bubbles that render Arabic right to left correctly
- [ ] Check-in card after the comic when Muse Spark detects a heavy or stressful day: 2 or 3 gentle reflection questions, the answers saved with that day
- [ ] Day mood shown as a small "day weather" icon on each comic, never as a number or score
- [ ] Monthly comic book: a magazine-style flip-through of the month's comics with a month-at-a-glance mood strip
- [ ] Two comic art themes: the zine style and Painterly (semi-realistic painted, cinematic moody light, per the user's reference PDF); site art, sprites, icons and textures generated with Muse Image
- [ ] Sprite sheets make the cast and mascot feel alive (idle blink, talk while their bubble appears, wave on the home page), animated with CSS steps()
- [ ] Mobile-friendly, accessible web UX: big record button, clear progress while the comic is being made, keyboard and screen-reader friendly
- [ ] Quiet guard: if a note mentions self-harm or crisis, Comimo doesn't draw a comic and shows one plain line (no safety card, per user)
- [ ] Sample days and demo content: invented scenarios, scripts for the user to record, and pre-made example comics so the site works for judges even without recording
- [ ] Deployed live URL on Vercel; public GitHub repo with a README that says everything was built during the hackathon

### Out of Scope

- Accounts and sign-in — not needed for the hackathon; data stays on the device
- Mental health score, diagnosis or advice — the hackathon bans medical/mental-health advice projects, and a number can mislead people
- Daily reminders — user excluded for v1
- Sharing to social media — user excluded for v1
- Native mobile app — not feasible in the time; the web app works on phones
- More art themes — only after the main theme is polished, if time remains
- Copying code from comicLife-main.zip — rules require new work; the zip is a reference for the logic only

## Context

- Meta Global AI Developer Hackathon, Indie Developer track, theme "Build for Your World". Solo entrant.
- Judging: Impact 30%, Use of Meta AI tooling 25% (creative, beyond a basic integration, surprising capabilities), Demo 25% (works live, impressive, video quality), Technical depth 20%.
- Meta Model API is OpenAI-compatible: base URL `https://api.meta.ai/v1`, key in `MODEL_API_KEY`, Muse Spark id `muse-spark-1.3`. Image, voice and SAM 3.1 model ids and request shapes are in the cookbook: github.com/meta-models/meta-model-cookbook.
- Prior work: `/Users/khalid/projects/comicLife-main.zip` (April 2026, Next.js + Gemini/Imagen + Supabase) has the earlier version of the story parsing and panel generation logic. Read it for ideas only.
- The user wants a far better design than the old app: interactive, sprites, generated images and icons, good UX. The user's taste: cinematic story transitions, light airy sections after the hero; avoid cheap iris/dissolve effects.
- Characters and day scenarios are invented by Claude. The user will record voice notes from scripts Claude writes.

## Constraints

- **Timeline**: submission due Wed Nov 4 2026, 9:00 PM ET (Thu 4 AM Cairo). Aim to submit Wed afternoon. Building started Oct 30.
- **Budget**: $150 Meta API credits. Image generation and SAM calls are the cost drivers; cache everything and avoid regenerating.
- **Public URL cost risk**: the live site uses the user's API key server-side; it needs per-visitor rate limits and a ceiling on daily generations so strangers can't drain the credits.
- **Rules**: public repo, all code new during the hackathon, rights to every asset, 3 minute demo showing only hackathon work.
- **Tech stack**: Next.js (App Router, TypeScript), deployed on Vercel; API key only on the server.
- **Language**: Arabic and English, including mixed sentences; right-to-left text in bubbles and UI where needed.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Check-in questions instead of a mental health score | Hackathon bans mental-health advice; still scores on Impact | — Pending |
| Check-in is a card after the comic | User's choice; keeps the comic itself light | — Pending |
| No accounts; store comics on the device (IndexedDB) | Faster to build, simpler demo, diary stays private | — Pending |
| Muse Image generates the site's own art | Avoids asset-rights problems, raises the Meta AI score, one consistent look | — Pending |
| Fresh code; old zip as reference only | Rules require new work | — Pending |
| One main art theme first | User's choice; more themes only if time allows | — Pending |
| No safety/helpline card; keep only a quiet no-comic guard for crisis notes | User asked to remove the card on 2026-10-30; the guard stops self-harm scenes being drawn | — Pending |
| Zine design direction (ink panels, halftone, riso pink/sunflower, Baloo Bhaijaan 2 + IBM Plex Sans Arabic + Playpen Sans Arabic) | Approved by user at 01-01 checkpoint | ✓ Good |
| Assets: Muse Image first, otherwise only openly licensed packs (CC0, MIT/ISC) with licenses listed in the README; never scraped images | Hackathon disqualifies assets without rights | — Pending |

---
*Last updated: 2026-10-30 after 01-01 (design approved, sprite sheets added)*
