---
phase: 03-meta-model-pipeline
plan: 01
subsystem: api
tags: [meta-model-api, muse-voice-transcribe, muse-spark, structured-output, web-audio, wav, rate-limit]

requires:
  - phase: 01-foundation (01-02)
    provides: ComicModels interface, mock models, /api/transcribe, /api/script, /api/panel
  - phase: 02-comic-experience (02-01)
    provides: useRecorder, ComicPipeline, progress screen
provides:
  - Server-only Meta API client (timeouts, one retry on 429/5xx honouring Retry-After, typed errors with safe public messages)
  - Per-method model sources (real transcribe and script, mock panels) reported in X-Comimo-Mode per route
  - Spending guard with per-visitor hourly limits, daily comic and image caps, a pause switch and a per-call usage meter
  - In-browser conversion of any voice note to 16 kHz mono 16-bit WAV
  - Real transcription (muse-voice-transcribe-1.0) with cast names as keywords and script-based language mix detection
  - Real comic scripts (muse-spark-1.3, strict json_schema, cast ids as enum) validated server-side with one retry
  - scripts/meta-smoke.mjs (GET /v1/models, prints ids only)
affects: [03-02-reference-sheets-and-panels, 03-03-sam-consistency, 05-01-deploy]

tech-stack:
  added: []
  patterns:
    - "Model methods switch to Meta one at a time: ComicModels.sources says which implementation answers each method"
    - "Every upstream request goes through metaFetch with onSend → meter.beforeCall(kind); image and SAM calls are counted against the daily cap per call, and a failed request is refunded only if nothing was sent"
    - "Model errors surface as MetaApiError.publicMessage; the log line carries status/type/code only, never the key or user content"
    - "Structured output: schema enums bind ids to the request's cast; rules the schema can't express are checked in code and retried once"

key-files:
  created: [src/lib/models/meta/client.ts, src/lib/models/meta/index.ts, src/lib/models/meta/transcribe.ts, src/lib/models/meta/script.ts, src/lib/models/meta/prompts.ts, src/lib/guard.ts, src/lib/audio/toWav.ts, scripts/meta-smoke.mjs]
  modified: [src/lib/models/index.ts, src/lib/models/mock.ts, src/lib/models/wire.ts, src/app/api/transcribe/route.ts, src/app/api/script/route.ts, src/app/api/panel/route.ts, src/lib/pipeline.ts, src/app/record/useRecorder.ts, src/app/record/RecordPanel.tsx]

key-decisions:
  - "Plain fetch instead of the OpenAI SDK: two endpoints, and full control of headers, retries and the meter"
  - "Convert to WAV in the pipeline's Listening step (every mode), cached for retries; raw uploads may now be up to 25 MB since only the 16 kHz WAV is sent"
  - "Visitor identity only from Vercel's platform-set X-Vercel-Forwarded-For / X-Forwarded-For when VERCEL=1; elsewhere everyone is 'local'; X-Real-IP never read"
  - "A script call is one comic for the per-visitor limit (default 5 an hour; transcribe 2x, panels 8x for retries)"
  - "Scene text in English for the illustrator; captions, dialogue, title and questions in the speaker's own language mix"
  - "reasoning_effort low, max_completion_tokens 6000, safety_identifier = hashed visitor id"

patterns-established:
  - "Pattern: real calls are tested only with invented content (macOS say voices); never real diaries on free credits"

issues-created: [ISS-008]

duration: 22min
completed: 2026-10-30
---

# Phase 3 Plan 1: Real Voice and Script Summary

**Voice notes now go browser → 16 kHz WAV → Muse Voice Transcribe → Muse Spark structured comic script, behind a per-visitor and daily spending guard; panels still come from the mock**

## Performance

- **Duration:** 22 min
- **Started:** 2026-10-30T16:58:16Z
- **Completed:** 2026-10-30T17:20:00Z
- **Tasks:** 3 (plus 2 security fixes requested during review)
- **Files modified:** 17 (8 created, 9 modified)

## Accomplishments
- Meta client: Bearer key read on the server per call, 60 to 90 s timeouts, one retry on 429/5xx (Retry-After honoured up to 5 s), typed errors: 401 → "The Meta API key was rejected.", 429/503 → "The models are busy. Try again in a minute.", 402 → credits, timeouts → 504
- Guard: 5 comics per visitor per hour, daily caps (COMIMO_DAILY_COMIC_CAP 200, COMIMO_DAILY_IMAGE_CAP 300, counted per image/SAM call), COMIMO_PAUSE_GENERATION=1 kill switch, 429/503 with Retry-After. Mock calls are never limited
- Browser WAV conversion: decodeAudioData → OfflineAudioContext (1 channel, 16 kHz) → 16-bit PCM WAV; over-two-minute, undecodable and silent notes get a friendly message on the Listening step
- Transcribe: WAV header checked before any paid call; languageBias Arabic+English; cast names sent as keywords; transcript tidied; language mix detected by counting Arabic-script and Latin words
- Script: strict json_schema (safety first, 4 to 6 panels enforced in code, at most 3 characters per panel left to right, cast-id enums), speakers added to their panel, bubble direction from the first strong letter, retry once on an unusable answer, usage and cost logged per attempt

## Task Commits

1. **Task 1: Meta client, smoke test and spending guard**
   - `a043e7f` feat(03-01): add a server-only Meta API client and per-method model sources
   - `9adf90d` feat(03-01): guard real model calls with visitor limits, daily caps and a pause switch
   - `084b8fc` fix(03-01): take the visitor IP only from Vercel's platform-set headers
   - `845d1ee` fix(03-01): count upstream calls as they are sent and refund only unbilled requests
2. **Task 2: Real transcription with browser WAV conversion**
   - `2a09f04` feat(03-01): convert voice notes to 16 kHz mono WAV in the browser
   - `7e557d7` feat(03-01): transcribe voice notes with Muse Voice Transcribe
3. **Task 3: Real comic script with Muse Spark structured output**
   - `eb97c33` feat(03-01): add the comic script prompt and cast-bound JSON schema
   - `b7461fd` feat(03-01): write comic scripts with Muse Spark structured output

Each commit was pushed right after it was made.

## Files Created/Modified
- `src/lib/models/meta/client.ts` - metaFetch/metaJson/listModels, MetaApiError with publicMessage and responseStatus
- `src/lib/models/meta/index.ts` - metaModels: real transcribe and writeScript, mock drawPanel and checkConsistency
- `src/lib/models/meta/transcribe.ts` - WAV header check, POST /v1/asr/transcribe multipart, language mix detection
- `src/lib/models/meta/prompts.ts` - system prompt, cast block, scriptSchema(castIds)
- `src/lib/models/meta/script.ts` - chat completions call, validation and normalisation, one retry
- `src/lib/guard.ts` - guard(), UsageMeter, SpendCapError, guardResponse()
- `src/lib/audio/toWav.ts` - toWav(), encodeWav(), AudioConvertError
- `scripts/meta-smoke.mjs` - lists model ids for the key (free call)
- `src/lib/models/index.ts` - ComicModels.sources, ModelCallContext (visitorId, signal, meter), ModelInputError; placeholder stub removed
- `src/lib/models/wire.ts` - error mapping for ModelInputError (400), SpendCapError (503) and MetaApiError
- `src/app/api/{transcribe,script,panel}/route.ts` - guard, per-method mode header, call context, maxDuration 60 on transcribe/script, `keywords` field on transcribe
- `src/lib/pipeline.ts` - converts to WAV before upload, sends cast names as keywords
- `src/app/record/useRecorder.ts`, `RecordPanel.tsx` - 25 MB raw upload limit and copy ("up to two minutes")

## Decisions Made
- See key-decisions above. The per-method `sources` map replaces a single mode, so /api/panel honestly reports `mock` while transcribe and script report `meta`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Daily comic cap in addition to the image cap**
- **Found during:** Task 1
- **Issue:** With images still on mock, nothing capped total Spark/transcribe spend across many visitors
- **Fix:** COMIMO_DAILY_COMIC_CAP (default 200) counted on /api/script
- **Committed in:** 9adf90d

**2. [Security review] Spoofable visitor identity (requested by the coordinator)**
- **Issue:** The guard trusted the first X-Forwarded-For entry and fell back to X-Real-IP, so a visitor could rotate fake IPs
- **Fix:** Read the IP only when VERCEL=1, from X-Vercel-Forwarded-For (then X-Forwarded-For), which Vercel documents it overwrites "to prevent IP spoofing" (vercel.com/docs/headers/request-headers; VERCEL is set at runtime per the system env var docs). Anywhere else every caller is "local", so the daily caps limit. X-Real-IP is never read. No new dependency
- **Verification:** direct test: off Vercel, spoofed headers map to the same visitor; on Vercel, distinct forwarded IPs differ and X-Real-IP is ignored
- **Committed in:** 084b8fc

**3. [Security review] Refund after billable calls (requested by the coordinator)**
- **Issue:** Routes called undo() on any failure, refunding quota even after a billed upstream call (abort, timeout, later step failing)
- **Fix:** A UsageMeter goes to the model code in the call context; metaFetch calls `onSend` before every attempt, which marks the request billed and counts image/SAM calls against the daily cap one by one (SpendCapError stops the call before it is sent). Routes call `refundIfUnbilled()`, which refunds only when nothing reached Meta. drawPanel/checkConsistency also take the context so 03-02/03-03 meter their calls
- **Verification:** direct test: unbilled failure refunded, billed failure not; 4th image call with cap 3 throws SpendCapError; next panel request gets 503
- **Committed in:** 845d1ee

**4. [Rule 2 - Missing Critical] Raw upload limit raised to 25 MB**
- **Issue:** The 4 MB limit was tied to the request body; now only the converted WAV travels, so a 1-minute stereo WAV upload was wrongly refused
- **Fix:** 25 MB raw limit, server keeps 4 MB for the WAV; copy updated
- **Committed in:** 2a09f04

**5. [Rule 1 - Bug] Stray ideographic full stop in Arabic transcripts**
- **Found during:** Task 2 real call ("...حلو.。")
- **Fix:** tidy() drops 。 after punctuation (or turns it into "."), collapses double spaces
- **Committed in:** 7e557d7

### Deferred Enhancements

- ISS-008: Guard counters are in memory per server instance (Vercel instances don't share them and they reset on cold start). Decide on a shared store in 05-01.

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical), 2 security fixes from review, 1 deferred
**Impact on plan:** No scope creep; the meter is groundwork 03-02/03-03 must use for image and SAM calls.

## Real-call Results (invented content only)

Test speech from macOS `say` (Samantha for English, Majed for Arabic), converted with `afconvert` to 16 kHz mono WAV; the mixed clip joins two English and two Arabic sentences.

- **English** (10 s): word-perfect, including the cast names (Karim, Teta Samia, Mishmish); numbers as digits ("20 minutes")
- **Arabic** (11 s, Egyptian text read by an MSA voice): understandable but with slips: "الصحية" for "صحيت", "كريمة" for "كريم", "واشربنا", a dropped "ال", and a stray "。" (now tidied). Part of this is likely the TTS voice reading dialect; real Egyptian speech still needs a check with the user's own recordings
- **Mixed** (13 s): very good. English stays in Latin letters and Arabic in Arabic script, punctuation kept; language mix detected as en+ar, mixed. The `ar` hint without keywords gave almost the same text (one doubled syllable)
- **Scripts** (muse-spark-1.3, low reasoning, 7 to 18 s each): all 7 valid on the first attempt, strict schema with min/max keywords accepted
  - English light day: sunny, not heavy, no questions, 4 panels with Karim, Teta, Mishmish in the right scenes
  - Arabic light day: sunny, all Arabic, and "كريمة" was mapped to Karim
  - Mixed heavy day: stormy, heavy, 2 questions; fixture deadline day: stormy, heavy, 3 questions in Egyptian Arabic; fixture rooftop day: sunny, not heavy, code-switched dialogue kept ("every Thursday خلاص؟")
  - Questions were gentle reflection only, no advice or scores. One was forward-looking ("نفسك بكرة يكون شكله عامل إزاي؟"); in one run the model reused the two example questions from the prompt verbatim
  - Invented crisis line → safety "crisis", no panels, no questions
- **Browser flow** (production server, COMIMO_MOCK=0, headless Chrome 390x844): m4a upload → WAV in the browser → real transcribe (14 s) → real script ("Long Day, Midnight Report", stormy, 5 panels, 2 questions) → 5 mock panels → day saved in IndexedDB, routed to /day/{id} in 26 s; X-Comimo-Mode meta, meta, mock; no browser requests to other hosts; no console errors. Fake-mic recording (webm/opus) converted and was accepted by Meta (4 s); being a tone, it returned no words and the Listening step showed "Comimo couldn't hear any words…" with Try again
- **Guard in practice:** the 6th script in an hour got 429 "That's a lot of comics for one hour. Try again in 59 minutes." with Retry-After
- **Mock mode** (COMIMO_MOCK=1 from .env.local): upload and fake-mic flows both routed in about 9 s with every route reporting mock and no Meta calls

**Spend:** transcription 68 s of audio ≈ $0.0034; 7 Spark scripts ≈ $0.058 (1.2k in, 0.35k to 2.6k out each, mostly reasoning; about $0.003 to $0.012 per script); GET /v1/models free. **Total ≈ $0.06** of the $0.50 allowed. No Muse Image or SAM calls.

## Verification
- `npx tsc --noEmit`, `npm run lint`, `npm run build` pass (only the known ISS-003 font warning)
- `node scripts/meta-smoke.mjs` lists 9 models including muse-spark-1.3, muse-image-1.0, muse-voice-transcribe-1.0, sam-3.1 (also muse-spark-1.1/1.2, the contributor ids and muse-wonder-1.0; no hackathon-specific ids)
- Non-WAV audio to the real transcriber returns 400 before any Meta call

## Issues Encountered
- A `next dev` server for this project was already running on port 3000 (not started by this run) and Next 16 refuses a second dev server in the same folder, so all checks used `next build` + `next start` on ports 3107/3108. That dev server was left untouched
- Prompt caching showed 0 cached tokens across calls; the prefix (about 1.2k tokens) may be under the cache minimum. Cheap either way

## Next Phase Readiness
- 03-02: implement drawPanel in src/lib/models/meta and flip `sources.drawPanel` to "meta"; call `context.meter.beforeCall("image")` (pass `onSend` to metaFetch) for every image request so the daily cap holds; ISS-005 (panel body size) still open
- 03-03: same with `beforeCall("sam")`
- Arabic dialect quality should be checked with the user's real voice before the demo

---
*Phase: 03-meta-model-pipeline*
*Completed: 2026-10-30*
