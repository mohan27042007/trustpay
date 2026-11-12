## Inspiration

AI agents can book things, buy things, pay people. That part is basically solved.

What nobody is doing is checking the other side of it — whether the thing you paid for actually showed up, and actually matched what was promised. Paying is easy to automate. Being sure you got what you paid for isn't.

So we built the layer that decides whether the money should move at all.

## What it does

You describe a payment the way you'd say it out loud:

> *"Hire a logo designer for $150. Pay only when the logo includes our brand name 'Ember Roast' and it's delivered as a vector file."*

TrustPay turns that into a **Trust Contract** — the amount, the deliverables, and each condition as its own separately checkable clause. You can edit any of it before anything happens.

Then it creates a real PayPal order with `intent=AUTHORIZE`. That places a hold. The money is committed, but nobody has been paid, and it is **not escrow** — PayPal still controls the funds.

The freelancer gets their own link and submits the work from there. We don't upload their evidence for them. Gemini checks the submission against each clause and reports how confident it is about each one.

Then the part we care about most. When you try to release the money, a **deterministic policy engine** decides — not the AI:

```
PASS  R1  Requested USD 150.00 is within the USD 150.00 contract limit.
PASS  R2  This contract permits the capture action.
FAIL  R3  1 of 3 criteria are not satisfied:
          "The logo includes the brand name 'Ember Roast'".
PASS  R4  Approved by buyer@trustpay.demo for contract v2.
PASS  R5  Authorization DEMO-AUTH-03 is live until 2026-12-10.
```

Four rules pass. The third fails, and it names the exact clause that failed. **No capture call is ever sent to PayPal.**

Every contract also exports a **proof bundle** — the terms, the evidence, what the AI said, who approved it, and how the rules decided. Each section hashed under one digest, so tampering is detectable.

## How we built it

Next.js 16 and TypeScript, one app, PayPal secrets server-side only.

PayPal Orders v2 handles the real flow: create order with `intent=AUTHORIZE`, authorize, then capture or void. All live against the sandbox, with idempotency keys (`PayPal-Request-Id`) on every mutating call so a double-click can't double-charge anyone.

Gemini 2.5 Flash does two jobs — drafting contracts from natural language, and assessing evidence multimodally. Everything it returns is validated against a Zod schema before it reaches the rest of the system. Uploaded evidence is fenced as untrusted input, because a logo file is a prompt-injection surface like any other.

The important part is deliberately boring. `lib/policy.ts` is a pure function — no network, no model calls — evaluating five rules, each returning a sentence a human can read. Those sentences are exactly what renders on screen. It's reproducible, and it's covered by tests, which is the whole reason the AI isn't allowed to make the decision.

## Challenges we ran into

**A PayPal sandbox business account created in India rejects USD.** It doesn't surface as a currency error either — it looks like an endless login loop. That cost us real time before we worked out the merchant account was the problem, not our integration. Switching to a US sandbox business account fixed it immediately. The order currency is now configurable rather than hardcoded.

**Gemini's free tier returns 503 under load.** AI calls now retry across a chain of models with a bounded deadline. If they all fail, every clause comes back "unsure" — and unsure keeps the money held. Failing toward *not paying* felt like the only defensible direction.

**The model inverted a verdict.** On a blocked capture it once wrote *"Your payment is now being released."* That would have told someone they'd been paid when the funds were held. The prompt now states the verdict unambiguously, and the response is checked against it — any contradiction falls back to deterministic text.

## Accomplishments that we're proud of

Three safety properties, each with a test behind it:

- **Uncertainty is not consent.** An `uncertain` verdict fails rule R3 and the money stays held.
- **Editing a contract invalidates approval.** Approvals bind to a contract version, so terms can't be rewritten under a signature given for something else.
- **An unavailable model fails toward holding funds**, never toward releasing them.

## What we learned

Mostly that constraining the AI made the product better, not weaker.

Once we stopped asking the model to decide and started treating its output as evidence that a plain set of rules reads, the whole thing got easier to explain, easier to test, and easier to trust. The interesting demo isn't watching software pay someone — it's watching it refuse, and say exactly why.

## What's next for TrustPay

Payouts and the Disputes API, webhook-driven case updates, and multi-currency contracts. We deliberately left those out rather than ship them half-working — a trust product with stubbed parts isn't a trust product.

---

**What's real:** every PayPal call in the demo is a live sandbox call — OAuth, order creation, authorization, capture and void. Gemini genuinely drafts the contracts and assesses the evidence.

**What's seeded:** two demonstration contracts ship with the app so a fresh install isn't empty. They carry `DEMO-` identifiers and the UI labels them as seeded on screen.

**What we don't claim:** TrustPay does not provide escrow, guarantee refunds, or determine dispute outcomes. A PayPal authorization is a temporary hold — captures are most likely to succeed within the 3-day honor period, and the authorization remains valid up to 29 days.
