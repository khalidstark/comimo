# Phase 3 Discovery: Meta Model API

Researched 2026-10-30 from public docs only (no calls to api.meta.ai). Every page below has a Markdown export at the same URL plus `.md`, and `https://dev.meta.ai/llms.txt` indexes them all.
Legend: **[doc]** = stated in the cited page; **[inf]** = my inference, verify with a real call.

## 0. Shared facts

| Fact | Value | Source |
|---|---|---|
| Base URL | `https://api.meta.ai/v1`, OpenAI SDK compatible (also Anthropic SDK) **[doc]** | /docs/authentication |
| Auth | `Authorization: Bearer $MODEL_API_KEY`; keys look like `LLM_<id>_<secret>`; SDKs do not auto-read `MODEL_API_KEY`, so pass it explicitly **[doc]** | /docs/authentication |
| 401 | `{type:"authentication_error", code:"invalid_api_key"}` for missing, malformed or revoked key **[doc]** | /docs/error-handling |
| 402 | `billing_error` / `billing_not_configured` when the balance is short **[doc]** | /docs/error-handling |
| 404 | unknown path returns an empty body; unknown model or no model access returns `code:"model_not_found"` **[doc]** | /docs/error-handling, /docs/sam/segmenting |
| Body limits | inline files (base64 or URL) max 50 MB; Files API max 1 GiB per file, 100 GiB per team; `background:true` bodies max 1 MiB; a `store:true` Responses call whose inline media is about 16 MB or more returns 413 (use `file_id` or `store:false`) **[doc]** | /docs/file-handling, /docs/error-handling |
| Rate limits | per team, not per key. Spark 3,000 RPM / 4M TPM; Spark contributor 150 RPM; `muse-image-1.0` 150 RPM; `sam-3.1` 3,000 RPM; Voice: 256 concurrent streams, 16,000 streams/hour. 429 carries `Retry-After` **[doc]** | /docs/pricing-rate-limits |
| Model list | `GET /v1/models` returns the models enabled for the team **[doc]** | /docs/models |

**Hackathon notes:** no `-1026` model ids, hackathon page or free-credit terms exist anywhere in the public docs, llms.txt or the cookbook repo (searched 2026-10-30). The only documented data-use switch is **Contributor mode** (`muse-spark-1.3-contributor`, 12x to 20x cheaper, but Meta may train on prompts and outputs) **[doc]** /docs/pricing-rate-limits. Comimo sends personal voice diaries, so use Standard ids unless the hackathon credit terms say otherwise. Check `GET /v1/models` once the credits land to see whether hackathon ids exist **[inf]**.

## 1. Muse Voice Transcribe

- **Model id:** `muse-voice-transcribe-1.0` **[doc]** /docs/models
- **File endpoint:** `POST /v1/asr/transcribe`, `multipart/form-data` with two parts: `request` (JSON, `application/json`) and `audio` **[doc]** /docs/api-reference/voice/transcribe
- **Realtime:** `wss://api.meta.ai/v1/asr/realtime`; auth goes in the first JSON frame (`authorization.accessToken: "Bearer …"`), not the header; raw PCM16 LE mono frames paced at real time; sessions up to 60 min **[doc]** /docs/speech-to-text
- **Audio format (file):** `audioEncoding` must be `"WAV"` (no default): RIFF/WAVE, **mono, 16-bit PCM, 16 kHz or 24 kHz** (24 kHz is native). **WebM/Opus, MP4/AAC, MP3 are rejected (400)**; the docs say to convert first (ffmpeg) **[doc]** /docs/speech-to-text, /docs/api-reference/voice/schemas
- **Limits:** max 10 minutes of audio (400), max 32 MB body (413) **[doc]** /docs/api-reference/voice/transcribe
- **Request fields:** `model`, `audioEncoding`, `mode` (`PUSH_TO_TALK` default, `ENDPOINTING`, `DIARIZATION`), `languageBias` (array of language names), `keywords` (array), `partialMode` (SSE only) **[doc]** /docs/api-reference/voice/schemas
- **Languages:** 25 incl. **Arabic and English, with code-switching**. Hint with `"languageBias": ["Arabic","English"]`; it steers, it does not force. Omit to auto-detect **[doc]** /docs/speech-to-text#language-biasing. Dialect coverage (Egyptian, Gulf) is not stated.
- **Timestamps:** turn level only (`turns[].startMs/endMs` in `ENDPOINTING`/`DIARIZATION`; empty in `PUSH_TO_TALK`). No word timestamps, no confidence **[doc]**
- **Response (JSON):** `{sessionId, transcript, audioDurationMs, turns:[{turnId,startMs,endMs,transcript,speaker?}]}`. `Accept: text/plain` or `text/event-stream` also work **[doc]**
- **Price:** $0.18 per audio hour, billed in whole seconds; failed and 429 requests are free **[doc]** /docs/pricing-rate-limits
- **Comimo implication [inf]:** MediaRecorder gives webm/opus (Chrome) or mp4/aac (Safari), so convert **in the browser**: `decodeAudioData` → `OfflineAudioContext` at 16 kHz mono → write a 16-bit WAV header. 16 kHz WAV is 32 KB/s. Vercel functions cap request bodies at about 4.5 MB (Vercel limit, not from these docs), which is about 2 min 20 s at 16 kHz. Cap recordings at 2 minutes or upload to the Files API/blob storage first.

```ts
const fd = new FormData();
fd.append("request", new Blob([JSON.stringify({
  model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK",
  languageBias: ["Arabic", "English"] })], { type: "application/json" }));
fd.append("audio", new Blob([wavBytes], { type: "audio/wav" }), "note.wav");
const r = await fetch("https://api.meta.ai/v1/asr/transcribe", {
  method: "POST", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, body: fd });
const { transcript } = await r.json();
```

## 2. Muse Spark

- **Ids:** `muse-spark-1.3` (recommended), `muse-spark-1.2`, `muse-spark-1.1`; contributor variants `-1.3-contributor`, `-1.2-contributor`. 1M context; input text, image, video, audio, PDF **[doc]** /docs/models
- **Endpoints:** `/v1/chat/completions`, `/v1/responses`, `/v1/messages` (Anthropic shape) **[doc]**
- **Structured output:** constrained decoding, guaranteed to match the schema. Chat: `response_format:{type:"json_schema", json_schema:{name, schema, strict?}}`; Responses: `text.format`. No recursive schemas; depth ≤ 10, ≤ 5,000 properties. `strict:true` needs `additionalProperties:false` and every key in `required` **[doc]** /docs/structured-output
- **Tool calling:** supported (`tools`, function `strict` flag) **[doc]** /docs/tool-calling
- **Vision:** `image_url` parts (URL or `data:` base64), up to **50 images per request**; can return boxes on a normalized 0 to 1000 grid **[doc]** /docs/image-understanding
- **Settings:** leave `temperature` at default 1.0 ("tuned to run at 1.0"); `reasoning_effort` `minimal|low|medium|high|xhigh|max` (`none` returns 400); reasoning tokens bill as output; send `safety_identifier` (≤ 64 chars) per end user **[doc]** /docs/protocols/chat-completions, /docs/reasoning
- **Audio note:** 1.3 audio input is "not fully supported"; use Voice Transcribe **[doc]** /docs/models
- **Price (Standard):** $1.25 / 1M input, $0.15 cached, $4.25 / 1M output. Contributor: $0.10 / $0.002 / $0.20 **[doc]** /docs/pricing-rate-limits
- **Comic-script settings [inf]:** `muse-spark-1.3`, `reasoning_effort:"low"` or `"medium"`, `strict:true` schema with `panels` limited to 4 to 6 items, cast ids as an `enum` built per request, keep the system prompt + cast block as a stable prefix to hit the prompt cache.

```ts
const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MODEL_API_KEY! });
const r = await client.chat.completions.create({
  model: "muse-spark-1.3", reasoning_effort: "low", safety_identifier: deviceId,
  messages: [{ role: "system", content: SYSTEM }, { role: "user", content: transcript }],
  response_format: { type: "json_schema", json_schema: { name: "comic", strict: true, schema } } });
const script = JSON.parse(r.choices[0].message.content!);
```

## 3. Muse Image

- **Id:** `muse-image-1.0`; one model for generation and editing; agentic (may web/image search, run code) **[doc]** /docs/models
- **Endpoints:** `POST /v1/images/generations` (text-to-image), `POST /v1/images/edits` (image-to-image, edit, multi-image compose), or `POST /v1/responses` (multi-turn, chain with `previous_response_id`) **[doc]** /docs/image-generation
- **Reference images:** edits take **1 to 10** images (`images:[{image_url}|{file_id}]` in JSON, or multipart `image`/`image[N]` via the SDK). Responses API takes interleaved `input_text` + `input_image` parts, several per turn **[doc]**. The Responses per-request image cap for Muse Image is not stated (vision models cap at 50) **[inf]**.
- **Character consistency:** official recipe = generate a character sheet per recurring character on a plain white background, then chain every panel turn from the anchors with `previous_response_id`, name subjects ("the hero shown earlier"), repeat style words, and compare outputs to references **[doc]** /docs/cookbook/anchored-image-series. A cookbook example builds a 6-panel comic that way and then composes and letters the page.
- **Masks / inpainting: NOT supported.** Multipart `mask` returns 400 `unsupported_parameter` (also `input_fidelity`, `partial_images`). Edits are instruction-based ("changes only what you ask for") **[doc]** /docs/image-generation#errors
- **Transparency: NOT supported.** `background` is "accepted but ignored" and the response always says `"opaque"` **[doc]** /docs/api-reference/images/schemas
- **Size:** `size:"WxH"` sets **aspect ratio only**; the generator uses its own resolution; ratios beyond 16:1 return 400. `n` 1 to 10 **[doc]**
- **Output:** `output_format` `webp` (default) / `png` / `jpeg`; images endpoints return `data[].b64_json` (default) or `data[].url` (temporary signed URL); Responses returns `output[type=image_generation_call].result` (base64) **[doc]**
- **Controls:** `reasoning_strength` `high` (default, multi-pass) or `low` (single pass, faster, same price); `tool_enablement:{enable_image_search, enable_web_search, enable_shell}` (Responses: inside `tools:[{type:"image_generation", …}]`); `temperature` affects only the planning step; unknown top-level fields (e.g. `seed`) return 400; `user` for abuse tracking. Only the `image_generation` tool is accepted **[doc]**
- **Errors:** safety block = 400 `content_policy_violation`; retryable failure = 503; `moderation` param returns 400 on this model **[doc]**
- **Price:** **$0.01 per returned image**, flat; search and reasoning included; failed or filtered images free; chained context tokens are not billed **[doc]** /docs/pricing-rate-limits

```ts
const r = await fetch("https://api.meta.ai/v1/images/edits", { method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "muse-image-1.0", n: 1, size: "1024x1024", output_format: "png",
    reasoning_strength: "high", tool_enablement: { enable_web_search: false, enable_shell: false },
    prompt: "Panel: Mona (first image) hands Omar (second image) a mug in a kitchen, flat comic style",
    images: [{ file_id: monaSheetId }, { file_id: omarSheetId }] }) });
const b64 = (await r.json()).data[0].b64_json;
```

## 4. SAM 3.1

- **Id:** `sam-3.1` (the marketing page writes `sam-3-1`; every doc and cookbook call uses `sam-3.1`) **[doc]** /docs/models, dev.meta.ai/models/sam-3-1
- **Endpoint:** `POST /v1/responses`; one user message with an `input_text` prompt + `input_image` (URL, data URL, or `file_id`) or a video file. Streaming recommended, non-streaming returns the same text **[doc]** /docs/media-segmentation, /docs/sam/segmenting
- **Prompts:** (a) a short noun phrase, **one concept per request** ("girl with red scarf" works as an attribute phrase; lists, negation and "on the left" do not); or (b) box and point prompts in a token syntax, up to 16 objects, positive and negative points, never mixed with a phrase. **No exemplar-image prompt** **[doc]**
- **Output:** special-token text in `output_text`: `<0f>id<|box;x1;y1;x2;y2;w;h[;c]|><|mask;x=0;y=0;data=H,W,~|!base85|>,…`. Boxes in source pixels; masks are base85 binary rasters (`~` lossless default, `!` one_bit via `metadata.mask_encoding:"one_bit"`); `metadata.include_confidence:"true"` adds scores. Zero matches = empty text, not an error **[doc]** /docs/sam/reading-segmentation
- **Mask placement [inf]:** in every doc example the mask H×W equals the box height×width, so the raster appears to sit at (x1,y1). Confirm with `@meta-sam/parser` overlays.
- **Parser:** `npm i @meta-sam/parser` (ESM, Node ≥ 20.17): `parseImageStream`, `decodeMaskToRaster` (Uint8Array 0/1), `decodeMaskToRLE` (COCO RLE), SVG path; `buildObjectPrompt` **[doc]** /docs/sam/client-libraries
- **Cross-image identity:** IDs are stable across **video frames only**; there is no re-identification across separate images and no embeddings endpoint **[doc + inf]**. Video input: MP4/MOV (H.264/H.265/MPEG-4), not WebM, ≤ 15,000 frames.
- **Price:** $2.50 per 1,000 images ($0.0025 each); video $0.20 per 1,000 frames, minimum 50 frames per request **[doc]** /docs/pricing-rate-limits

```ts
const r = await client.responses.create({ model: "sam-3.1", metadata: { mask_encoding: "one_bit", include_confidence: "true" },
  input: [{ type: "message", role: "user", content: [
    { type: "input_text", text: "girl with red scarf" }, { type: "input_image", image_url: panelDataUrl } ] }] });
const line = r.output_text; // parse with @meta-sam/parser or a small regex + base85 decoder
```

## 5. Muse Wonder

- `muse-wonder-1.0` is a **text LLM** (frontier coding, long-running agents, computer use; 1M context; input text, image, video, audio, PDF; **output text only**). $4 / 1M input, $20 / 1M output **[doc]** /docs/models, dev.meta.ai/models/muse-wonder
- It cannot animate a still or make frames. **No hosted Meta model outputs video** (Spark/Wonder → text, Image → image, SAM → geometry) **[doc]** /docs/models table. **Not useful for sprites or the cover animation.** It is overkill for comic scripts; Spark is 3 to 5x cheaper.
- Animation options [inf]: Muse Image sprite sheets or per-frame edits chained from one master; SAM masks for alpha cutouts (the sticker-pack cookbook does exactly this from a video, /docs/cookbook/video-to-sticker-pack); CSS/Lottie motion over stills for the monthly cover.

## Recommended pipeline for Comimo [inf unless marked]

**(a) Reference sheet.** One Responses call per character: "character sheet, front/side/back + 3 expressions, plain white background, {house style}", `size:"1536x1024"`, `output_format:"png"`. Keep the response `id` **and** upload the PNG to the Files API (`purpose:"user_data"`) to get a stable `file_id`. Also have Muse Spark write a short canonical "look card" (hair, outfit, colours, marks) stored with the character. Cost: $0.01 per try.

**(b) Panel with 1 to 3 characters.** Use `/v1/images/edits` (stateless, easy to cache) with each present character's sheet as `images[]` (≤ 3 of the 10 allowed), and a prompt naming each by image order plus their look cards, scene, camera and "no text, no speech bubbles" (letter in HTML, which keeps Arabic text crisp). Alternative from the docs: chain from the anchor turns with `previous_response_id`; better consistency per the cookbook but stateful and serial. Try both on day 1.

**(c) Drift check.** For each character in the panel: SAM 3.1 with a short noun phrase from the look card ("girl with red scarf"), one request per character, `include_confidence`; pick the highest-confidence box; crop the panel to the box (apply the mask as alpha); then Muse Spark vision with `[reference sheet, crop]` and a strict JSON schema `{same_character: boolean, mismatches: string[], score: 0-10}`. No embeddings endpoint exists, so the VLM judge is the comparison. Cheaper variant: skip SAM, give Spark the whole panel plus the sheets and ask for per-character boxes (0 to 1000 grid) and verdicts in one call; use SAM only when a pixel mask is needed (cutouts, sprites).

**(d) Redraw a drifted character.** Masked inpainting is **not available** (`mask` → 400 **[doc]**). Options in order: 1) `/v1/images/edits` with `[panel, reference sheet]` and an instruction like "redraw only the girl on the left to match the second image exactly; keep everything else unchanged" (the docs say edits keep the rest intact); 2) if the result still drifts, regenerate the whole panel with the sheet first in `images[]` plus the Spark mismatch list in the prompt; 3) a client-side composite (paste the SAM-masked redraw into the original box) only as a last resort. Cap at 2 retries per panel.

**Sprites and transparent art.** Muse Image cannot output alpha, so generate on a flat chroma background (pure #00FF00 or white), then SAM ("character") → mask → alpha PNG, or chroma-key locally. Frames: one sheet image with a fixed grid, or N edits chained from the master frame.

## Cost estimate vs the $150 budget [inf, from documented prices]

| Item | Assumption | Cost |
|---|---|---|
| Transcribe | 90 s voice note | $0.0045 |
| Script (Spark 1.3) | 4k in, 3k out incl. reasoning | ≈ $0.018 |
| 4 panels | 4 images + 1.5 average retries | $0.055 |
| SAM checks | 4 panels × 2 characters | $0.02 |
| Spark vision judge | 8 calls × (≈ 4k in incl. 2 images, 300 out); image token cost not documented | ≈ $0.05 |
| **One 4-panel comic** | | **≈ $0.15 (≈ $0.08 without the SAM + judge loop)** |
| New character sheet | 2 tries | $0.02 |
| 40 site art pieces | 3 tries each = 120 images | $1.20 |
| 5 sprite sheets | 6 tries each = 30 images + 30 SAM cutouts | $0.38 |
| **Site art total** | | **≈ $1.60** |

So $150 covers about 900 comics after the art. The real budget risk is **public visitors** (150 RPM image cap, unbounded spend): keep the per-visitor and daily caps from PROJECT.md and cache every image by hash.

## Open questions only a real call can answer

1. Does `GET /v1/models` on the hackathon team list extra ids (e.g. `-1026`)? What are the credit's data-use terms?
2. Actual Muse Image output resolution per `size`, and latency for `reasoning_strength` high vs low.
3. Does `/v1/images/edits` with 2 to 3 character sheets hold identity as well as `previous_response_id` chaining?
4. Do instruction edits truly keep the rest of a panel pixel-stable when redrawing one character?
5. SAM on stylized comic art: does "girl with red scarf" separate two similar characters? Is the mask origin at (x1,y1)?
6. Transcription quality on Egyptian Arabic with English code-switching, and which script it uses for English words.
7. Image token cost when sending reference sheets to Spark vision (the `usage` field will show it).
8. Max prompt length on `/v1/images/*` ("over-long" returns 400 but no number is given).
