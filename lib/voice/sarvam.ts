/** Sarvam AI voice helpers (server-side). Keys never reach the client. */

/**
 * Sarvam TTS model and voice.
 *
 * `bulbul:v2` is deprecated and now 400s — which is why every spoken reply had
 * been silently falling back to the browser's robotic Web Speech voice rather
 * than Sarvam. v3 also rejects the old speaker names outright, so the two must
 * move together.
 */
const TTS_MODEL = "bulbul:v3";

// A warm, clear Indian female voice across every supported language, so the
// advisor keeps one identity when the customer switches language mid-conversation.
const DEFAULT_SPEAKER = "shruti";

const SPEAKERS: Record<string, string> = {
  "en-IN": DEFAULT_SPEAKER,
  "hi-IN": DEFAULT_SPEAKER,
  "ta-IN": DEFAULT_SPEAKER,
  "te-IN": DEFAULT_SPEAKER,
  "kn-IN": DEFAULT_SPEAKER,
  "mr-IN": DEFAULT_SPEAKER,
  "bn-IN": DEFAULT_SPEAKER,
  "gu-IN": DEFAULT_SPEAKER,
};

const SARVAM_TTS_LIMIT = 450; // chars per request (Bulbul input cap, conservative)

export interface TtsPayload {
  text: string;
  target_language_code: string;
  speaker: string;
  model: string;
}

/** Build the Sarvam TTS request payload for a single (already-sized) chunk. */
export function buildTtsPayload(text: string, language: string): TtsPayload {
  const lang = SPEAKERS[language] ? language : "en-IN";
  return {
    text: text.replace(/\s+/g, " ").trim().slice(0, SARVAM_TTS_LIMIT),
    target_language_code: lang,
    speaker: SPEAKERS[lang],
    model: TTS_MODEL,
  };
}

/** Split text into TTS-sized chunks on sentence/word boundaries. */
export function chunkText(text: string, limit = SARVAM_TTS_LIMIT): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean ? [clean] : [];
  const sentences = clean.match(/[^.!?]+[.!?]*\s*/g) ?? [clean];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > limit && cur) {
      chunks.push(cur.trim());
      cur = "";
    }
    // A single very long sentence: hard-split by words.
    if (s.length > limit) {
      for (const word of s.split(" ")) {
        if ((cur + " " + word).length > limit && cur) {
          chunks.push(cur.trim());
          cur = "";
        }
        cur += (cur ? " " : "") + word;
      }
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

export interface TtsResult {
  engine: "sarvam" | "none";
  audios?: string[]; // base64 wav chunks, in order
  mime?: string;
}

/** Call Sarvam Bulbul TTS, chunking long text so the whole reply is spoken. */
export async function synthesize(text: string, language: string): Promise<TtsResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return { engine: "none" };

  const chunks = chunkText(text);
  if (!chunks.length) return { engine: "none" };

  const audios: string[] = [];
  for (const chunk of chunks) {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": apiKey },
      body: JSON.stringify(buildTtsPayload(chunk, language)),
    });
    if (!res.ok) throw new Error(`Sarvam TTS ${res.status}`);
    const data = await res.json();
    // Sarvam may return one or more audio segments per request.
    const segs: string[] = data?.audios ?? [];
    audios.push(...segs);
  }
  if (!audios.length) return { engine: "none" };
  return { engine: "sarvam", audios, mime: "audio/wav" };
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
