"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/art/Icon";
import { RecordStamp } from "@/components/RecordStamp";
import type { LanguageHint } from "@/lib/types";
import { MakingComic } from "./MakingComic";
import styles from "./record.module.css";
import { MAX_RECORDING_MS, useRecorder, type Recorder, type RecorderProblem } from "./useRecorder";

const LANGUAGES = [
  { value: "auto", label: "Mixed / auto", lang: "en" },
  { value: "ar", label: "عربي", lang: "ar" },
  { value: "en", label: "English", lang: "en" },
] as const satisfies readonly { value: LanguageHint; label: string; lang: string }[];

const PROBLEM_TEXT: Record<RecorderProblem, string> = {
  denied: "Comimo can't use your microphone. Allow it in your browser's site settings, or upload a voice note instead.",
  unsupported: "This browser can't record here. Upload a voice note instead.",
  "no-mic": "No microphone found. Plug one in, or upload a voice note instead.",
  failed: "The recording didn't work. Try again, or upload a voice note.",
  "too-short": "That was very short. Tap Start and tell me a bit more.",
  "too-big": "That file is over 25 MB. Try a shorter note (up to two minutes) or a smaller format like m4a or mp3.",
  "not-audio": "That doesn't look like an audio file. Try m4a, mp3, wav, webm or ogg.",
  empty: "That file is empty. Try another one.",
};

/** Problems where the upload button becomes the main way forward. */
const MIC_BLOCKED: RecorderProblem[] = ["denied", "unsupported", "no-mic"];

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function spokenDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (rest || !minutes) parts.push(`${rest} second${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

function statusText(recorder: Recorder): string {
  const { status, problem, take, elapsedMs } = recorder;
  if (problem) return PROBLEM_TEXT[problem];
  switch (status) {
    case "requesting":
      return "Allow the microphone when your browser asks.";
    case "recording":
      return "Recording. Tap Stop when you're done.";
    case "review":
      return take?.source === "upload"
        ? `Loaded “${take.fileName ?? "your voice note"}”. Listen back, or make your comic.`
        : `Got ${spokenDuration(elapsedMs)}. Listen back, record again, or make your comic.`;
    default:
      return "Tap Start and talk for up to two minutes.";
  }
}

/**
 * Recording controls: language hint, the record stamp, review and upload.
 * "Make my comic" opens the progress screen; cancelling it comes back to the
 * review step with the same voice note.
 */
export function RecordPanel() {
  const recorder = useRecorder();
  const { status, problem, elapsedMs, take, analyser } = recorder;
  const [language, setLanguage] = useState<LanguageHint>("auto");
  const [making, setMaking] = useState<{ audio: Blob; language: LanguageHint } | null>(null);
  const legendId = useId();
  const uploadHintId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = status === "requesting" || status === "recording";
  const micBlocked = problem !== null && MIC_BLOCKED.includes(problem);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) recorder.acceptFile(file);
  }

  return (
    <div className={`panel halftone ${styles.panel}`}>
      <fieldset className={styles.languages} aria-labelledby={legendId} disabled={busy}>
        <legend id={legendId} className={styles.legend}>
          I&apos;ll be speaking
        </legend>
        <div className={styles.chips}>
          {LANGUAGES.map((option) => (
            <label key={option.value} className={styles.chip} lang={option.lang}>
              <input
                type="radio"
                name="language"
                value={option.value}
                checked={language === option.value}
                onChange={() => setLanguage(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {status === "review" && take ? (
        <div className={styles.review}>
          <p className={`caption ${styles.reviewCaption}`}>
            {take.source === "upload" ? "Your voice note" : `Your voice note, ${clock(elapsedMs)}`}
          </p>
          {/* Native controls: keyboard and screen-reader friendly out of the box. */}
          <audio className={styles.player} src={take.url} controls preload="metadata">
            Your browser can&apos;t play this voice note back, but Comimo can still use it.
          </audio>
          <div className={styles.reviewActions}>
            <button
              type="button"
              className={`btn btn--accent ${styles.make}`}
              onClick={() => setMaking({ audio: take.blob, language })}
            >
              Make my comic
            </button>
            <button type="button" className="btn btn--ghost" onClick={recorder.discard}>
              {take.source === "upload" ? "Choose another" : "Record again"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.stampArea}>
          <RecordStamp
            label={status === "recording" ? "Stop" : "Start"}
            ariaLabel={status === "recording" ? "Stop recording" : "Start recording"}
            pressed={status === "recording"}
            onClick={status === "recording" ? recorder.stop : () => void recorder.start()}
          />
          <p className={styles.timer} role="timer" aria-label={`Recorded ${clock(elapsedMs)} of ${clock(MAX_RECORDING_MS)}`}>
            <span aria-hidden="true">{clock(elapsedMs)}</span>
            <span className={styles.timerMax} aria-hidden="true">
              {" "}
              / {clock(MAX_RECORDING_MS)}
            </span>
          </p>
          {status === "recording" && analyser ? (
            <LevelMeter analyser={analyser} />
          ) : (
            <div className={styles.wave} data-live={status === "recording" || undefined} aria-hidden="true">
              {Array.from({ length: 28 }, (_, i) => (
                <span key={i} style={{ "--h": `${20 + ((i * 37) % 60)}%` } as React.CSSProperties} />
              ))}
            </div>
          )}
        </div>
      )}

      <p className={styles.status} role="status" data-problem={problem ? "" : undefined}>
        {statusText(recorder)}
      </p>

      <div className={styles.upload} data-primary={micBlocked || undefined}>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.opus,.aac"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFileChange}
        />
        <button
          type="button"
          className={`btn ${micBlocked ? "btn--ink" : "btn--ghost"}`}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-describedby={uploadHintId}
        >
          <Icon name="upload" size="1.2em" />
          Upload a voice note
        </button>
        <p id={uploadHintId} className={styles.uploadHint}>
          No mic? Any audio file up to two minutes: m4a, mp3, wav, webm or ogg.
        </p>
      </div>

      {making ? (
        <MakingComic audio={making.audio} language={making.language} onClose={() => setMaking(null)} />
      ) : null}
    </div>
  );
}

const BARS = 32;

/**
 * Live input level as a strip of ink bars that scrolls in from the end,
 * like a tape of the last few seconds. Purely visual; the timer and status
 * line carry the information for screen readers.
 */
function LevelMeter({ analyser }: { analyser: AnalyserNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const samples = new Uint8Array(analyser.fftSize);
    const levels: number[] = Array.from({ length: BARS }, () => 0);
    let frame = 0;
    let lastPush = 0;

    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      if (!canvas || !context) return;

      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const v = (sample - 128) / 128;
        sum += v * v;
      }
      // Speech RMS sits around 0.02 to 0.3; stretch it so quiet talk still shows.
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 4.5);
      if (now - lastPush > 70) {
        levels.shift();
        levels.push(level);
        lastPush = now;
      } else {
        levels[levels.length - 1] = Math.max(levels[levels.length - 1], level);
      }

      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const style = getComputedStyle(canvas);
      const ink = style.color;
      const accent = style.getPropertyValue("--accent").trim() || ink;
      const gap = 4;
      const barWidth = (width - gap * (BARS - 1)) / BARS;
      levels.forEach((value, i) => {
        const barHeight = Math.max(4, value * height);
        context.fillStyle = i === BARS - 1 ? accent : ink;
        context.globalAlpha = i === BARS - 1 ? 1 : 0.35 + 0.65 * (i / BARS);
        context.beginPath();
        context.roundRect(i * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight, 3);
        context.fill();
      });
      context.globalAlpha = 1;
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);

  return <canvas ref={canvasRef} className={styles.meter} aria-hidden="true" />;
}
