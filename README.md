# TrustPay

**Conditional payments for agentic commerce.** Let AI transact. Let TrustPay protect.

TrustPay turns a natural-language payment request into a **machine-readable Trust
Contract**, holds the money under a real PayPal authorization, and releases it
only when submitted evidence satisfies the contract's acceptance criteria.

The ordering is the whole idea:

> **AI proposes → a deterministic policy engine decides → a human approves → PayPal executes.**

The AI can never move money. It drafts terms and assesses evidence; a pure,
network-free rule engine decides whether funds may be released, and it says
exactly which clause failed when they may not.

---

## The demo moment

Most payment demos show a happy path. The interesting part of TrustPay is
watching it **refuse**:

1. Describe a job in plain English — *"Hire a logo designer for $150. Pay only
   when the logo includes our brand name 'Ember Roast'."*
2. TrustPay drafts a Trust Contract. You edit and approve it. **Editing bumps the
   contract version, which invalidates any prior approval** — so terms can't be
   rewritten under a signature given for something else.
3. A real PayPal sandbox order is created with `intent=AUTHORIZE` and a hold is placed.
4. The payee — on their own link-shareable view at `/payee/<id>`, with no buyer
   controls — submits a logo that is **missing the brand name**.
5. The policy engine returns **RELEASE BLOCKED**, naming rule `R3` and quoting the
   unmet criterion. No capture call is sent to PayPal.
6. Corrected evidence is submitted, the gate passes, and funds are captured for real.

A human can also **override** any AI verdict — but only with a written
justification, which is recorded in the audit trail against their name. The
point isn't to bypass the check; it's to make bypassing it attributable.

---

Three seeded contracts ship with the app so a fresh deploy is never empty:
`tc_demo01` (released), plus **`tc_demo02` and `tc_demo03`, which sit at the
refusal moment** —
four rules pass, R3 fails. Open it and press *Release funds* to see the gate
refuse without driving the whole flow first.

## Proof bundle

Every contract exports a **proof bundle**: one JSON record of the agreed terms,
the evidence considered, the AI's advisory verdicts, the human approvals and the
rule-by-rule policy evaluation. Each section is hashed and the bundle carries a
digest over those hashes, so alteration is detectable by recomputation.

It is **tamper-evident, not signed** — we make no cryptographic non-repudiation
claim. Uploaded file bytes are hashed rather than embedded.

```bash
curl -s localhost:3000/api/contracts/tc_demo02/proof | jq '.policy_evaluation.blocked_by'
# "R3"
```

## Architecture

```
natural language
      │
      ▼
 [ AI: draft ]────────► Trust Contract (JSON, versioned, human-approved)
                              │
                              ▼
                     PayPal Orders v2  intent=AUTHORIZE
                              │
                   buyer approves ──► authorization hold
                              │
 evidence ──► [ AI: verify ] ─┤  per-criterion: met / not_met / uncertain
                              ▼
                   ╔══════════════════════╗
                   ║  POLICY ENGINE R1-R5 ║   ← pure, deterministic, tested
                   ╚══════════════════════╝
                      │ allowed        │ blocked
                      ▼                ▼
                   capture          409 + reason   (PayPal is never called)
```

### The policy engine ([`lib/policy.ts`](lib/policy.ts))

No model calls. No network. Pure function, so every verdict is reproducible.

| Rule | Check |
|------|-------|
| **R1** | Capture amount is within the contract limit, and currency matches |
| **R2** | `capture` is among the contract's `permitted_actions` |
| **R3** | Every acceptance criterion is met (or human-overridden *with justification*) |
| **R4** | A human approved release **for this contract version** |
| **R5** | The PayPal authorization exists, is unexpired, and is uncaptured |

Three properties worth calling out, each covered by a test:

- **Uncertainty is not consent.** An `uncertain` verdict fails R3. Funds stay held.
- **Editing a contract invalidates approval.** Approvals bind to `contract.version`,
  so terms cannot be rewritten under a signature that was given for something else.
- **If the AI is unavailable, every criterion degrades to `uncertain`** — which
  *holds* money rather than releasing it. The failure mode is safe by construction.

```bash
npm test   # 15 tests
```

---

## What is real, and what is not

Being precise about this, because it matters for evaluating the project.

**Real, against the live PayPal sandbox:**
- OAuth2 client-credentials token (`/v1/oauth2/token`)
- Create order with `intent=AUTHORIZE` (`/v2/checkout/orders`)
- Buyer approval via the PayPal JS SDK buttons
- Authorize (`/v2/checkout/orders/{id}/authorize`)
- Capture (`/v2/payments/authorizations/{id}/capture`)
- Void (`/v2/payments/authorizations/{id}/void`)
- Idempotency keys (`PayPal-Request-Id`) on every mutating call

**Real AI:** Google Gemini drafts contracts and assesses evidence (multimodal),
with all output validated against Zod schemas before use. Because the free tier
returns 503 under load, calls retry across a chain of models with a bounded
deadline, and the model that actually answered is named in the audit trail.

**Seeded, and labelled as such in the UI:** three demonstration contracts
(`tc_demo01`, `tc_demo02`, `tc_demo03`) ship with placeholder `DEMO-` PayPal
identifiers so a fresh deploy is never empty. The app shows a banner on each of
them saying so. Any contract you create yourself uses the live sandbox.

**Not built, and not claimed:** Payouts, the Disputes API, and webhooks are out
of scope for this submission.

### Capability boundaries

- **A PayPal authorization is not escrow.** It is a temporary hold. Captures are
  most likely to succeed within the **3-day honor period**; the authorization
  remains valid up to **29 days**.
  ([docs](https://developer.paypal.com/checkout/delay-capture))
- TrustPay does **not** guarantee refunds, reverse account restrictions, or
  determine dispute outcomes. PayPal and the parties do.
- AI verdicts are **advisory input to the rules**, never a decision.

---

## AI tools used

| Tool | Role | Where |
|---|---|---|
| **Google Gemini API** (`gemini-2.5-flash` by default, configurable via `GEMINI_MODEL`; falls back across a chain of Flash models when one is unavailable) | Powers the product: contract drafting, multimodal evidence verification, plain-language decision explanations | [`lib/ai.ts`](lib/ai.ts) |
| **Claude Code (Claude Opus 5)** | Development tool — used to architect, write and test this codebase. Not part of the running product. | — |

**Prompt-injection handling:** uploaded evidence and user text are untrusted.
They're fenced in `<untrusted>` tags with explicit instructions to treat embedded
commands as manipulation attempts to report, not obey. More importantly, the
model's output cannot select an action — only `lib/policy.ts` can.

---

## Running it

Requires Node 22+.

```bash
git clone https://github.com/mohan27042007/trustpay.git
cd trustpay
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | [PayPal sandbox app](https://developer.paypal.com/dashboard/applications/sandbox) (Merchant type) |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Same value as `PAYPAL_CLIENT_ID` |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) (free tier) |

```bash
npm run dev     # http://localhost:3000
npm test        # policy engine tests
```

To complete a payment you also need a **sandbox buyer account**
(PayPal Developer Dashboard → *Testing Tools → Sandbox Accounts*); use its email
and password in the PayPal approval popup.

Verify your credentials in one command:

```bash
npx tsx scripts/verify-setup.ts
```

It exercises PayPal OAuth, order creation, contract drafting and evidence
verification, and prints which Gemini model responded.

Or open **`/diagnostics`** in the running app, which does the same checks and
explains anything that fails.

### Troubleshooting

**"This seller doesn't accept payments in your currency"** at the PayPal
approval page — and it can look like the login is simply looping. The sandbox
*business* account behind your client id cannot accept the configured currency;
the buyer's account is not the problem, the merchant's country decides this. A
sandbox business account created with country **India** will reject USD, for
example. Create a US-country sandbox Business account, create a new REST app
bound to it (the Create App screen has a dropdown for which business account
owns the app — easy to miss), and use those credentials. Alternatively set
`NEXT_PUBLIC_TRUSTPAY_CURRENCY` to a currency your merchant account accepts.
Note that PayPal only refuses this at the approval page, so order creation
succeeds and nothing earlier in the flow warns you.

**Gemini returns 503.** The free tier sheds load under pressure. Calls retry
across a chain of Flash models with a bounded deadline; if they all fail, every
criterion is recorded as `uncertain`, which holds funds rather than releasing
them. Retrying usually clears it.

**The PayPal buttons do nothing when clicked.** The popup is being blocked —
common in embedded browsers. Use the **Continue on PayPal (full page)** button
underneath, which takes the redirect route instead.

### No authentication, by design

There are no accounts and no access control: anyone holding a contract id can
act as either party, and the payee page links to the buyer view. That keeps the
demo openable by a reviewer with a single URL. A real deployment would put
identity in front of every route under `app/api/contracts/`. Nothing in the
policy engine depends on its absence.

### A note on PayPal's buttons

The PayPal JS SDK buttons open a popup, which embedded and some hardened
browsers block silently. TrustPay therefore uses PayPal's **full-page approval
redirect**: `/fund` returns the approval URL, and the contract page
auto-authorizes on return via `?approved=1&token=<orderId>`. This is the
dependable path and the one used in the demo.

### Without credentials

The app still runs. Contract drafting falls back to a deterministic parser, and
evidence verification records every criterion as `uncertain` — which correctly
keeps funds held rather than releasing them on an unchecked assumption.

---

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui · Zod ·
`@paypal/react-paypal-js` · `@google/genai`

State lives in a process-local store with JSON persistence
([`lib/store.ts`](lib/store.ts)) — deliberately not a database, to keep the
deploy dependency-free.

## License

MIT — see [LICENSE](LICENSE).
