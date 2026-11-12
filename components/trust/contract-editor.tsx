"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { TrustContract } from "@/lib/contract";

/**
 * Editing terms before funding.
 *
 * Saving bumps `contract.version`, which invalidates every prior approval
 * (policy rule R4 binds an approval to the version it was given for). This is
 * what stops an approved contract from being quietly rewritten afterwards.
 */
export function ContractEditor({
  contract,
  onSaved,
  onCancel,
}: {
  contract: TrustContract;
  onSaved: (next: unknown) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(contract.amount.value);
  const [payee, setPayee] = useState(contract.payee_email);
  const [criteria, setCriteria] = useState(
    contract.acceptance_criteria.map((c) => ({ ...c })),
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const value = parseFloat(amount).toFixed(2);
      const res = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payee_email: payee,
          amount: { value, currency: contract.amount.currency },
          acceptance_criteria: criteria.filter((c) => c.text.trim()),
          capture_policy: {
            ...contract.capture_policy,
            max_capture_amount: { value, currency: contract.amount.currency },
          },
          limits: {
            ...contract.limits,
            max_amount: { value, currency: contract.amount.currency },
          },
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Could not save");
      toast.success(`Saved as v${json.record.contract.version}`, {
        description: "Previous approvals no longer apply to these terms.",
      });
      onSaved(json.record);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-uncertain/35 bg-uncertain/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-uncertain">
        Saving creates <strong>v{contract.version + 1}</strong> and invalidates any
        approval given for v{contract.version}. You&apos;ll be asked to approve again.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="tp-label mb-1.5 block text-muted-foreground">Amount</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="tp-value w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-met/60"
          />
        </label>
        <label className="block">
          <span className="tp-label mb-1.5 block text-muted-foreground">Payee email</span>
          <input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="tp-value w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-met/60"
          />
        </label>
      </div>

      <div>
        <span className="tp-label mb-2 block text-muted-foreground">
          Acceptance criteria
        </span>
        <div className="space-y-2">
          {criteria.map((c, i) => (
            <div key={c.id} className="flex gap-2">
              <textarea
                value={c.text}
                rows={2}
                onChange={(e) => {
                  const next = [...criteria];
                  next[i] = { ...next[i], text: e.target.value };
                  setCriteria(next);
                }}
                className="flex-1 resize-y rounded-md border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-met/60"
              />
              <select
                value={c.verifiable_by}
                onChange={(e) => {
                  const next = [...criteria];
                  next[i] = {
                    ...next[i],
                    verifiable_by: e.target.value as typeof c.verifiable_by,
                  };
                  setCriteria(next);
                }}
                className="tp-label h-fit rounded-md border border-border bg-card px-2 py-2 outline-none"
              >
                <option value="vision">vision</option>
                <option value="text">text</option>
                <option value="human">human</option>
              </select>
              <button
                onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}
                className="h-fit rounded-md border border-border px-2.5 py-2 text-[12px] text-muted-foreground hover:border-blocked/50 hover:text-blocked"
                aria-label="Remove criterion"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            setCriteria([
              ...criteria,
              { id: `ac${criteria.length + 1}`, text: "", verifiable_by: "text" },
            ])
          }
          className="mt-2 rounded-md border border-dashed border-border px-3 py-1.5 text-[12.5px] text-muted-foreground hover:border-foreground/30 hover:text-foreground"
        >
          + Add criterion
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {busy ? "Saving…" : `Save as v${contract.version + 1}`}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
