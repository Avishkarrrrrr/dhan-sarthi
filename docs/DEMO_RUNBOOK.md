# Dhan Sarthi — Evaluation Runbook

**For:** IDBI Innovate 2026, Track 01 · Team Flexi Masters
**Deployed:** 22 September 2026, 12:30 IST · instance `i-068518e286f36611e`, ap-south-1

---

## 1. How the application is reached

The prototype runs in the Bank's sandbox on a **private subnet with no public IP,
no internet-facing load balancer and no inbound rule**. Access is an encrypted
AWS Systems Manager port-forwarding session, exactly as described in the Bank's
`SSM_Session_Manager_Private_Application_Access_Guide`.

```
Laptop browser → http://localhost:8443
      │  AWS CLI + Session Manager plugin
      ▼  encrypted SSM session
EC2 i-068518e286f36611e   (private subnet, no public IP)
      ▼  TCP 3000
Dhan Sarthi  (systemd: dhan-sarthi.service)
```

### Start the tunnel

```bash
# 1. AWS CloudShell, signed in to account 952931855568
aws configure export-credentials --format env     # copy the three export lines

# 2. LOCAL terminal (CloudShell's localhost is not your laptop)
#    Linux / macOS — guide §9
aws ssm start-session --region ap-south-1 \
  --target i-068518e286f36611e \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3000"],"localPortNumber":["8443"]}'

# 3. Browser
open http://localhost:8443
```

**On Windows, use the shorthand form (guide §8) — not the one above.** The guide's
§12 is explicit that the Linux/macOS JSON form produces a parameter parsing error
in `cmd.exe`, and a bank's evaluators are likely on Windows:

```
aws ssm start-session --region ap-south-1 --target i-068518e286f36611e --document-name AWS-StartPortForwardingSession --parameters portNumber="3000",localPortNumber="8443"
```

> **Two things that differ from the guide's worked example, and both matter:**
>
> 1. The guide forwards remote **443**; this application listens on **3000**.
>    Keep `portNumber` at `3000`.
> 2. The guide opens `https://localhost:8443`. This application speaks **plain
>    HTTP** behind the tunnel (TLS is the SSM session itself), so open
>    **`http://localhost:8443`**. `https://` will fail to connect.
>
> 3. If local **8443** is already in use, guide §12 applies: pick another
>    *local* port, e.g. `localPortNumber 9443`, and browse to
>    `http://localhost:9443`. **`portNumber` stays 3000 in every case** — that
>    is the remote port, and it is not negotiable.
>
> Leave the tunnel terminal open — closing it closes the tunnel. The tunnel
> outlives the credentials that started it, so an expiring token mid-demo does
> not drop the session.

**Two screens:**

| URL | What it is |
|---|---|
| `http://localhost:8443/` | The customer application — desktop shell with the phone on the right |
| `http://localhost:8443/rm` | The bank's RM console — approval queue, audit trail |

Open the app in a **normal desktop browser window** (≈1280px or wider). The page
is designed as a presentation shell: product framing and the customer picker on
the left, the phone app itself in a device frame on the right. At phone widths
the shell drops away and only the phone renders — correct behaviour, but not the
view to present from.

---

## 2. What is live and what is not

Verified on the instance on 22 September 2026:

| | Status |
|---|---|
| IDBI API gateway from the instance | **Reachable** — API 365 returns Priya Patil's live balances (HTTP 200) |
| Bedrock | `anthropic.claude-3-haiku-20240307-v1:0` via instance role |
| Voice | Sarvam `bulbul:v3`, speaker `shruti`, eight languages |
| Market data | Live NSE quotes, synthetic fallback with reduced confidence |
| Committee | **Deterministic — no LLM in the decision path.** Same inputs, same output |

**The three sandbox customers are the bank's own records, discovered by probing
the enquiry API — not bundled personas.** They are deliberately uneven, because
real customers arrive incomplete:

| Customer | CIF / account | Branch | What the bank holds |
|---|---|---|---|
| Priya Patil | 98655854 / 660100100003 | 105 Pune | balances + 20 transactions + AA consent + KYC |
| Arjun Mehta | 77712345 / 660100100004 | 106 Mumbai | balances, **no transactions** |
| Neha Singh | 88823456 / 660100100008 | 107 Delhi | term deposit, **no statement at all** |

---

## 3. The demo — one customer, one continuous story (~6 minutes)

Run it as **Priya Patil**. Every step exercises something real.

**0. Onboarding (optional, 30 seconds).** "Replay the onboarding journey" on the
left. Consent screen ticks off **API 590 → 591 → 739** live and reads back
*"Verified Priya Patil · XXXXXXXX0003 · Pune"* — the bank's own Account
Aggregator rails, not a mock.

**1. Portfolio tab — "where this picture comes from: 3 of 7."** Open by admitting
the bank holds less than half the picture. The savings row shows **₹5,000 under
lien** — IDBI's own API 362, the one the Bank annotated *"investible vs locked
balance in wealth advisory"*. Advising on money the bank has already locked is
the mistake this API exists to prevent.

**2. Import — "+ Add" or Import CAS.** Search *Infosys*, 40 shares at ₹820, with a
buy date. The **live NSE price appears before you commit**. The X-ray lights up:
**IT is 100% of equity**, and the tax desk now has a cost basis it did not have.

**3. Trust tab → "Tell me what you are planning for."** Switch the language to
**हिंदी**. Eight questions by voice, checklist filling as slots are captured. The
avatar reads the whole plan back in one sentence and waits for a **हाँ** —
nothing is signed until the customer says yes.

**4. Convene → the committee.** Seven desks report on live Nifty / RSI / VIX, then
**"Where they disagreed"** — a desk answers another *by name*, quotes its
argument, and moves its own number because of it. Then the strategist, then
compliance. *(Verified live: 7 desk views → 3 debate exchanges → strategist →
compliance → escalation ticket → final.)*

**5. Tax panel.** The total in the largest type on the screen, with its conditions
printed beside it: old regime only, three-year lock-in.

**6. Action Card → Approve.** *"It is her money — she always decides."*

**7. `/rm` in a second tab.** The same recommendation is waiting in the bank's
queue. **Type a name**, then Approve. The audit row now carries **both
signatures**. `/api/rm/decide` refuses an unnamed approval — an approval nobody
signed proves nothing while looking like it proves something.

**8. Scan for deposit flight.** On live data it reports honestly that the feed
carries **no counterparty narration**, in those words, because "no risk found"
would read as a clean bill of health when it is an absence of evidence. On the
mock book it finds ₹4.5 lakh moving to a broker and **withholds the counter-offer
because it failed suitability**.

**9. Switch to Neha Singh.** A term-deposit-only customer gets visibly different
advice, and the X-ray says plainly there is nothing to look through.

**Closing line:**

> *"The customer consents to her money. The bank signs for its advice. Compliance
> blocks the rule violations automatically; the RM handles the judgment calls —
> one accountable human signature on every consequential recommendation, at a
> hundred thousand customers a day."*

**If the wifi dies:** the committee is deterministic and the market module has a
synthetic fallback, so steps 3–7 still run. Only the live quote in step 2 and the
Lens tab need the internet.

---

## 4. Three absences in the sandbox, and what we did about them

All three were verified across all 25 sandbox APIs, not assumed. Each one drives
a design decision we would defend in production.

**No holdings API.** Zero occurrences of `demat`, `equity`, `holding`, `isin`,
`nav`, `folio`. The AA statement APIs return a bank-account-only schema; the
portal tab is *Retail Liabilities*. **So every stock and fund comes from the
customer**, via search-and-add or a CAS upload — the same plumbing INDmoney and
Kuvera use. It is the honest architecture, not a workaround.

**No merchant narration.** Every statement row is `txnDesc: "S1 TXN 7"`. So the
spending view shows money in, money out and the largest debits rather than six
bars labelled "S1 TXN 19" — and the deposit-flight radar says out loud that it
cannot attribute outflows on live data.

**No purchase dates.** No cost basis, so the tax desk cannot compute holding
periods from bank data alone. It reports 80C headroom and the tax drag on deposit
interest, lowers its own confidence, and says plainly that the rest needs a
portfolio import.

---

## 5. Redeploying

Everything is scripted. From AWS CloudShell as `FlexiMasters`:

```bash
aws s3 cp ~/dhan-sarthi.tar.gz s3://dbd-fleximaster-bucket/dhan-sarthi.tar.gz --region ap-south-1
# then SSM Run Command: extract to app.new, chown ssm-user, swap, restart,
# health-check http://127.0.0.1:3000/ and roll app.prev back on anything but 200.
```

`~/idbi/deploy.sh` does all of it in one command from a laptop that has
credentials for account `952931855568`. A deploy that half-works is worse than
one that did not happen, so the health check and rollback are not optional.

The previous build stays at `/home/ssm-user/app.prev`.
