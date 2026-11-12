# TrustPay — demo script

All screen recording, voiceover only. No camera.

~345 spoken words ≈ **2:40**. The beats below are rough — don't perform to a
stopwatch. If a sentence feels awkward in your mouth, change it. You know this
project; it should sound like you explaining it, not reading it.

Record the **audio first**, straight through. Then record the screen however
feels natural — the edit fits the picture to your voice.

---

### Opening — on the dashboard *(~20s)*

AI agents can spend your money now. They book things, they buy things, they pay
people.

What none of them do is check whether you actually got what you paid for.

That's why we built TrustPay.

---

### What it is *(~15s)*

You describe a payment in plain English. TrustPay turns it into a contract the
system can check, holds the money with PayPal, and only releases it when the
work matches what you agreed.

---

### Making a contract *(~30s)*

So — hire a logo designer, a hundred and fifty dollars. The logo needs our brand
name on it, and it has to be a vector file.

Gemini reads that and writes the contract. The amount, what gets delivered, and
the conditions — each one separate, each one checkable.

We can edit any of it. And if we do, the version goes up, and any approval we
already gave stops counting. So nobody can quietly change the terms after
someone signed off.

---

### Holding the money *(~20s)*

We approve the terms, and TrustPay creates a PayPal order set to authorize.

That's a real hold, on the sandbox. It's not escrow — we're careful about that.
The money's committed, but nobody's been paid.

---

### The freelancer's side *(~25s)*

The freelancer gets their own link. They send the work from there — we don't
upload it for them.

This one's a logo with no brand name on it, saved as a PNG.

Gemini checks it against each condition, and says how sure it is about each one.

---

### It refuses *(~35s)*

Now we try to release the money.

It won't.

Four rules pass. The third one fails — and it tells us exactly why. The brand
name isn't there.

Nothing went to PayPal. No capture happened.

And this is the part we care about most: the AI didn't make that call. A plain
set of rules did. The model just hands in evidence. The rules decide.

If the model goes down, every condition comes back "unsure" — and unsure keeps
the money held. It fails in the safe direction.

---

### Fixed, and released *(~15s)*

Corrected logo. Everything checks out. The gate opens — and that's a real
capture, on PayPal.

---

### Proof *(~15s)*

Every contract gives you a proof file. The terms, the evidence, what the AI
said, who approved it, and how the rules decided. It's all hashed, so you'd know
if anyone changed it.

---

### Close *(~10s)*

Payments that come with their own proof.

That's TrustPay.

---

## Worth saying word for word

- "a **real hold** — **it's not escrow**" (PayPal judges listen for this)
- "**the AI didn't make that call. A plain set of rules did.**" — the whole point
- "**unsure keeps the money held**" — the safety story in five words

Never say: *guaranteed*, *escrow*, *we win disputes*.

## Before you hit record

- Browser at ~110% zoom so the rule text is readable at 1080p
- 1920×1080, notifications off, bookmarks bar hidden
- **tc_demo02** is already sitting at the blocked moment — use it
- Move the mouse slowly
- Hold still for two seconds on **CAPTURE BLOCKED**. That's the shot.
