# Dhan Sarthi — Avatar-Based Digital Wealth Advisor

**Design spec · 2026-07-13**
Hackathon: IDBI Innovate — Track 01 (Wealth Advisory / Conversational AI / Mobile Banking)
Team: **Flexi Masters** · Team Leader: **Avishkar Varpe**

---

## 1. Problem (from the track brief)

- Wealth management & advisory remain **fragmented and inaccessible** to the large mass-market customer base — personal guidance is effectively reserved for HNIs with a relationship manager (RM).
- The bank cannot bring together a customer's **investment behaviour and spending habits**, so it cannot deliver timely, personalized, data-driven guidance.
- There is no **scalable** channel to give human-RM-quality advice to millions of customers.

## 2. Solution

**Dhan Sarthi** ("your wealth guide") — an avatar-led, voice-first wealth advisor embedded inside the bank's mobile app. It democratizes RM-quality advisory to *every* customer by combining:

1. An expressive **2D talking avatar** + voice conversation (accessible, trust-building, vernacular-ready).
2. Advice **grounded on the customer's real 360° financial data** (portfolio holdings + spending/transaction patterns + goals), simulating an Account-Aggregator / core-banking feed.
3. A **guardrailed LLM** (Google Gemini 2.5 Flash) that reasons over that data to produce explainable, compliance-aware recommendations, spoken back in the customer's language via **Sarvam AI** Indian-language voice models.

## 3. USP / differentiation

| Existing | Dhan Sarthi |
|---|---|
| Bank chatbots (SBI, HDFC EVA) — FAQ / transactional | Genuine **advisory**, avatar + voice |
| Robo-advisors (Groww, INDmoney) — form-driven, English, siloed from bank data | **Conversational, vernacular voice**, grounded on the bank's own **360° customer data** |
| Reactive Q&A only | **Proactive nudges** — spending insights, goal drift, rebalancing alerts |
| Opaque "black-box" picks | **Explainable** rationale + **SEBI/RBI-aware guardrails** + escalate-to-human-RM |

**Signature differentiators:** (a) the avatar lowers the intimidation barrier for the mass segment; (b) voice + vernacular = real accessibility for India; (c) advice is grounded on *actual* portfolio + spending data rather than a one-time questionnaire.

## 4. Features (demonstrated in the prototype)

1. **Avatar-led conversation** — voice + text; the avatar speaks responses (TTS) with lip/expression animation.
2. **360° financial snapshot** — portfolio, spending breakdown, net worth (the grounding data, shown as charts).
3. **Personalized recommendations** — asset allocation, SIP suggestions, rebalancing — each with a plain-language *rationale*.
4. **Goal-based planning + simulator** — retirement / home / child-education projections.
5. **Proactive nudges** — surfaced insights (e.g., "your equity allocation drifted to 78%", "dining spend up 30% MoM").
6. **Conversational risk profiling** — inferred through dialogue, not a static form.
7. **Compliance guardrails** — non-advice disclaimers where required, and an "escalate to human RM" path.

## 5. Architecture

Single **Next.js (App Router)** full-stack app. The API routes act as a secure backend proxy that holds the Gemini and Sarvam API keys, so no key ever reaches the browser. One repo, one deploy, one URL.

```
┌─────────────────────────────────────────────┐
│  Mobile-framed React UI (phone frame)         │
│   • Avatar (animated, mouth driven by audio)  │
│   • Mic capture → /api/stt (Sarvam Saarika)   │
│   • Voice out ← /api/tts (Sarvam Bulbul)      │
│     audio amplitude → avatar lip-sync         │
│   • Portfolio / spending charts (Recharts)    │
└───────────────────┬───────────────────────────┘
                    │ HTTPS (JSON / audio)
                    ▼
┌─────────────────────────────────────────────┐
│  Next.js API routes  (secure backend proxy)   │
│   /api/chat      → Gemini 2.5 Flash           │
│   /api/stt       → Sarvam Saarika (STT)       │
│   /api/tts       → Sarvam Bulbul (TTS)        │
│   /api/profile   → customer 360 (mock)        │
│   /api/simulate  → goal / retirement projection│
│   holds GEMINI_API_KEY + SARVAM_API_KEY (env) │
└───────────────────┬───────────────────────────┘
                    ▼
 ┌───────────────┐  ┌──────────────┐  ┌───────────────────┐
 │ Gemini 2.5    │  │ Sarvam AI     │  │ Mock "bank data"   │
 │ Flash — brain │  │ Bulbul + Saarika│ Account-Aggregator/│
 │ (swappable to │  │ voice (Indian │  │ core-banking       │
 │  Sarvam-M)    │  │ languages)    │  │ stand-in           │
 └───────────────┘  └──────────────┘  └───────────────────┘
```

**Chat flow:** mic audio → `/api/stt` (Sarvam Saarika) → transcript → `/api/chat` injects the customer's financial JSON + advisor system prompt (persona, guardrails, and optional tool-use: `get_portfolio`, `get_spending_insights`, `run_simulation`), Gemini replies in the selected language → `/api/tts` (Sarvam Bulbul) returns audio → UI plays it, using Web Audio amplitude to drive the avatar's mouth. Text is shown alongside. The LLM is behind a swappable provider interface (Gemini default, Sarvam-M optional).

**Grounding strategy:** RAG-lite — the customer's structured 360° JSON is injected directly into the prompt context (small, bounded dataset). Tool-use lets Claude fetch simulations on demand.

## 6. Tech stack

- **Next.js + TypeScript + Tailwind CSS** — app + secure API routes
- **Framer Motion** — avatar animation (mouth/expression states driven by played-audio amplitude via Web Audio API)
- **Google Gemini 2.5 Flash** — server-side reasoning engine (free tier; `gemini-2.5-flash-lite` auto-downgrade on rate limit; swappable to Sarvam-M)
- **Sarvam AI** — Bulbul (TTS) + Saarika (STT) for Indian-language, Indian-accent voice; ₹100 free credits
- **Web Speech API** — automatic fallback for STT/TTS if no Sarvam key is configured
- **Recharts** — portfolio / spending / projection charts
- **Vercel** — deployment (free tier), yields the shareable URL

Estimated cost: effectively **₹0** for the prototype — Gemini free tier + Sarvam ₹100 free credits + Vercel free tier.

## 7. Data (synthetic)

A small set of synthetic customer profiles (e.g., "Priya, 32, salaried" / "Rajesh, 45, business owner") each with: holdings (equity/MF/FD/gold), 3–6 months of categorized transactions, net worth, risk appetite, and 1–2 financial goals. Authored as JSON under the mock data layer; represents what an Account Aggregator + core-banking feed would supply.

## 8. Resilience for the demo

Real Gemini is used when `GEMINI_API_KEY` is set. If the key is missing or a call fails, `/api/chat` returns a curated, on-persona fallback response. Similarly, if `SARVAM_API_KEY` is absent, the UI falls back to the browser Web Speech API for voice. So the public demo link never hard-fails in front of judges. (Fallbacks are safety nets only, not a scripted-mode product.)

## 9. Deliverables

1. **Working web app** — deployed, live URL.
2. **Public GitHub repo** — README, architecture, setup/run instructions, license, `.env.example` (no secrets committed).
3. **Filled IDBI submission deck** — all 12 content slides populated: concept, USP, features, process/use-case flow, wireframes, architecture diagram, tech stack, estimated cost, prototype snapshots, benchmarking, future scope, and the links slide.

## 10. Security / handling constraints

- **API keys** (`GEMINI_API_KEY`, `SARVAM_API_KEY`): read from env vars; the user places them in a local `.env` (git-ignored). Never hardcoded or committed. `.env.example` documents the variable names only. All third-party calls are server-side so keys never reach the browser.
- **GitHub**: published via the user's own authenticated `gh`/git on their machine (personal account). Claude never receives the user's GitHub password or token. Repo creation + push happens with explicit confirmation of name and public visibility.

## 11. Branding

IDBI-inspired green/teal palette to match the hackathon; bank references kept generic ("the bank") so the concept is portable.

## 12. Out of scope (YAGNI for the prototype)

- Real Account Aggregator / core-banking integration (mocked).
- Real authentication / KYC (a simple customer picker stands in).
- 3D avatar (2D animated avatar is sufficient for the demo).
- Native mobile packaging (responsive web in a phone frame).
- Real trade execution / money movement (advisory only — and out of ethical/regulatory bounds for a prototype).
