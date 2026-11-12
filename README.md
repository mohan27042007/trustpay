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
4. The payee submits a logo that is **missing the brand name**.
5. The policy engine returns **RELEASE BLOCKED**, naming rule `R3` and quoting the
   unmet criterion. No capture call is sent to PayPal.
6. Corrected evidence is submitted, the gate passes, and funds are captured for real.

A human can also **override** any AI verdict — but only with a written
justification, which is recorded in the audit trail against their name. The
point isn't to bypass the check; it's to make bypassing it attributable.

---

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

**Seeded, and labelled as such in the UI:** one demonstration contract
(`tc_demo01`) ships with placeholder PayPal identifiers so a fresh deploy is
never empty. The app shows a banner on that record saying so.

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
| **Google Gemini API** (`gemini-flash-latest`, configurable via `GEMINI_MODEL`) | Powers the product: contract drafting, multimodal evidence verification, plain-language decision explanations | [`lib/ai.ts`](lib/ai.ts) |
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

`/spike` is a deliberately unstyled page that exercises the raw PayPal
authorize→capture round trip.

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
