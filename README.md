# Dhan Sarthi — an avatar-based wealth guide

> **IDBI Innovate 2026 · Problem Statement 1 — Digital Wealth Management**
> **Team Flexi Masters** · Lead: Avishkar Varpe

Human-RM-quality advisory for *every* customer, not just the ones with a
relationship manager. An avatar that talks, listens in the customer's language,
and grounds every suggestion in their real accounts — then puts the
recommendation through seven specialist desks, a compliance layer that can
refuse it, and a named human who signs for it.

**This runs on IDBI's live sandbox data.** Balances, deposits, transactions,
lien marks, Account Aggregator consent and KYC all come from the bank's own
APIs. Nothing on the customer screens is invented.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

That is enough to see the whole product. With no configuration it uses bundled
customer records and a deterministic advisor, so nothing hard-fails.

To run it the way it runs in the sandbox, see **Running against live IDBI data**
below — that needs to be on a whitelisted network.

### Requirements

- **Node 20 or newer** (built and tested on Node 24)
- npm 10+

### The scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload, on :3000 |
| `npm run build` | Production build (also what the deploy ships) |
| `npm start` | Serve the production build |
| `npm run test` | The full suite — 308 tests, about 3 seconds |
| `npm run test:watch` | Same, watching |

> **Port 3000 busy?** `PORT=3005 npm run dev`. On a machine running several
> projects this is the usual case.

---

## Running against live IDBI data

Two things are needed, and the first is the one that catches people out.

**1. You must be on a whitelisted network.** The IDBI gateway and the developer
portal are IP allow-listed. From anywhere else every call returns 403 and the
app silently falls back to bundled records — it will look like it works. The
whitelisted egress IPs are with the team lead; a coffee-shop wifi is not one of
them.

**2. Set the flag:**

```bash
IDBI_LIVE=true npm run dev
```

Check it is actually live: the header badge on the desktop shell reads **"Live
IDBI sandbox data"**, and the Portfolio tab attributes each source to the API
that supplied it (`IDBI 394 · 365`). If the sources read "Demo data", the
gateway is unreachable from your network.

### Environment

Copy `.env.example` to `.env`. Every variable is optional for local work.

| Variable | Effect if unset |
|---|---|
| `IDBI_LIVE` | Bundled customer records instead of the bank's |
| `SARVAM_API_KEY` | Voice falls back to the browser's Web Speech engine |
| `BEDROCK_MODEL_ID` | The advisor uses the deterministic provider |
| `AWS_REGION` | — |

> **Bedrock only works from the sandbox instance.** The grant is scoped to the
> instance's IAM role, so a laptop cannot reach it however it is configured.
> Locally the advisor answers from the deterministic provider, which is still
> grounded in the customer's real numbers. The live model answers on the
> instance, which is where it is judged.

---

## The deployed prototype

It runs on an EC2 instance in IDBI's sandbox, on a **private subnet with no
public IP, no internet-facing load balancer and no inbound rule**. That is the
bank's security posture, not an oversight, and it is why there is no public URL.

Access is an encrypted AWS Systems Manager port-forwarding session, the path
IDBI documented themselves:

```bash
# 1. In AWS CloudShell, signed in to the sandbox account
aws configure export-credentials --format env     # copy the three export lines

# 2. In a LOCAL terminal — CloudShell's localhost is not your laptop
#    macOS / Linux:
aws ssm start-session --region ap-south-1 \
  --target i-068518e286f36611e \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3000"],"localPortNumber":["8443"]}'

#    Windows (cmd or PowerShell) — the JSON form above fails here:
aws ssm start-session --region ap-south-1 --target i-068518e286f36611e --document-name AWS-StartPortForwardingSession --parameters portNumber="3000",localPortNumber="8443"

# 3. Open http://localhost:8443        (the app)
#            http://localhost:8443/rm  (the bank's console)
```

Two things that otherwise look like failures:

- **`http://`, not `https://`.** The encryption is the SSM session itself.
- **Keep `portNumber` at 3000.** The guide's worked example uses 443 because
  that is its example, not a requirement. If local 8443 is taken, change
  `localPortNumber` to 9443 and browse to `:9443`.

Leave the tunnel terminal open — closing it closes the tunnel. It outlives the
credentials that started it, so a token expiring mid-demo does not drop it.

---

## What is where

```
app/                 routes and API handlers
  api/aggregate        stage 1 — the customer's position, fanned out across IDBI's APIs
  api/discovery        stage 2 — the eight-slot voice interview
  api/committee        stage 3 — the deliberation, streamed as NDJSON
  api/compliance       the policy book's verdict on a proposal
  api/rm               the bank console: queue, decisions, deposit-flight scan
  api/import/cas       consolidated account statement parsing

lib/
  integrations/        IDBI gateway, Account Aggregator, source selection
  aggregate/           fan-out, completeness, typed positions
  discovery/           slot parsing, the interview state machine
  agents/              the seven desks, the debate round, the strategist
  compliance/          the policy book, 14 rules, the four-stage pipeline
  hitl/                escalation gate, RM queue, retention alerts
  audit/               append-only trail; both signatures land on one entry
  finance/             x-ray, SIP, tax, Black-Litterman, MPT
  import/              symbol search and CAS parsing
  market/              live Nifty index and quotes, with a synthetic fallback

components/          the phone app and the RM console
test/                308 tests
```

`docs/architecture.md` goes deeper.

### The three stages

1. **Aggregate** — the customer's position, from the bank's own APIs. Opens by
   admitting what the bank cannot see: IDBI has no holdings API, so stocks and
   funds come from the customer.
2. **Discover** — eight questions by voice in six languages. Deterministic
   parsing runs *before* any model. The plan is read back and signed only on a
   yes.
3. **Deliberate** — seven desks report, argue, and move their positions; a
   strategist reconciles them; compliance can refuse the result; a named human
   signs anything consequential.

**The committee is deterministic — no language model sits in the decision
path.** Same inputs, same recommendation, every time. That is what makes the
compliance result reproducible and stops a live demo becoming a coin toss.

---

## The customers

**With `IDBI_LIVE=true`** you get three real records from the bank's sandbox,
found by probing the enquiry API rather than assumed. Deliberately uneven,
because real customers arrive incomplete:

| Customer | Branch | What the bank holds |
|---|---|---|
| Priya Patil | 105 Pune | balances, 20 transactions, AA consent, KYC |
| Arjun Mehta | 106 Mumbai | balances, **no transactions** |
| Neha Singh | 107 Delhi | a term deposit, **no statement at all** |

Switching to Neha is worth doing: two desks abstain outright rather than infer
from missing data, and the advice she gets is visibly different.

> **Without the flag you will see a different cast** — Priya Sharma, Rajesh
> Kumar and Meena Iyer, the bundled records the product shipped with before the
> sandbox existed. That is not a bug, but it does mean local screenshots will
> not match the demo. The Portfolio tab is the tell: it attributes each source
> to "Demo data" rather than to the API that supplied it.

---

## Tests

```bash
npm run test
```

308 tests covering the finance maths, the desks and their debate, the
compliance rules, CAS parsing, the IDBI integration, the audit trail and the
discovery machine. They run offline in about three seconds.

---

## Things that will cost you an afternoon

Collected the hard way. Worth reading before changing anything here.

- **`next build` regenerates `.next/standalone` without `.next/static`.** Forget
  to copy it and every asset 404s — unstyled page, no data, looks like a crash.
  `cp -r` into an existing directory *nests* it, so remove the destination first.
- **Browsers cache the 404'd chunks.** After fixing the server you can still be
  looking at the broken page. Switch origin or port to get a clean cache.
- **`pkill -f "standalone/server.js"` does not kill it.** Next renames the
  process to `next-server`, so the old one survives and serves stale chunks
  while you debug the wrong thing.
- **A dynamic `import()` is invisible to Next's file tracer.** pdf.js shipped
  missing from the standalone build and every CAS upload answered "could not be
  read". Fixed with `outputFileTracingIncludes` in `next.config.ts` — and the
  worker file has to be listed too.
- **`react-three-fiber` cannot be used.** Its reconciler reads React internals
  that Next 15's bundled React no longer exposes, taking the whole page down.
  TalkingHead is the same class of dependency. The avatar is SVG on a CSS 3D
  stage instead.
- **"Works but sounds robotic" means voice is not working at all.** The route
  falls back to the browser's Web Speech engine, which is indistinguishable
  from success unless you check `engine` in the response.
- **Look at the UI in a browser, not through `innerText`.** Every real bug found
  late came from looking at a screenshot: a spending chart of reference numbers,
  a negative surplus printed in the positive colour, a plan asking a ₹1.2 lakh
  earner for ₹3.48 lakh a month.

---

## Privacy

A consolidated account statement is the most sensitive file in the product —
PAN, address and the whole portfolio. It is parsed **in memory and never
persisted**: not to disk, not to S3, not to a log. Verified against two real
statements; the application log contained no trace of either.

Customer data reaching the reasoning model stays inside IDBI's own AWS account,
on Bedrock. No third-party model provider sees it.

---

## Disclaimer

Dhan Sarthi gives **educational guidance, not investment advice**. Market
investments carry risk. Consult a SEBI-registered advisor or your relationship
manager before investing.

## License

MIT — see [LICENSE](LICENSE).
