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
3. A **guardrailed LLM** (Claude) that reasons over that data to produce explainable, compliance-aware recommendations.

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

Single **Next.js (App Router)** full-stack app. The API routes act as a secure backend proxy that holds the Claude API key, so the key never reaches the browser. One repo, one deploy, one URL.

```
┌─────────────────────────────────────────────┐
│  Mobile-framed React UI (phone frame)         │
│   • Avatar (animated, lip/expression sync)    │
│   • Voice in  → Web Speech STT                │
│   • Voice out ← TTS → drives avatar mouth     │
│   • Portfolio / spending charts (Recharts)    │
└───────────────────┬───────────────────────────┘
                    │ HTTPS (JSON)
                    ▼
┌─────────────────────────────────────────────┐
│  Next.js API routes  (secure backend proxy)   │
│   /api/chat      → Claude (persona+guardrails)│
│   /api/profile   → customer 360 (mock)        │
│   /api/simulate  → goal / retirement projection│
│   holds ANTHROPIC_API_KEY (env var)           │
└───────────────────┬───────────────────────────┘
                    ▼
    ┌──────────────┐     ┌──────────────────────┐
    │  Claude LLM   │     │  Mock "bank data"     │
    │  reasons over │◄────│  Account-Aggregator / │
    │  profile JSON │     │  core-banking stand-in│
    └──────────────┘     └──────────────────────┘
```

**Chat flow:** UI sends message + customer id → `/api/chat` injects the customer's financial JSON + advisor system prompt (persona, guardrails, and optional tool-use: `get_portfolio`, `get_spending_insights`, `run_simulation`) → Claude returns text (streamed) → UI renders text and speaks it via TTS, animating the avatar to the speech.

**Grounding strategy:** RAG-lite — the customer's structured 360° JSON is injected directly into the prompt context (small, bounded dataset). Tool-use lets Claude fetch simulations on demand.

## 6. Tech stack

- **Next.js + TypeScript + Tailwind CSS** — app + secure API routes
- **Framer Motion** — avatar animation (mouth/expression states synced to speech events)
- **Web Speech API** — in-browser STT (mic) + TTS (voice out); zero external cost; graceful text-only fallback if unsupported
- **Anthropic Claude** — server-side reasoning engine
- **Recharts** — portfolio / spending / projection charts
- **Vercel** — deployment (free tier), yields the shareable URL

## 7. Data (synthetic)

A small set of synthetic customer profiles (e.g., "Priya, 32, salaried" / "Rajesh, 45, business owner") each with: holdings (equity/MF/FD/gold), 3–6 months of categorized transactions, net worth, risk appetite, and 1–2 financial goals. Authored as JSON under the mock data layer; represents what an Account Aggregator + core-banking feed would supply.

## 8. Resilience for the demo

Real Claude is used when `ANTHROPIC_API_KEY` is set. If the key is missing or a call fails, `/api/chat` returns a curated, on-persona fallback response so the public demo link never hard-fails in front of judges. (User selected "real LLM via backend proxy"; this fallback is a safety net only, not a scripted-mode product.)

## 9. Deliverables

1. **Working web app** — deployed, live URL.
2. **Public GitHub repo** — README, architecture, setup/run instructions, license, `.env.example` (no secrets committed).
3. **Filled IDBI submission deck** — all 12 content slides populated: concept, USP, features, process/use-case flow, wireframes, architecture diagram, tech stack, estimated cost, prototype snapshots, benchmarking, future scope, and the links slide.

## 10. Security / handling constraints

- **Claude API key**: read from `ANTHROPIC_API_KEY` env var; the user places it in a local `.env` (git-ignored). Never hardcoded or committed. `.env.example` documents the variable name only.
- **GitHub**: published via the user's own authenticated `gh`/git on their machine (personal account). Claude never receives the user's GitHub password or token. Repo creation + push happens with explicit confirmation of name and public visibility.

## 11. Branding

IDBI-inspired green/teal palette to match the hackathon; bank references kept generic ("the bank") so the concept is portable.

## 12. Out of scope (YAGNI for the prototype)

- Real Account Aggregator / core-banking integration (mocked).
- Real authentication / KYC (a simple customer picker stands in).
- 3D avatar and cloud TTS (2D + Web Speech is sufficient for the demo).
- Native mobile packaging (responsive web in a phone frame).
- Real trade execution / money movement (advisory only — and out of ethical/regulatory bounds for a prototype).
