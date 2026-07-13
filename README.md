# 🪔 Dhan Sarthi — Your Avatar-Based Wealth Guide

> **IDBI Innovate · Track 01** — Wealth Advisory · Conversational AI · Mobile Banking
> **Team Flexi Masters** · Team Leader: Avishkar Varpe

An avatar-led, voice-first digital wealth advisor that lives inside a bank's mobile app. It brings **human-RM-quality, personalized advisory to *every* customer** — not just HNIs — by combining an expressive talking avatar, Indian-language voice, and advice grounded in the customer's *real* portfolio and spending data.

---

## The problem (from the track brief)

Wealth management and advisory remain **fragmented and inaccessible** to the mass market. Personal guidance is effectively reserved for wealthy customers with a relationship manager. Banks can't bring a customer's **investment behaviour and spending habits** together, so advice isn't timely, personal, or scalable.

## Our solution

**Dhan Sarthi** ("your wealth guide") democratizes advisory through:

1. **An expressive 2D talking avatar** + voice conversation — lowers the intimidation barrier and builds trust for first-time investors.
2. **Advice grounded on the customer's 360° financial data** — holdings + spending + goals (an Account-Aggregator / core-banking stand-in), so every suggestion is personal and explainable.
3. **A guardrailed LLM** (Google Gemini 2.5 Flash) that reasons over that data, spoken back in the customer's own language via **Sarvam AI** voice.

## What makes it different

| Existing | Dhan Sarthi |
|---|---|
| Bank chatbots (FAQ / transactional) | Genuine **advisory**, avatar + voice |
| Robo-advisors (form-driven, English, siloed) | **Conversational, vernacular voice**, grounded on the **bank's own 360° data** |
| Reactive Q&A | **Proactive nudges** (spending, goal drift, rebalancing) |
| Opaque "black-box" picks | **Explainable** rationale + **SEBI/RBI-aware guardrails** + escalate-to-human-RM |

## Features

- 🗣️ **Avatar-led voice + text conversation** (multilingual — English, Hindi, Tamil, Telugu, Marathi, Bengali)
- 🏦 **Bank linking (mock Account Aggregator)** — a simulated bank login fetches savings/current/FD balances; add your own investments (equity, mutual funds, bonds, gold, cash equivalents) to build a live portfolio
- 📊 **360° financial snapshot** — net worth, asset allocation, spending breakdown (recomputes live as you link accounts and add assets)
- 🎯 **Goal planner & simulator** — live retirement / home / education projections
- 🔔 **Proactive nudges** — emergency-fund, allocation-drift, top-spend insights
- 🤖 **Strategy Studio** — ML-predicted algorithmic strategy from your inputs + **live Nifty technicals** (EMA/RSI/India-VIX), with a mock broker-connect & **simulated** automated execution
- 🔎 **Company Lens** — AI analysis of a company's latest **concall + investor presentation** into a 4-part insight (Quarter results · Risks · Projections · Verdict)
- ⚖️ **MPT Optimizer** — Markowitz **efficient-frontier** optimization of your holdings (max Sharpe), with current-vs-optimal allocation and a simulated broker rebalance
- 🛡️ **Compliance guardrails** — non-advice disclaimers, escalate-to-RM
- 🌐 **Runs on free tiers** — Gemini + Sarvam ₹100 credits + Vercel ≈ **₹0**

### Integrated prior work

Three of the team's earlier projects are folded in as add-on features:

| Project | Integrated as |
|---|---|
| [`final_year_project`](https://github.com/Avishkarrrrrr/final_year_project) — RandomForest that predicts an algo-trading strategy from risk/return/amount + market technicals | **Strategy Studio**: the model's inputs + strategy taxonomy (EMA Crossover, VCP, Flag, Fibonacci, Resistance Breakout, 55-EMA Support, Bottom) ported to an explainable in-app engine over live Nifty data |
| [`financial_statement_analyzer`](https://github.com/Avishkarrrrrr/financial_statement_analyzer) + [`concall_insights`](https://github.com/Avishkarrrrrr/concall_insights) — LLM analysis of concall transcripts & investor presentations | **Company Lens**: the 4-part structured analysis, run by Gemini over bundled real-company documents (live Screener.in scraping is the production path) |
| [`Portfolio-Optimization`](https://github.com/hardik1vaibhav/Portfolio-Optimization) — Markowitz MPT max-Sharpe optimizer (SciPy) | **MPT Optimizer**: annualized returns/covariance + max-Sharpe (rf 7%) via Monte-Carlo efficient-frontier simulation over the user's asset classes |

> **Note on trade execution:** Strategy Studio's automation is a clearly-labelled **simulation** against a mock broker — no real broker is connected and no real orders are placed. In production this maps to a broker-API integration behind explicit user authorisation and regulatory controls.

## Architecture

A single **Next.js (App Router)** full-stack app. Server API routes are a secure proxy that holds all keys and calls Gemini + Sarvam — no key ever reaches the browser. See [`docs/architecture.md`](docs/architecture.md).

```
Mobile-framed UI  →  Next.js API routes (secure proxy)  →  Gemini 2.5 Flash (brain)
  avatar + voice        /chat /stt /tts /profile /simulate   Sarvam AI (voice)
                                                             synthetic 360° data
```

## Tech stack

Next.js 15 · TypeScript · Tailwind CSS · Framer Motion · Recharts · Google Gemini API · Sarvam AI (Bulbul TTS + Saarika STT) · live Nifty market data (Yahoo Finance) · Vitest · Vercel.

## Run locally

```bash
npm install
cp .env.example .env        # then paste your keys (see below)
npm run dev                 # http://localhost:3000
```

### API keys (both have free tiers — optional to run)

| Variable | Where to get it | Free tier |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | Yes, no card |
| `SARVAM_API_KEY` | https://platform.sarvam.ai | ₹100 credits |

**The app runs without any keys** — it degrades gracefully:
- No `GEMINI_API_KEY` → an on-persona **guided fallback** answers (still grounded on the customer's data).
- No `SARVAM_API_KEY` → voice uses the browser's built-in **Web Speech** engine.

So the public demo link never hard-fails, even if a key or quota is exhausted.

## Tests

```bash
npm run test    # finance math, data, provider selection, voice payloads
```

## Demo customers

Three synthetic personas ship with the app — Priya (salaried, moderate), Rajesh (business owner, aggressive), Meena (near-retiree, conservative) — switchable from the header.

## Disclaimer

Dhan Sarthi provides **educational guidance, not investment advice**. Market investments are subject to risk. Consult a SEBI-registered advisor before investing. All customer data in this prototype is **synthetic**.

## License

MIT — see [LICENSE](LICENSE).
