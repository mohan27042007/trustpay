# Defect report — post-submission audit

Six defects found by auditing the codebase after submission. Two were severe
enough to undermine the project's central claim. All are fixed; each entry
says why it happened, what it cost, and what changed.

A theme runs through all six: **each came either from scaffolding that was
never revisited, or from state being derived at the wrong moment.** None came
from the policy engine, which is the part that was written carefully and
tested.

| # | Defect | Severity | Root cause |
|---|---|---|---|
| 1 | Ungated capture endpoint | Critical | Scaffolding never removed |
| 2 | Proof bundle inverted its own verdict | Critical | State derived too late |
| 3 | Editing a contract funded the old amount | High | Cache key missing a dimension |
| 4 | New evidence silently erased human overrides | High | Wholesale replace, not merge |
| 5 | Settled contracts could be reopened | High | Guards only in the client |
| 6 | Criterion ids collided after a deletion | High | Id derived from array length |

---

## 1. An ungated endpoint could move money

**What it was.** `POST /api/paypal/capture` accepted an `authorizationId` and
captured it. No contract lookup, no `canCapture()`, no approval check. Its
`authorize`, `void` and `create-order` siblings were the same shape, and the
`/spike` page — linked from the landing page — was their client.

**Why it happened.** These were written first, deliberately: the fastest way
to prove a real PayPal round trip was a thin unstyled page hitting raw
endpoints. The plan was to gate them once the policy engine existed. The
engine got built, the *contract* routes were written on top of it, and the
spike routes were forgotten. The file carried its own reminder:

> `NOTE (Block B): this route will be gated by the deterministic policy engine`
> `so that capture is impossible unless canCapture() returns allowed:true.`
> `Right now it is the raw spike endpoint.`

A note to self is not a safeguard. Nothing failed, no test broke, and the
feature built on top looked correct — so nothing created pressure to return.

**What it cost.** This is the one defect that made the headline claim false.
The README says *"The AI can never move money"*; the contract capture route
calls itself *"the only endpoint in TrustPay that moves money"*. A sibling
file contradicted both. Anyone grepping for how money moves would have found
the unguarded path first and reasonably concluded the safety architecture was
decorative. The guarantee was real everywhere it was used — and absent from a
door left open beside it.

**The fix.** All four spike routes and the `/spike` page deleted; nothing else
referenced them. There is now exactly one code path that can move money, and
it runs the gate first.

---

## 2. The proof bundle said successful payments should have been blocked

**What it was.** Exporting the proof bundle for a *completed* contract gave:

```
tc_demo01  status=captured  captureId=DEMO-CAP-01
   proof says allowed=false  blocked_by=R5
     FAIL R5: Funds were already captured (capture DEMO-CAP-01).
```

**Why it happened.** `buildProofBundle` called `canCapture()` at export time.
That function is correct — rule R5 refuses to capture an already-captured
authorization, which is what prevents double-charging. But the bundle asked
it the wrong question: *"may this be captured now?"* instead of *"on what
basis was it captured then?"*

Re-deriving looked like the cleaner design — one source of truth, no
duplicated state. Right instinct, wrong application: a decision about a past
event cannot be recomputed from present state, because the event changed that
state.

**What it cost.** The proof bundle is the artifact behind the "payments that
carry their own proof" claim. For every successfully released contract it
asserted the release should not have happened. It was also nearly invisible —
the README's example command uses a contract that is *genuinely* blocked, so
the documented path looked right. It would have surfaced first for whoever
exported a completed contract, most likely a judge.

**The fix.** The verdict is written to the record when the gate runs, on both
the allowed and blocked paths, and the bundle reports what was recorded. Live
evaluation survives only as a fallback for contracts the gate has not reached,
and the bundle states which of the two it used.

---

## 3. Editing a contract funded the old amount

**Why it happened.** Two caches, each individually reasonable, combining
badly. Server side, the PayPal idempotency key was `order-${contract.id}`, and
PayPal replays the original order for a repeated key — which is exactly what
stops a double-click becoming two orders. But a new contract *version* is not
a new contract id, so an edited contract reused the key and PayPal returned the
pre-edit order. Client side, the prepare-on-mount effect guarded itself with a
one-shot boolean, so after an edit it never re-ran and kept serving the stale
order it already held.

**What it cost.** Editing terms is the demo's most distinctive moment — it is
what shows approval binding to a version. Anyone who edited the amount and
then funded would have held the *old* amount against the *new* terms, with no
indication. The versioning story would have been contradicted by the payment
immediately following it.

**The fix.** The key is scoped to `${id}-v${version}`, and the client ref
records which version it prepared for rather than merely that it had run.

---

## 4. New evidence erased human overrides

**Why it happened.** `r.verdicts = result.data` — the fresh assessment
replaced the array outright. Human overrides live *on* those verdict objects,
so they went with it. No audit entry recorded the loss.

**What it cost.** The override feature exists to make the point that AI is not
the final word: a human may overrule a verdict, but only with a written
justification attributed to them. Having that decision vanish without trace
inverts the claim, in the one product whose entire pitch is a trustworthy
audit trail.

**The fix.** Overrides are collected before the replacement and carried
forward onto the new verdicts, and the carry-forward is itself written to the
audit trail. A new submission now supersedes the AI's verdict only, never a
human's.

---

## 5. Settled contracts could be reopened

**Why it happened.** The UI gated these transitions; the API did not. The
payee view only shows the submit form in the right states, so the happy path
never exercised the gap. Guards that exist only in the client are not guards.

**What it cost.** Posting evidence to a captured contract reset its status to
`evidence_submitted`, after which the buyer UI recomputed `settled = false`
and rendered a live **Release funds** button over money that had already
moved. Approvals could likewise be recorded against finished contracts.

**The fix.** `evidence`, `approve` and `void` refuse with `409` on a settled
contract, with a readable message; `void` additionally refuses once a capture
exists, rather than forwarding a raw PayPal error.

---

## 6. Criterion ids collided after a deletion

**Why it happened.** New ids were `ac${criteria.length + 1}`. Delete `ac2`
from `[ac1, ac2, ac3]` and the length is 2, so the next addition is `ac3` —
which already exists. Array length is a count, not a high-water mark.

**What it cost.** Criterion ids are the join key between a criterion and its
verdict, and every consumer resolves them with `find()`, which returns the
first match. Two criteria sharing an id therefore shared one verdict: a single
`met` satisfied both. That is a way past rule R3 — the rule that holds the
money — reachable through ordinary use of the editor.

**The fix.** Ids are the first unused `acN`, computed against the ids actually
present.

---

## Also fixed

- **No attachment size limit anywhere.** A phone photo becomes ~10MB of base64
  that went into the request body, the record, the persisted file and the model
  call. Capped at 4MB with a clear message.
- **The whole evidence history was re-sent to the model on every submission**,
  so each round was slower than the last and would eventually exceed the
  request limit. Only the new submission is assessed now.

---

## What this says about the codebase

The defects cluster in two places, and neither is the hard part.

Four of the six are in **route handlers** — the glue written quickly between a
carefully designed engine and a carefully designed UI. The policy engine, with
fifteen tests encoding its three safety properties, produced no defects. Nor
did the schema layer.

The other cluster is **scaffolding that outlived its purpose**. The spike
routes did their job — they proved the PayPal integration worked on day one —
and then became a liability precisely because they still worked.

The tested core was never the risk. The risk was everything that looked
obviously fine and was therefore never checked.
