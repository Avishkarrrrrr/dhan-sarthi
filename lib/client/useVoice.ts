"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeForSpeech } from "@/lib/voice/speechText";

/* Minimal typings for the browser Speech Recognition API. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e?: unknown) => void) | null;
  start(): void;
  stop(): void;
}

export interface UseVoice {
  isRecording: boolean;
  isSpeaking: boolean;
  amplitude: number;
  startRecording: (language: string) => Promise<void>;
  stopRecording: () => void;
  speak: (text: string, language: string) => Promise<void>;
  stopSpeaking: () => void;
}

export function useVoice(onTranscript: (text: string) => void): UseVoice {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [amplitude, setAmplitude] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const speakTokenRef = useRef(0);

  const cleanupAmplitude = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setAmplitude(0);
  }, []);

  /* ---------------- Recording (STT) ---------------- */

  // Sarvam STT path (used when the browser recognizer is unavailable).
  const recordViaSarvam = useCallback(
    async (language: string) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const form = new FormData();
          form.append("audio", blob, "audio.webm");
          form.append("language", language);
          try {
            const res = await fetch("/api/stt", { method: "POST", body: form });
            const data = await res.json();
            if (data.transcript) onTranscript(data.transcript);
          } catch {
            /* give up silently */
          }
          setIsRecording(false);
        };
        rec.start();
        recorderRef.current = rec;
        setIsRecording(true);
      } catch {
        setIsRecording(false);
      }
    },
    [onTranscript],
  );

  const startRecording = useCallback(
    async (language: string) => {
      // Prefer the browser recognizer — it's real-time and reliable in Chrome.
      const w = window as unknown as {
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        SpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (Ctor) {
        const rec = new Ctor();
        rec.lang = language || "en-IN";
        rec.interimResults = false;
        rec.continuous = false;
        rec.onresult = (e) => {
          const text = e.results?.[0]?.[0]?.transcript ?? "";
          if (text) onTranscript(text);
        };
        rec.onend = () => setIsRecording(false);
        rec.onerror = () => setIsRecording(false);
        recognitionRef.current = rec;
        try {
          rec.start();
          setIsRecording(true);
        } catch {
          setIsRecording(false);
        }
        return;
      }
      // Fallback: record and transcribe with Sarvam.
      await recordViaSarvam(language || "en-IN");
    },
    [onTranscript, recordViaSarvam],
  );

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  /* ---------------- Speaking (TTS) ---------------- */

  const stopSpeaking = useCallback(() => {
    speakTokenRef.current++; // invalidate any in-flight chunk sequence
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    cleanupAmplitude();
    setIsSpeaking(false);
  }, [cleanupAmplitude]);

  // Play one base64 WAV chunk, driving amplitude from its waveform.
  const playOne = useCallback(
    (b64: string) =>
      new Promise<void>((resolve) => {
        const audio = new Audio(`data:audio/wav;base64,${b64}`);
        audioElRef.current = audio;
        try {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = audioCtxRef.current ?? new Ctx();
          audioCtxRef.current = ctx;
          if (ctx.state === "suspended") ctx.resume().catch(() => {});
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          const buf = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(buf);
            const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
            setAmplitude(Math.min(1, avg / 90));
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        } catch {
          /* analyser unavailable — mouth stays subtle */
        }
        const done = () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(done);
      }),
    [],
  );

  const speakBrowser = useCallback(
    (text: string, language: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = language;
      u.rate = 1;
      setIsSpeaking(true);
      const start = performance.now();
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        setAmplitude(0.35 + 0.35 * Math.abs(Math.sin(t * 9)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      u.onend = () => {
        cleanupAmplitude();
        setIsSpeaking(false);
      };
      u.onerror = () => {
        cleanupAmplitude();
        setIsSpeaking(false);
      };
      window.speechSynthesis.speak(u);
    },
    [cleanupAmplitude],
  );

  const speak = useCallback(
    async (rawText: string, language: string) => {
      const text = normalizeForSpeech(rawText);
      stopSpeaking();
      const token = ++speakTokenRef.current;
      setIsSpeaking(true);

      let audios: string[] = [];
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language }),
        });
        const data = await res.json();
        if (data.engine === "sarvam" && Array.isArray(data.audios)) audios = data.audios;
      } catch {
        /* fall through */
      }

      if (audios.length) {
        for (const b64 of audios) {
          if (speakTokenRef.current !== token) break; // stopped / superseded
          await playOne(b64);
        }
        if (speakTokenRef.current === token) {
          cleanupAmplitude();
          setIsSpeaking(false);
        }
      } else {
        speakBrowser(text, language);
      }
    },
    [stopSpeaking, playOne, speakBrowser, cleanupAmplitude],
  );

  useEffect(
    () => () => {
      stopRecording();
      stopSpeaking();
    },
    [stopRecording, stopSpeaking],
  );

  return { isRecording, isSpeaking, amplitude, startRecording, stopRecording, speak, stopSpeaking };
}
