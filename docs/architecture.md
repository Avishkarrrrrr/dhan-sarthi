# Architecture — Dhan Sarthi

## Overview

Single **Next.js (App Router)** full-stack application. The client renders a phone-framed UI; server-side **API routes act as a secure proxy** that holds every third-party key and performs all external calls. No API key is ever exposed to the browser.

## System diagram

```
┌──────────────────────────────────────────────────────────┐
│  CLIENT — Mobile-framed React UI                            │
│                                                             │
│   Advisor screen        Portfolio screen     Goals screen   │
│   • Avatar (SVG,         • Net worth          • Sliders      │
│     amplitude-driven     • Allocation donut   • Projection   │
│     mouth)               • Spending bars        chart        │
│   • Chat + mic           • Proactive nudges   • On-track     │
│   • Language select                             verdict      │
│                                                             │
│   Mic → MediaRecorder ─┐          ┌─ Audio ← amplitude via   │
│                        │          │   Web Audio AnalyserNode │
└────────────────────────┼──────────┼─────────────────────────┘
                         │  HTTPS   │  (JSON / audio / form)
                         ▼          ▼
┌──────────────────────────────────────────────────────────┐
│  SERVER — Next.js API routes (secure proxy, keys in env)    │
│                                                             │
│   /api/chat      → grounded prompt → LLM provider           │
│   /api/stt       → Sarvam Saarika (speech-to-text)          │
│   /api/tts       → Sarvam Bulbul (text-to-speech)           │
│   /api/profile   → customer 360 (metrics + nudges)          │
│   /api/simulate  → goal / retirement projection             │
└───────────────┬───────────────────┬──────────────────┬─────┘
               ▼                   ▼                  ▼
     ┌──────────────┐    ┌──────────────────┐  ┌──────────────┐
     │ LLM provider  │    │ Sarvam AI voice   │  │ Mock 360 data │
     │ (swappable)   │    │ Bulbul + Saarika  │  │ Account-Aggr. │
     │ Gemini 2.5    │    │ Indian languages  │  │ / core-bank   │
     │ Flash         │    └──────────────────┘  │ stand-in      │
     │ ↳ or Sarvam-M │                          └──────────────┘
     │ ↳ or Fallback │
     └──────────────┘
```

## Chat data flow

1. User speaks or types. Mic audio → `POST /api/stt` (Sarvam Saarika) → transcript. If no Sarvam key or an error, the client uses the browser Web Speech recognizer.
2. The transcript + prior turns → `POST /api/chat` with the `customerId` and `language`.
3. The route loads the customer's synthetic 360° data and calls `buildSystemPrompt()`, which injects the persona, guardrails, and the customer's real numbers (net worth, allocation, top spends, goals, live nudges).
4. `selectProvider()` picks the LLM: Gemini if a key exists, else Sarvam-M, else the deterministic fallback. On any provider error the route degrades to the fallback so the response never fails.
5. Reply text → shown in the chat and sent to `POST /api/tts` (Sarvam Bulbul) → base64 WAV.
6. The client plays the audio through a Web Audio `AnalyserNode`; the live amplitude drives the avatar's mouth for lip-sync. If no Sarvam audio, the browser `speechSynthesis` speaks it and the mouth animates on a timed oscillation.

## Provider abstraction

`lib/llm/provider.ts` defines `LlmProvider { name; complete(messages, system) }`. Implementations: `gemini.ts`, `sarvam.ts`, `fallback.ts`. `lib/llm/select.ts` chooses one from env (`LLM_PROVIDER` override, then key presence). This makes the reasoning engine hot-swappable — Gemini by default, or Sarvam-M for a fully-sovereign Indian stack.

## Grounding strategy

RAG-lite: the customer's 360° dataset is small and bounded, so it is injected directly into the system prompt as structured facts rather than retrieved from a vector store. Finance math (`lib/finance/*`) is pure and unit-tested, so the numbers the model sees are trustworthy and reproducible.

## Resilience

Every external dependency has a fallback (LLM → guided responses; Sarvam voice → Web Speech). The app is fully usable — and demoable — with zero keys configured.
