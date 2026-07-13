/** Sarvam AI voice helpers (server-side). Keys never reach the client. */

// Map UI language codes to Sarvam language + a default speaker.
const SPEAKERS: Record<string, string> = {
  "en-IN": "anushka",
  "hi-IN": "anushka",
  "ta-IN": "anushka",
  "te-IN": "anushka",
  "kn-IN": "anushka",
  "mr-IN": "anushka",
  "bn-IN": "anushka",
  "gu-IN": "anushka",
};

const SARVAM_TTS_LIMIT = 450; // chars per request (Bulbul input cap, conservative)

export interface TtsPayload {
  text: string;
  target_language_code: string;
  speaker: string;
  model: string;
}

/** Build the Sarvam TTS request payload; truncates to the input limit. */
export function buildTtsPayload(text: string, language: string): TtsPayload {
  const lang = SPEAKERS[language] ? language : "en-IN";
  const clean = text.replace(/\s+/g, " ").trim().slice(0, SARVAM_TTS_LIMIT);
  return {
    text: clean,
    target_language_code: lang,
    speaker: SPEAKERS[lang],
    model: "bulbul:v2",
  };
}

export interface TtsResult {
  engine: "sarvam" | "none";
  audio?: string; // base64 wav
  mime?: string;
}

/** Call Sarvam Bulbul TTS. Returns engine:'none' if no key (client falls back). */
export async function synthesize(text: string, language: string): Promise<TtsResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return { engine: "none" };

  const payload = buildTtsPayload(text, language);
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Sarvam TTS ${res.status}`);
  const data = await res.json();
  const audio: string | undefined = data?.audios?.[0];
  if (!audio) return { engine: "none" };
  return { engine: "sarvam", audio, mime: "audio/wav" };
}

export interface SttResult {
  engine: "sarvam" | "none";
  transcript?: string;
}

/** Call Sarvam Saarika STT with a recorded audio blob. */
export async function transcribe(audio: Blob, language: string): Promise<SttResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return { engine: "none" };

  const form = new FormData();
  form.append("file", audio, "audio.webm");
  form.append("model", "saarika:v2");
  form.append("language_code", SPEAKERS[language] ? language : "en-IN");

  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`Sarvam STT ${res.status}`);
  const data = await res.json();
  return { engine: "sarvam", transcript: data?.transcript ?? "" };
}
