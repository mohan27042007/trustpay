"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/trust/shell";

const EXAMPLES = [
  "Hire a logo designer for $150. Pay only when the logo includes our brand name 'Ember Roast' and is delivered as a vector file.",
  "Pay sam@example.com $400 for a 3-page landing site. Release funds only when the pages are responsive and include a working contact form.",
  "Commission $90 of product photos. Only pay when there are at least 8 photos on a white background.",
];

export default function NewRequestPage() {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!request.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Could not draft the contract");
      if (json.ai?.fallback) {
        toast.warning("Drafted without the model", { description: json.ai.note });
      }
      router.push(`/contracts/${json.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="tp-label text-met">Step 1 of 4</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Describe the payment
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Write it the way you&apos;d say it. TrustPay drafts a structured contract with
          acceptance criteria — you review and edit it before any money is involved.
        </p>

        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Hire a logo designer for $150. Pay only when…"
          className="mt-7 w-full resize-y rounded-xl border border-border bg-card/60 px-4 py-3.5 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-met/60"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={submit}
            disabled={busy || !request.trim()}
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Drafting contract…" : "Draft Trust Contract"}
          </button>
          <span className="text-[12.5px] text-muted-foreground">
            No payment is made at this step.
          </span>
        </div>

        <div className="mt-10">
          <p className="tp-label mb-3 text-muted-foreground">Try one of these</p>
          <div className="space-y-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setRequest(ex)}
                className="block w-full rounded-lg border border-border bg-card/40 px-4 py-3 text-left text-[13px] leading-relaxed text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
