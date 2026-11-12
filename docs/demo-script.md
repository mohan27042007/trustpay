# TrustPay — demo video script

**Hard limit 3:00.** This script is ~410 words ≈ **2:50** at a natural pace.
Read it once with a timer before recording. If you run over 2:50, cut the
italicised lines — they're the designed slack.

Record **audio first**, to this script. Then record the screen freely; the edit
fits the visuals to your voice, not the other way round.

---

## A — Webcam · 0:00–0:18

> AI agents can already spend your money.
>
> What none of them can do is check whether you actually got what you paid for.
>
> I'm building TrustPay — the layer that decides whether the money should move at all.

*(Beat. Then cut to screen.)*

---

## B — Screen: dashboard · 0:18–0:33

> TrustPay turns a plain-English payment request into a machine-readable
> **Trust Contract**, holds the money under a real PayPal authorization, and
> releases it only when the delivered work satisfies that contract.

---

## C — Screen: new request · 0:33–1:00

> I'll hire a logo designer for a hundred and fifty dollars, and I'll say the
> logo has to carry our brand name and arrive as a vector file.
>
> Gemini drafts the contract — amount, deliverables, and the acceptance criteria
> as separate checkable clauses. *I can edit any of it.*
>
> And editing bumps the version, which cancels any approval I'd already given.
> You can't rewrite terms under a signature meant for something else.

---

## D — Screen: approve + PayPal · 1:00–1:25

> I approve the terms, and TrustPay creates a PayPal order with intent
> AUTHORIZE.
>
> That's a real sandbox authorization — a hold, not escrow. The money is
> committed, but nobody has been paid.

---

## E — Screen: payee view · 1:25–1:50

> The freelancer gets their own link. They deliver the work here — I never
> upload their evidence for them.
>
> This submission is a logo with no wordmark on it, exported as a PNG.
>
> Gemini checks it clause by clause, with a confidence score on each.

---

## F — Screen: CAPTURE BLOCKED · 1:50–2:25

> Now I try to release the money.
>
> **Blocked.**
>
> Four rules pass. Rule three fails, and it names the exact clause that failed —
> the brand name is missing.
>
> No capture call was ever sent to PayPal. And this is the part that matters:
> the AI didn't make that decision. A deterministic policy engine did. The
> model's verdict is only evidence the rules read.
>
> *If the model is unavailable, every clause degrades to "uncertain" — which
> holds the money instead of releasing it. It fails safe.*

---

## G — Screen: corrected delivery → released · 2:25–2:42

> Corrected logo. Every clause satisfied. The gate passes — and that's a real
> PayPal capture.

---

## H — Screen: proof bundle · 2:42–2:52

> Every contract exports a proof bundle: the terms, the evidence, the AI's
> verdicts, the human approvals, and the rule-by-rule decision, hashed so
> tampering shows.

---

## I — Webcam · 2:52–3:00

> Payments that carry their own proof.
>
> TrustPay.

---

## Things to say exactly

- "a hold, **not escrow**" — say it. PayPal judges will be listening for it.
- "**real** sandbox authorization" — distinguishes you from mockups.
- "a **deterministic** policy engine decided, not the model" — your thesis.
- Never: "guaranteed", "escrow", "we win disputes".

## Recording checklist

- [ ] Browser **zoomed to ~110%** so the rule text is readable at 1080p
- [ ] 1920×1080, no notifications, bookmarks bar hidden
- [ ] Use contract **tc_demo02** for the blocked moment (it's pre-seeded there)
- [ ] Move the mouse slowly — fast cursor looks frantic when zoomed
- [ ] Pause 2 seconds on **CAPTURE BLOCKED**; that's the shot
