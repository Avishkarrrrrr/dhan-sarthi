# Dhan Sarthi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable, mobile-framed web app where an animated 2D avatar gives voice-driven, data-grounded wealth advice, powered by Gemini 2.5 Flash (reasoning) and Sarvam AI (Indian-language voice), plus the filled IDBI submission deck and a public GitHub repo.

**Architecture:** Single Next.js (App Router) full-stack app. Client renders a phone-framed UI (avatar, chat, dashboard, planner). Server API routes are a secure proxy holding all keys and calling Gemini + Sarvam. Advice is grounded by injecting a synthetic customer's 360° financial JSON into the prompt. Every external dependency has a graceful fallback so the public demo never hard-fails.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Recharts · Google Gemini API (`@google/genai`) · Sarvam AI REST · Vitest (unit tests) · Vercel (deploy).

## Global Constraints

- Node ≥ 18.18 (Next.js 15 requirement). Local Node is v22 — OK.
- No secrets committed. Keys read only from env: `GEMINI_API_KEY`, `SARVAM_API_KEY`. `.gitignore` excludes `.env*`. `.env.example` lists variable names only.
- All third-party API calls happen in server API routes — never client-side.
- LLM behind a swappable `LlmProvider` interface (Gemini default; Sarvam-M optional).
- Advisory only: never generate instructions to execute trades or move money. Every recommendation carries a plain-language rationale and a non-advice disclaimer.
- Palette: IDBI-inspired green/teal. Primary `#0B7A4B` (green), deep `#064E36`, accent `#12B886`, surface `#F5F7F6`, ink `#0E1B14`. Bank name kept generic ("the bank").
- Currency formatted in INR (₹, lakh/crore where natural).
- Every task ends by running `npm run test` (where tests exist) and/or `npm run build`, then a commit.

---

## File Structure

```
dhan-sarthi/
├── app/
│   ├── layout.tsx                 # root layout, fonts, theme
│   ├── globals.css                # Tailwind + theme tokens
│   ├── page.tsx                   # main app shell (phone frame + screens)
│   └── api/
│       ├── chat/route.ts          # POST → LLM advice (grounded)
│       ├── stt/route.ts           # POST audio → transcript (Sarvam Saarika)
│       ├── tts/route.ts           # POST text → audio (Sarvam Bulbul)
│       ├── profile/route.ts       # GET customer 360
│       └── simulate/route.ts      # POST goal/retirement projection
├── lib/
│   ├── data/
│   │   ├── customers.ts           # synthetic customer 360 dataset + accessors
│   │   └── types.ts               # Customer, Holding, Transaction, Goal types
│   ├── finance/
│   │   ├── metrics.ts             # netWorth, allocation, spendingInsights
│   │   └── simulate.ts            # goal & retirement projection math
│   ├── llm/
│   │   ├── provider.ts            # LlmProvider interface + selectProvider()
│   │   ├── gemini.ts              # Gemini implementation
│   │   ├── sarvam.ts              # Sarvam-M implementation (optional)
│   │   ├── fallback.ts            # curated on-persona fallback
│   │   └── prompt.ts              # system prompt + grounding builder
│   └── voice/
│       └── sarvam.ts              # server helpers: TTS + STT calls
├── components/
│   ├── PhoneFrame.tsx             # device frame wrapper
│   ├── Avatar.tsx                 # animated 2D advisor, mouth driven by amplitude
│   ├── ChatPanel.tsx              # messages + input + mic button
│   ├── VoiceController.tsx        # mic capture + TTS playback + amplitude hook
│   ├── Dashboard.tsx              # 360° snapshot (charts + nudges)
│   ├── GoalPlanner.tsx            # simulator screen
│   ├── NavBar.tsx                 # bottom tab nav
│   └── charts/                    # small Recharts wrappers
├── lib/client/
│   ├── useVoice.ts                # client hook: record → /api/stt, /api/tts playback
│   └── api.ts                     # typed fetch helpers
├── test/                          # Vitest unit tests (finance, llm, data)
├── public/avatar/                 # avatar art assets (SVG layers)
├── .env.example
├── README.md
└── docs/architecture.md
```

---

### Task 1: Scaffold Next.js app + theme + tooling

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `.env.example`

**Interfaces:**
- Produces: a running dev server; theme tokens in `globals.css`; `npm run test` wired to Vitest.

- [ ] **Step 1: Initialize project**

```bash
cd dhan-sarthi
npm init -y
npm install next@15 react react-dom
npm install -D typescript @types/react @types/node @types/react-dom tailwindcss postcss autoprefixer vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
npm install framer-motion recharts @google/genai
```

- [ ] **Step 2: Add scripts to package.json**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Configure Tailwind** (`tailwind.config.ts`) with content globs `./app/**/*.{ts,tsx}`, `./components/**/*.{ts,tsx}` and theme colors from the palette in Global Constraints (brand.green, brand.deep, brand.accent, surface, ink).

- [ ] **Step 4: Write `app/globals.css`** — `@tailwind base/components/utilities` + CSS variables for the palette + base body styles (surface background, ink text).

- [ ] **Step 5: Write `app/layout.tsx`** — root layout, import globals.css, set `<html lang="en">`, metadata title "Dhan Sarthi — Your Wealth Guide", a sans font (Inter via `next/font`).

- [ ] **Step 6: Write minimal `app/page.tsx`** — renders a centered "Dhan Sarthi" heading inside a placeholder phone frame div (replaced in Task 7).

- [ ] **Step 7: Write `vitest.config.ts`** — react plugin, jsdom environment, globals true, setup file for jest-dom.

- [ ] **Step 8: Write `.env.example`**

```
# Google Gemini (https://aistudio.google.com/apikey) — free tier
GEMINI_API_KEY=
# Sarvam AI (https://platform.sarvam.ai) — ₹100 free credits
SARVAM_API_KEY=
# Optional: force LLM provider (gemini | sarvam | fallback). Default: auto
LLM_PROVIDER=
```

- [ ] **Step 9: Verify + commit**

```bash
npm run dev   # confirm http://localhost:3000 renders the heading
# Ctrl-C
git add -A && git commit -m "chore: scaffold Next.js app with theme and tooling"
```

---

### Task 2: Synthetic customer data + types

**Files:**
- Create: `lib/data/types.ts`, `lib/data/customers.ts`
- Test: `test/data.test.ts`

**Interfaces:**
- Produces:
  - Types: `Customer`, `Holding`, `Transaction`, `Goal`, `RiskProfile`.
  - `getCustomer(id: string): Customer | undefined`
  - `listCustomers(): { id: string; name: string; persona: string }[]`

- [ ] **Step 1: Write `lib/data/types.ts`**

```typescript
export type AssetClass = 'equity' | 'mutual_fund' | 'fd' | 'gold' | 'cash';
export interface Holding { assetClass: AssetClass; name: string; value: number; } // value in INR
export interface Transaction { date: string; category: string; amount: number; } // amount<0 = spend
export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';
export interface Goal { id: string; label: string; targetAmount: number; targetYear: number; current: number; }
export interface Customer {
  id: string; name: string; age: number; persona: string; city: string;
  monthlyIncome: number; riskProfile: RiskProfile;
  holdings: Holding[]; transactions: Transaction[]; goals: Goal[];
}
```

- [ ] **Step 2: Write failing test `test/data.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { getCustomer, listCustomers } from '../lib/data/customers';

describe('customer data', () => {
  it('lists at least two personas', () => {
    expect(listCustomers().length).toBeGreaterThanOrEqual(2);
  });
  it('returns a customer with holdings, transactions, goals', () => {
    const c = getCustomer(listCustomers()[0].id)!;
    expect(c.holdings.length).toBeGreaterThan(0);
    expect(c.transactions.length).toBeGreaterThan(0);
    expect(c.goals.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test — expect FAIL** (`npm run test` → module not found).

- [ ] **Step 4: Write `lib/data/customers.ts`** — export ≥3 synthetic customers with realistic INR values: e.g. "Priya Sharma, 32, salaried, Pune" (moderate), "Rajesh Kumar, 45, business owner, Jaipur" (aggressive), "Meena Iyer, 58, near-retiree, Chennai" (conservative). Each: 4–6 holdings across asset classes, 15–25 categorized transactions over ~3 months (salary credits + rent/food/EMI/shopping debits), 1–2 goals. Implement `getCustomer` and `listCustomers`.

- [ ] **Step 5: Run test — expect PASS.**

- [ ] **Step 6: Commit** `git commit -m "feat: synthetic customer 360 dataset and types"`

---

### Task 3: Finance metrics + simulation (pure functions, TDD)

**Files:**
- Create: `lib/finance/metrics.ts`, `lib/finance/simulate.ts`
- Test: `test/finance.test.ts`

**Interfaces:**
- Produces:
  - `netWorth(c: Customer): number`
  - `allocation(c: Customer): { assetClass: AssetClass; value: number; pct: number }[]`
  - `spendingInsights(c: Customer): { category: string; total: number }[]` (sorted desc, spends only)
  - `projectGoal(goal: Goal, monthlyContribution: number, annualReturnPct: number): { year: number; value: number }[]`
  - `retirementProjection(currentCorpus: number, monthly: number, years: number, annualReturnPct: number): number`

- [ ] **Step 1: Write failing tests `test/finance.test.ts`** covering: netWorth sums holdings; allocation pct sums to ~100; spendingInsights excludes credits and sorts desc; projectGoal grows with compounding and returns one row per year to targetYear; retirementProjection matches future-value formula within ₹1.

```typescript
import { describe, it, expect } from 'vitest';
import { netWorth, allocation, spendingInsights } from '../lib/finance/metrics';
import { retirementProjection, projectGoal } from '../lib/finance/simulate';
import { getCustomer, listCustomers } from '../lib/data/customers';

const c = () => getCustomer(listCustomers()[0].id)!;

it('netWorth sums holdings', () => {
  const expected = c().holdings.reduce((s, h) => s + h.value, 0);
  expect(netWorth(c())).toBe(expected);
});
it('allocation pct sums ~100', () => {
  const total = allocation(c()).reduce((s, a) => s + a.pct, 0);
  expect(Math.round(total)).toBe(100);
});
it('spendingInsights excludes credits', () => {
  expect(spendingInsights(c()).every(s => s.total > 0)).toBe(true);
});
it('retirementProjection future value', () => {
  // 12% annual, 10 yrs, 10000/mo, 0 corpus → FV of annuity
  const v = retirementProjection(0, 10000, 10, 12);
  expect(v).toBeGreaterThan(10000 * 12 * 10); // beats plain sum due to growth
});
it('projectGoal returns rows to target year', () => {
  const rows = projectGoal({ id:'g', label:'x', targetAmount: 1e6, targetYear: new Date().getFullYear()+5, current: 0 }, 10000, 10);
  expect(rows.length).toBe(6); // year 0..5
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `metrics.ts` and `simulate.ts`.** Use monthly compounding for projections: `retirementProjection` = `corpus*(1+r)^n + monthly*(((1+r)^n - 1)/r)` where `r = annualReturnPct/100/12`, `n = years*12`. `projectGoal` yields yearly values from now to `targetYear`.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** `git commit -m "feat: finance metrics and projection math with tests"`

---

### Task 4: `/api/profile` and `/api/simulate` routes

**Files:**
- Create: `app/api/profile/route.ts`, `app/api/simulate/route.ts`, `lib/client/api.ts`
- Test: `test/api-logic.test.ts` (tests the pure builders the routes call)

**Interfaces:**
- `/api/profile?id=<id>` → `{ customer, netWorth, allocation, spendingInsights }`
- `/api/simulate` POST `{ mode:'goal'|'retirement', ... }` → projection rows/value.
- Produces client helpers `fetchProfile(id)`, `postSimulate(body)` in `lib/client/api.ts`.

- [ ] **Step 1: Write a `buildProfileResponse(id)` pure function** in `lib/finance/metrics.ts` (or a small `lib/finance/profile.ts`) that composes customer + metrics, so it is unit-testable without HTTP. Test it in `test/api-logic.test.ts` (returns null for unknown id; includes netWorth for known id).

- [ ] **Step 2: Run — expect FAIL, then implement, then PASS.**

- [ ] **Step 3: Implement route handlers** that call the builder and return `Response.json(...)`, 404 on unknown id, 400 on bad simulate body.

- [ ] **Step 4: Implement `lib/client/api.ts`** typed fetch helpers.

- [ ] **Step 5: Verify** with `npm run dev` + `curl 'localhost:3000/api/profile?id=<id>'` returns JSON. Commit `git commit -m "feat: profile and simulate API routes"`.

---

### Task 5: LLM provider abstraction + Gemini + grounded prompt + `/api/chat`

**Files:**
- Create: `lib/llm/provider.ts`, `lib/llm/gemini.ts`, `lib/llm/sarvam.ts`, `lib/llm/fallback.ts`, `lib/llm/prompt.ts`, `app/api/chat/route.ts`
- Test: `test/llm.test.ts`

**Interfaces:**
- `interface LlmProvider { name: string; complete(messages: ChatMsg[], system: string): Promise<string>; }`
- `type ChatMsg = { role: 'user'|'assistant'; content: string }`
- `selectProvider(): LlmProvider` — returns Gemini if `GEMINI_API_KEY` set (and `LLM_PROVIDER`!='sarvam'/'fallback'), Sarvam if configured, else Fallback.
- `buildSystemPrompt(customer, metrics): string` — persona (Dhan Sarthi, warm Indian wealth guide), guardrails (advisory not execution, SEBI/RBI-aware disclaimer, escalate-to-RM), and the customer's 360° JSON as grounding.

- [ ] **Step 1: Write `provider.ts`** (interface + `selectProvider`) and `fallback.ts` (deterministic on-persona responses keyed by intent: greeting, allocation, goal, spending, default).

- [ ] **Step 2: Write failing test `test/llm.test.ts`** — with no env keys, `selectProvider().name === 'fallback'`; `fallback.complete` returns a non-empty string mentioning the customer's name when provided in system prompt context; `buildSystemPrompt` includes net worth and the disclaimer text.

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement `prompt.ts`, `gemini.ts` (using `@google/genai`, model `gemini-2.5-flash`, with `gemini-2.5-flash-lite` retry on 429), `sarvam.ts` (Sarvam-M chat completions), and wire `selectProvider`.**

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: Implement `app/api/chat/route.ts`** — POST `{ customerId, messages, language }` → load profile, build system prompt, `selectProvider().complete(...)`, return `{ reply, provider }`. Wrap in try/catch → fallback on any error.

- [ ] **Step 7: Verify** `curl -XPOST localhost:3000/api/chat -d '{"customerId":"...","messages":[{"role":"user","content":"How should I invest?"}]}'` returns a reply (fallback if no key). Commit `git commit -m "feat: LLM provider abstraction, Gemini, grounded prompt, chat route"`.

---

### Task 6: Sarvam voice proxies `/api/tts` + `/api/stt`

**Files:**
- Create: `lib/voice/sarvam.ts`, `app/api/tts/route.ts`, `app/api/stt/route.ts`
- Test: `test/voice.test.ts` (unit-test request-body builders only; no live calls)

**Interfaces:**
- `/api/tts` POST `{ text, language }` → audio (base64 WAV in JSON `{ audio, mime, engine:'sarvam'|'none' }`). If no `SARVAM_API_KEY`, returns `{ engine:'none' }` so client falls back to Web Speech.
- `/api/stt` POST (multipart audio) → `{ transcript, engine }`.
- `lib/voice/sarvam.ts`: `buildTtsPayload(text, language)`, `ttsToBase64(...)`, `sttFromAudio(...)`.

- [ ] **Step 1: Write `buildTtsPayload` pure builder** (maps language → Sarvam `target_language_code` + `speaker`, chunks text ≤ Sarvam char limit). Test it in `test/voice.test.ts`.

- [ ] **Step 2: Run FAIL → implement → PASS.**

- [ ] **Step 3: Implement Sarvam calls** in `lib/voice/sarvam.ts` (TTS `POST https://api.sarvam.ai/text-to-speech` with `api-subscription-key` header; STT `POST https://api.sarvam.ai/speech-to-text`, model `saarika:v2`).

- [ ] **Step 4: Implement both routes** with the no-key → `engine:'none'` behavior.

- [ ] **Step 5: Commit** `git commit -m "feat: Sarvam TTS/STT proxy routes with Web Speech fallback signal"`.

---

### Task 7: UI shell — PhoneFrame, NavBar, screen routing

**Files:**
- Create: `components/PhoneFrame.tsx`, `components/NavBar.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `app/page.tsx` client component holding `screen` state (`'advisor'|'dashboard'|'planner'`), customer picker, and rendering the active screen inside `PhoneFrame` with `NavBar` at the bottom.

- [ ] **Step 1: `PhoneFrame.tsx`** — rounded device bezel, notch, `max-w-[420px]`, fixed aspect, scrollable content area, subtle shadow; children slot.
- [ ] **Step 2: `NavBar.tsx`** — 3 tabs (Advisor / Portfolio / Goals) with icons, active state in brand green.
- [ ] **Step 3: `app/page.tsx`** — `'use client'`, state for screen + selected customerId (default first customer), header greeting, customer switcher (dropdown), render placeholder screens.
- [ ] **Step 4: Verify** dev server shows phone frame + working tab switching. Commit `git commit -m "feat: mobile phone-frame shell with tab navigation"`.

---

### Task 8: Avatar component (animated 2D, amplitude-driven mouth)

**Files:**
- Create: `components/Avatar.tsx`, `public/avatar/*` (SVG layers or inline SVG)

**Interfaces:**
- `Avatar({ speaking: boolean, amplitude: number, mood?: 'idle'|'thinking'|'happy' })` — renders an inline-SVG advisor; mouth open-height scales with `amplitude` (0–1); idle blink + gentle bob via Framer Motion; `thinking` shows a subtle pulse.

- [ ] **Step 1: Build the avatar as inline SVG** (friendly, professional Indian advisor; simple flat style: head, hair, face, eyes, mouth path, shoulders/blazer in brand colors). Keep mouth as a separate `<path>`/`<ellipse>` whose scaleY binds to `amplitude`.
- [ ] **Step 2: Animate** with Framer Motion: idle bob (y ±2px loop), periodic blink (eye scaleY), mouth driven by `amplitude` prop, `thinking` pulse ring.
- [ ] **Step 3: Verify** in a temporary story on `app/page.tsx` (slider to fake amplitude) that the mouth moves. Commit `git commit -m "feat: animated 2D advisor avatar with amplitude-driven mouth"`.

---

### Task 9: Voice hook + VoiceController (record → STT, TTS → playback → amplitude)

**Files:**
- Create: `lib/client/useVoice.ts`, `components/VoiceController.tsx`

**Interfaces:**
- `useVoice()` returns `{ startRecording, stopRecording, isRecording, speak(text, language), amplitude, isSpeaking }`.
  - Recording: `MediaRecorder` → blob → `/api/stt`; if `engine:'none'` or error, use `webkitSpeechRecognition` when available.
  - Speaking: `/api/tts`; if audio returned, play via `<audio>` + `AudioContext`/`AnalyserNode` to compute live `amplitude` (0–1); if `engine:'none'`, use `speechSynthesis` and approximate amplitude with a timed oscillation while `speaking`.

- [ ] **Step 1: Implement `useVoice.ts`** with the two paths above and expose `amplitude` via `requestAnimationFrame` reading the analyser.
- [ ] **Step 2: `VoiceController.tsx`** — mic button (push-to-talk), speaker toggle, language selector (English/Hindi/…); wires callbacks up to parent.
- [ ] **Step 3: Verify** speaking a test string moves the avatar mouth (real Sarvam if key present, else browser TTS). Commit `git commit -m "feat: voice hook and controller with Sarvam + Web Speech fallback"`.

---

### Task 10: Advisor screen — ChatPanel + avatar + voice wired to /api/chat

**Files:**
- Create: `components/ChatPanel.tsx`
- Modify: `app/page.tsx` (advisor screen)

**Interfaces:**
- `ChatPanel({ customerId, language })` — message list, text input, mic (from VoiceController); on send → `/api/chat` → append reply → `speak(reply)`; shows provider badge (Gemini/Fallback) and a persistent compliance disclaimer footer.

- [ ] **Step 1: Build ChatPanel** with message bubbles, streaming-ish typing indicator (avatar `mood='thinking'` while awaiting), suggested-prompt chips ("Review my portfolio", "Am I on track for retirement?", "Where is my money going?").
- [ ] **Step 2: Wire** send → chat API → speak reply → avatar amplitude. Seed with an avatar greeting that uses the customer's name.
- [ ] **Step 3: Add disclaimer footer** ("Dhan Sarthi provides educational guidance, not investment advice. Consult a SEBI-registered advisor / your RM before investing.").
- [ ] **Step 4: Verify** full loop: type/speak → grounded reply → avatar talks. Commit `git commit -m "feat: advisor screen with grounded voice chat"`.

---

### Task 11: Dashboard (360° snapshot) + proactive nudges

**Files:**
- Create: `components/Dashboard.tsx`, `components/charts/AllocationChart.tsx`, `components/charts/SpendingChart.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- `Dashboard({ customerId })` — fetches `/api/profile`; shows net-worth header, allocation donut (Recharts Pie), spending bar chart, and a "Nudges" list derived client-side (equity-drift, high-spend-category, low-emergency-fund, goal-on-track flags).

- [ ] **Step 1: Chart wrappers** (AllocationChart donut, SpendingChart bars) themed to palette.
- [ ] **Step 2: Dashboard** layout + nudge rules (pure helper `computeNudges(profile)` — add to `lib/finance/metrics.ts` with a unit test in `test/finance.test.ts`).
- [ ] **Step 3: Verify** dashboard renders for each customer; nudges differ by persona. Commit `git commit -m "feat: 360 dashboard with charts and proactive nudges"`.

---

### Task 12: Goal planner / simulator screen

**Files:**
- Create: `components/GoalPlanner.tsx`, `components/charts/ProjectionChart.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- `GoalPlanner({ customerId })` — pick a goal or retirement; sliders for monthly contribution + expected return; calls `/api/simulate`; renders projection line chart + "on track / shortfall" verdict; a button "Ask Dhan Sarthi about this" that jumps to the advisor pre-filled.

- [ ] **Step 1: Build planner UI** with sliders and Recharts line.
- [ ] **Step 2: Wire** to `/api/simulate`; compute verdict vs goal target.
- [ ] **Step 3: Verify** projections update live with sliders. Commit `git commit -m "feat: goal and retirement planner with live projections"`.

---

### Task 13: Polish, compliance, empty/error states, seed script

**Files:**
- Modify: multiple components; Create: `components/ErrorBoundary.tsx` (optional)

- [ ] **Step 1:** Loading skeletons, disabled states during API calls, toast/error on failure (never a blank screen).
- [ ] **Step 2:** Confirm disclaimers on advisor + planner; add "Escalate to human RM" button (opens a mock confirmation).
- [ ] **Step 3:** Responsive check at 390–420px; keyboard + mic permission handling.
- [ ] **Step 4:** `npm run build` passes clean. Commit `git commit -m "feat: polish, compliance surfaces, and resilient states"`.

---

### Task 14: README, architecture doc, license

**Files:**
- Create: `README.md`, `docs/architecture.md`, `LICENSE`

- [ ] **Step 1: README** — one-liner, problem/solution, features, screenshots placeholder, tech stack, "Run locally" (env setup with the two free keys), "How the fallback works", deploy steps, team credit (Flexi Masters — Avishkar Varpe), license.
- [ ] **Step 2: architecture.md** — the architecture diagram (ASCII/mermaid) + chat/voice data-flow + provider-swap note.
- [ ] **Step 3: LICENSE** — MIT.
- [ ] **Step 4: Commit** `git commit -m "docs: README, architecture, and license"`.

---

### Task 15: Deploy to Vercel + verify live URL

- [ ] **Step 1:** Confirm `npm run build` is clean.
- [ ] **Step 2:** Deploy (Vercel CLI or dashboard). Set `GEMINI_API_KEY` + `SARVAM_API_KEY` as project env vars (user provides values; Claude does not handle secrets).
- [ ] **Step 3:** Open live URL, run the demo loop end-to-end, capture prototype screenshots for the deck.
- [ ] **Step 4:** Confirm the public link works with fallbacks even if a key/quota is exhausted.

*(Deploy + key entry are performed by the user or with explicit confirmation; keys are never committed or handled by Claude.)*

---

### Task 16: Fill the IDBI submission deck

**Files:**
- Modify: a copy of the template `.pptx` (via the pptx skill).

- [ ] **Step 1:** Populate all 12 content slides from the spec: Team details (Flexi Masters / Avishkar Varpe), Brief, Opportunities/USP table, Features, Process/use-case flow, Wireframes (from real screenshots), Architecture diagram, Tech stack (Gemini + Sarvam + Next.js), Estimated cost (~₹0), Prototype snapshots, Benchmarking (latency of chat/voice round-trips), Future development, and Links (GitHub repo + demo video + live URL).
- [ ] **Step 2:** QA the deck (markitdown content check + visual render) per the pptx skill.
- [ ] **Step 3:** Deliver the filled deck.

---

### Task 17: Publish public GitHub repo

- [ ] **Step 1:** Confirm the target account. Current `gh` auth is `fl-avishkar-varpe` (work). User wants a personal account → user runs `gh auth login` with the personal account first (Claude never handles the password/token).
- [ ] **Step 2:** With explicit confirmation of repo name + public visibility, create + push: `gh repo create dhan-sarthi --public --source=. --remote=origin --push`.
- [ ] **Step 3:** Return the repo URL for the deck's Links slide.

---

## Self-Review

**Spec coverage:** Problem/solution/USP → Tasks 5,10,11 + deck (16). Features 1–7 → avatar/voice (8,9,10), 360 dashboard+nudges (11), planner (12), risk profiling via conversation (5 prompt), compliance/escalation (10,13). Architecture → Tasks 4,5,6 + doc (14). Tech stack → Task 1 deps. Synthetic data → Task 2. Resilience/fallbacks → Tasks 5,6,9. Deliverables: app (1–13), deploy (15), deck (16), repo (17). Security constraints → env-only keys, server-side calls, no secret handling (1,5,6,15,17). ✅ No gaps.

**Placeholder scan:** No "TBD/TODO" in task bodies; UI tasks specify concrete components and behaviors; logic tasks include real code/formulas. Screenshot placeholders in README/deck are legitimately pending real screenshots (produced in Task 15). ✅

**Type consistency:** `Customer/Holding/Transaction/Goal` (Task 2) used consistently in finance (3), profile builder (4), prompt (5), UI (10–12). `LlmProvider.complete(messages, system)` consistent across provider/gemini/sarvam/fallback and `/api/chat`. `useVoice` returns match VoiceController/ChatPanel usage. ✅
