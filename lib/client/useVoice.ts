"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typings for the browser Speech APIs (fallback path). */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface UseVoice {
  isRecording: boolean;
  isSpeaking: boolean;
  amplitude: number;
  startRecording: () => Promise<void>;
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
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const langRef = useRef<string>("en-IN");

  const cleanupAmplitude = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setAmplitude(0);
  }, []);

  /* ---------------- Recording (STT) ---------------- */
  const startRecording = useCallback(async () => {
    langRef.current = langRef.current || "en-IN";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "audio.webm");
        form.append("language", langRef.current);
        try {
          const res = await fetch("/api/stt", { method: "POST", body: form });
          const data = await res.json();
          if (data.engine === "sarvam" && data.transcript) {
            onTranscript(data.transcript);
            return;
          }
        } catch {
          /* fall through to browser STT */
        }
        startBrowserRecognition();
      };
      rec.start();
      recorderRef.current = rec;
      setIsRecording(true);
    } catch {
      // No mic permission / API — try browser recognition directly.
      startBrowserRecognition();
    }
  }, [onTranscript]);

  const startBrowserRecognition = useCallback(() => {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setIsRecording(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) onTranscript(text);
    };
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => setIsRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (recognitionRef.current) recognitionRef.current.stop();
  }, []);

  /* ---------------- Speaking (TTS) ---------------- */
  const stopSpeaking = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    cleanupAmplitude();
    setIsSpeaking(false);
  }, [cleanupAmplitude]);

  const speak = useCallback(
    async (text: string, language: string) => {
      langRef.current = language;
      stopSpeaking();
      let played = false;
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language }),
        });
        const data = await res.json();
        if (data.engine === "sarvam" && data.audio) {
          await playBase64Wav(data.audio);
          played = true;
        }
      } catch {
        /* fall through to browser TTS */
      }
      if (!played) speakBrowser(text, language);
    },
    [stopSpeaking],
  );

  const playBase64Wav = useCallback(
    (b64: string) =>
      new Promise<void>((resolve) => {
        const audio = new Audio(`data:audio/wav;base64,${b64}`);
        audioElRef.current = audio;
        setIsSpeaking(true);

        // Live amplitude via Web Audio analyser.
        try {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = audioCtxRef.current ?? new Ctx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
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
          cleanupAmplitude();
          setIsSpeaking(false);
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(done);
      }),
    [cleanupAmplitude],
  );

  const speakBrowser = useCallback(
    (text: string, language: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = language;
      u.rate = 1;
      setIsSpeaking(true);
      // No real amplitude here — oscillate to animate the mouth naturally.
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
      window.speechSynthesis.speak(u);
    },
    [cleanupAmplitude],
  );

  useEffect(() => () => {
    stopRecording();
    stopSpeaking();
  }, [stopRecording, stopSpeaking]);

  return { isRecording, isSpeaking, amplitude, startRecording, stopRecording, speak, stopSpeaking };
}
