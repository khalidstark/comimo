"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioConvertError, MAX_VOICE_NOTE_MS, overVoiceNoteCap, voiceNoteDurationMs } from "@/lib/audio/toWav";

/** Longest recording; the recorder stops itself here. Same cap as the WAV conversion. */
export const MAX_RECORDING_MS = MAX_VOICE_NOTE_MS;
/**
 * Largest file taken as a voice note. It never travels as is: the pipeline
 * converts it in the browser to 16 kHz mono WAV (about 3.8 MB for two
 * minutes), so a bigger source file, like a stereo WAV, is fine.
 */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
/** Speech stays clear at 32 kbps; two minutes is about 480 KB. */
const BITRATE = 32_000;
const MIN_RECORDING_MS = 1_000;

/** Preferred containers, best first. Chrome and Firefox take webm, Safari takes mp4. */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];
const AUDIO_EXTENSIONS = /\.(m4a|mp3|mp4|wav|webm|ogg|oga|opus|aac|flac|caf|3gp|amr)$/i;

/** "checking": an uploaded file is being measured before it is taken. */
export type RecorderStatus = "idle" | "requesting" | "recording" | "checking" | "review";

export type RecorderProblem =
  | "denied"
  | "unsupported"
  | "no-mic"
  | "failed"
  | "too-short"
  | "too-big"
  | "too-long"
  | "not-audio"
  | "unreadable"
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
  /** Length of the uploaded file just refused as "too-long". */
  refusedMs: number | null;
  take: Take | null;
  /** Live input for the level meter while recording. */
  analyser: AnalyserNode | null;
  start: () => Promise<void>;
  stop: () => void;
  discard: () => void;
  /**
   * Accept an uploaded file as the take. It is measured first, so a note over
   * two minutes is refused as soon as it is picked; resolves false (and sets
   * `problem`) if it can't be used.
   */
  acceptFile: (file: File) => Promise<boolean>;
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
  const [refusedMs, setRefusedMs] = useState<number | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const takeUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  /** True while the browser is asking for the mic, so a second tap doesn't open a second stream. */
  const startingRef = useRef(false);
  /** Bumped for every picked file, so only the latest one's measurement counts. */
  const pickRef = useRef(0);

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
    else if (!recorder) {
      // Nothing is recording any more: Stop goes back to Start instead of doing nothing.
      setStatus((current) => (current === "recording" ? "idle" : current));
      setAnalyser(null);
    }
    stopTimer();
  }, [stopTimer]);

  const start = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return;
    // A file still being measured loses to a fresh recording.
    pickRef.current++;
    if (!canRecord()) {
      setProblem("unsupported");
      return;
    }

    startingRef.current = true;
    setProblem(null);
    setStatus("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (error) {
      setStatus("idle");
      if (mountedRef.current) setProblem(problemFromError(error));
      return;
    } finally {
      startingRef.current = false;
    }
    if (!mountedRef.current) {
      // The page was left while the browser asked: let the mic go and show Start again.
      stream.getTracks().forEach((track) => track.stop());
      setStatus("idle");
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
    pickRef.current++;
    replaceTake(null);
    setElapsedMs(0);
    setProblem(null);
    setRefusedMs(null);
    setStatus("idle");
  }, [replaceTake]);

  const acceptFile = useCallback(
    async (file: File) => {
      if (recorderRef.current) return false;
      const pick = ++pickRef.current;
      setRefusedMs(null);
      const issue: RecorderProblem | null =
        file.size === 0 ? "empty" : !isAudioFile(file) ? "not-audio" : file.size > MAX_AUDIO_BYTES ? "too-big" : null;
      if (issue) {
        setProblem(issue);
        return false;
      }

      // Measure it now, so a note over two minutes is refused here and not after "Make my comic".
      setProblem(null);
      setStatus("checking");
      let durationMs: number | null = null;
      let unreadable = false;
      try {
        durationMs = await voiceNoteDurationMs(file);
      } catch (error) {
        // A browser that can't prepare audio at all hears about it when the comic is made, as before.
        unreadable = !(error instanceof AudioConvertError && error.problem === "unsupported");
      }
      if (!mountedRef.current || pick !== pickRef.current) return false;

      const refused: RecorderProblem | null = unreadable ? "unreadable" : durationMs !== null && overVoiceNoteCap(durationMs) ? "too-long" : null;
      if (refused) {
        setProblem(refused);
        setRefusedMs(refused === "too-long" ? durationMs : null);
        // A take picked earlier stays ready.
        setStatus(takeUrlRef.current ? "review" : "idle");
        return false;
      }
      replaceTake({ blob: file, url: URL.createObjectURL(file), source: "upload", durationMs, fileName: file.name });
      setElapsedMs(0);
      setStatus("review");
      return true;
    },
    [replaceTake],
  );

  // Stop the mic and free the playback URL when the recorder goes away.
  // Next keeps /record mounted but hidden after navigating away, so a
  // recording cut short here must also land back on Start, not a dead Stop.
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
      if (recorder) {
        setStatus("idle");
        setElapsedMs(0);
        setAnalyser(null);
      }
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
      takeUrlRef.current = null;
    };
  }, [release]);

  return { status, problem, elapsedMs, refusedMs, take, analyser, start, stop, discard, acceptFile };
}
