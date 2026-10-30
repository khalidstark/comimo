"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Longest recording; the recorder stops itself here. */
export const MAX_RECORDING_MS = 120_000;
/** Same limit as /api/transcribe (kept under Vercel's 4.5 MB body limit). */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** Speech stays clear at 32 kbps; two minutes is about 480 KB. */
const BITRATE = 32_000;
const MIN_RECORDING_MS = 1_000;

/** Preferred containers, best first. Chrome and Firefox take webm, Safari takes mp4. */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];
const AUDIO_EXTENSIONS = /\.(m4a|mp3|mp4|wav|webm|ogg|oga|opus|aac|flac|caf|3gp|amr)$/i;

export type RecorderStatus = "idle" | "requesting" | "recording" | "review";

export type RecorderProblem =
  | "denied"
  | "unsupported"
  | "no-mic"
  | "failed"
  | "too-short"
  | "too-big"
  | "not-audio"
  | "empty";

/** A voice note ready for the pipeline: a fresh recording or an uploaded file. */
export interface Take {
  blob: Blob;
  /** Object URL for playback; revoked when the take is replaced or discarded. */
  url: string;
  source: "mic" | "upload";
  durationMs: number | null;
  fileName?: string;
}

export interface Recorder {
  status: RecorderStatus;
  problem: RecorderProblem | null;
  elapsedMs: number;
  take: Take | null;
  /** Live input for the level meter while recording. */
  analyser: AnalyserNode | null;
  start: () => Promise<void>;
  stop: () => void;
  discard: () => void;
  /** Accept an uploaded file as the take; returns false (and sets `problem`) if it can't be used. */
  acceptFile: (file: File) => boolean;
}

function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function problemFromError(error: unknown): RecorderProblem {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-mic";
  return "failed";
}

function isAudioFile(file: File): boolean {
  if (file.type) return /^(audio|video)\//.test(file.type);
  return AUDIO_EXTENSIONS.test(file.name);
}

/**
 * Records a voice note with MediaRecorder, or takes an uploaded file.
 * idle -> requesting (permission prompt) -> recording -> review.
 * Mic problems land back on idle with `problem` set, so the upload path stays open.
 */
export function useRecorder(): Recorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [problem, setProblem] = useState<RecorderProblem | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const takeUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Let go of the mic and the audio graph. */
  const release = useCallback(() => {
    stopTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    recorderRef.current = null;
  }, [stopTimer]);

  const replaceTake = useCallback((next: Take | null) => {
    if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
    takeUrlRef.current = next?.url ?? null;
    setTake(next);
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopTimer();
  }, [stopTimer]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    if (!canRecord()) {
      setProblem("unsupported");
      return;
    }

    setProblem(null);
    setStatus("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setProblem(problemFromError(error));
      setStatus("idle");
      return;
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: BITRATE });
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        release();
        setProblem("unsupported");
        setStatus("idle");
        return;
      }
    }
    recorderRef.current = recorder;

    // Level meter input. Recording still works if Web Audio is unavailable.
    try {
      const context = new AudioContext();
      const node = context.createAnalyser();
      node.fftSize = 1024;
      node.smoothingTimeConstant = 0.6;
      context.createMediaStreamSource(stream).connect(node);
      audioContextRef.current = context;
      setAnalyser(node);
    } catch {
      setAnalyser(null);
    }

    const chunks: Blob[] = [];
    const startedAt = performance.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      release();
      if (!mountedRef.current) return;
      setAnalyser(null);
      setProblem("failed");
      setStatus("idle");
    };
    recorder.onstop = () => {
      const durationMs = Math.min(performance.now() - startedAt, MAX_RECORDING_MS);
      const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
      release();
      if (!mountedRef.current) return;
      setAnalyser(null);
      setElapsedMs(durationMs);

      const blob = new Blob(chunks, { type });
      const issue: RecorderProblem | null =
        blob.size === 0 ? "failed" : durationMs < MIN_RECORDING_MS ? "too-short" : blob.size > MAX_AUDIO_BYTES ? "too-big" : null;
      if (issue) {
        setProblem(issue);
        setStatus("idle");
        return;
      }
      replaceTake({ blob, url: URL.createObjectURL(blob), source: "mic", durationMs });
      setStatus("review");
    };

    recorder.start(1000);
    setElapsedMs(0);
    setStatus("recording");
    timerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setElapsedMs(Math.min(elapsed, MAX_RECORDING_MS));
      if (elapsed >= MAX_RECORDING_MS) stop();
    }, 250);
  }, [release, replaceTake, stop]);

  const discard = useCallback(() => {
    replaceTake(null);
    setElapsedMs(0);
    setProblem(null);
    setStatus("idle");
  }, [replaceTake]);

  const acceptFile = useCallback(
    (file: File) => {
      if (recorderRef.current) return false;
      const issue: RecorderProblem | null =
        file.size === 0 ? "empty" : !isAudioFile(file) ? "not-audio" : file.size > MAX_AUDIO_BYTES ? "too-big" : null;
      if (issue) {
        setProblem(issue);
        return false;
      }
      replaceTake({ blob: file, url: URL.createObjectURL(file), source: "upload", durationMs: null, fileName: file.name });
      setElapsedMs(0);
      setProblem(null);
      setStatus("review");
      return true;
    },
    [replaceTake],
  );

  // Stop the mic and free the playback URL when the recorder goes away.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      release();
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
      takeUrlRef.current = null;
    };
  }, [release]);

  return { status, problem, elapsedMs, take, analyser, start, stop, discard, acceptFile };
}
