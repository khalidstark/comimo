# Comimo

**Talk about your day for a minute. Get it back as a comic, starring the people in your life.**

Comimo is a comic diary. You record a voice note, or type a few lines, in Arabic, English or both in one sentence. Comimo picks the moments worth drawing, writes the panels and the dialogue, and draws them with your own cast: you, your friends, your family, even the cat, each looking like themselves in every panel. At the end of the month your comics are bound into a magazine you can flip through.

Built from scratch for the Meta Global AI Developer Hackathon (October 27 to November 4, 2026). Every line of code in this repository was written during the hackathon.

## What it does

- **A comic from a voice note.** Record up to two minutes, or type it. Egyptian Arabic, English and mixed sentences all work, and the comic keeps the language you spoke. Missed a day? Make it the next morning and pick Yesterday.
- **Your cast, drawn once.** Add someone from a photo or a description. Comimo makes a reference sheet for them, and every comic draws them from that sheet.
- **You're in it.** "About you" asks for a photo, your interests and how you deal with people (sarcastic, quiet, loud, caring, and so on). That decides how you look and how you talk in your comics.
- **Clothes that change.** Change your clothes from a photo or by describing them. Attach today's photos before making a comic and Comimo finds you in them and dresses you the way you really were that day.
- **Comics that read like comics.** People who were there get short reaction lines in their own voice, but a reaction never adds an event or a fact you didn't say.
- **Faces that stay the same.** SAM 3.1 finds every person in every panel. Muse Spark compares each face with that person's sheet, and anyone who drifted is redrawn. Turn on "Show what SAM 3.1 saw" on any comic to see the boxes.
- **Diaries.** Every day keeps your daily comics. Make a diary for anything else ("Things I love", "Bad days", any name in any language) and write in it whenever you like.
- **This week's good things.** One button gathers the good moments of your week, each pinned to the panel it happened in.
- **Heavy days.** When a day sounds like a lot, a short check-in card follows the comic: a few gentle questions, no scores, no advice. A note about hurting yourself is never turned into a comic.
- **The monthly magazine.** Each month becomes an issue with a drawn cover and the month's weather on one page, readable in the browser or printed.
- **Photo albums.** Add photos to a day and share them by link or by the QR code printed on the comic's last page.
- **What it cost.** Every comic shows what its model calls cost.

## How the Meta models are used

| Model | What it does in Comimo |
|---|---|
| **Muse Voice Transcribe** | Turns the voice note into text, Arabic and English mixed. The audio is sent once and never stored. |
| **Muse Spark** (`muse-spark-1.3`) | Reads the day and writes the comic: which moments to draw, panel layout, scenes, captions, dialogue and reaction lines, the day's weather. It also describes people from photos for their sheets, judges whether each drawn face matches its sheet, rewrites a scene gently when the image model refuses it, and writes the week's good things. |
| **Muse Image** (`muse-image-1.0`) | Draws reference sheets, outfits (as edits of the sheet, so the face stays), every panel from the cast's sheets, sprites, and the magazine cover. |
| **SAM 3.1** | Finds the people in day photos to take today's clothes, and finds every person and face in every drawn panel so drifted characters can be redrawn. It also places speech bubbles away from faces. |

The pipeline for one comic:

1. Transcribe (voice notes only).
2. Find today's outfit, if photos were attached.
3. Write the script.
4. Draw the panels.
5. Check every face with SAM 3.1 and Muse Spark.
6. Redraw anyone who drifted.

Each step shows on the progress screen as it happens.

## What a comic costs

Measured on real runs, for a 5-panel comic:

| Step | Cost |
|---|---|
| Today's outfit from a photo (optional) | $0.026 |
| Script (Muse Spark) | $0.014 |
| Drawing 5 panels (Muse Image) | $0.050 |
| Face check (SAM 3.1 and Muse Spark) | $0.094 |
| **Total** | **$0.18** with a day photo, about **$0.16** without |

A voice note adds about $0.003. Setting up "About you" costs about $0.02, and each new outfit about $0.016. Every comic records its own cost. The server keeps a per-account ledger with no story text in it, and `scripts/costs-report.mjs` prints the totals.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

**Practice mode.** With `COMIMO_MOCK=1` (the default in `.env.example`), no model is called and nothing costs anything. Every step answers with sample output, so the whole app can be clicked through offline.

**Real models.** Put your Meta Model API key in `MODEL_API_KEY` and set `COMIMO_MOCK=0`.

**Local production build.** Accounts need a trusted source for the visitor's IP. Locally, start it with:

```bash
npm run build
COMIMO_TRUSTED_IP_HEADER=x-forwarded-for npm start
```

Locally, accounts, comics and images are kept under `.data/`.

## Deploy

Comimo runs on Vercel. In production it needs:

| Variable | Purpose |
|---|---|
| `MODEL_API_KEY` | Meta Model API key. |
| `COMIMO_MOCK` | `0` for real models. |
| `NEXT_PUBLIC_SITE_URL` | The public address, used in share links and QR codes. |
| `COMIMO_GUARD_SALT` | Salt for the hashed ids sent to Meta and used in rate limits. |
| `COMIMO_MAINTENANCE_SECRET` | Bearer secret for the owner's maintenance and cost endpoints. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Accounts, sessions, limits and each account's comic index. Vercel's Upstash integration sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which also work. |
| `BLOB_READ_WRITE_TOKEN` | A private Vercel Blob store for comic images and album photos. |

A spending guard limits every real model call:

- Comics per account per hour: `COMIMO_COMICS_PER_HOUR`, default 5.
- A daily ceiling for everyone: `COMIMO_DAILY_COMIC_CAP` and `COMIMO_DAILY_IMAGE_CAP`.
- A kill switch: `COMIMO_PAUSE_GENERATION=1` stops every real call.

## Tests

```bash
npm test             # Vitest: 229 tests
npx tsc --noEmit     # types
npx eslint src       # lint
```

## Project layout

| Path | What's there |
|---|---|
| `src/app/` | Pages: the landing page and signed-in home at `/`, plus `record`, `day/[id]`, `cast`, `diaries`, `month`, `album`, `welcome`, `account` and `privacy`. API routes live under `src/app/api/`. |
| `src/lib/models/meta/` | The Meta model calls (transcribe, script, image, SAM, consistency, outfit, week), their prompts and the price table. |
| `src/lib/models/mock.ts` | Practice-mode answers for every call. |
| `src/lib/pipeline.ts` | The comic pipeline, run step by step from the browser. |
| `src/lib/server/` | Accounts, sessions, the KV and Blob stores, rate limits, albums and the cost ledger. |
| `src/components/` | The comic reader, the magazine, diaries, the cast and everything else on screen. |
| `src/art/` | The art manifest and the sprite player. The site art itself was drawn with Muse Image. |
| `.planning/` | The plans and summaries the app was built from, phase by phase. |

## Privacy

The [privacy page](src/app/privacy/page.tsx) (`/privacy` in the app) lists what Comimo keeps, what it throws away, and what it never does:

- Audio is never stored.
- Photos for faces and clothes are used once and dropped.
- Album photos are re-encoded without location or camera data.
- There are no mood scores and no advice.

## Licences

Third-party packages and their licences are listed in [docs/LICENSES.md](docs/LICENSES.md).
