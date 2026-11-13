"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ContractDocument } from "./contract-document";
import { CriteriaList } from "./criteria-list";
import { StatusBadge } from "./status-badge";
import { Spinner } from "./spinner";
import { formatMoney, type ContractRecord } from "@/lib/contract";

export function PayeeView({ initial }: { initial: ContractRecord }) {
  const [record, setRecord] = useState(initial);
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = record.contract.id;

  const canSubmit =
    record.status === "authorized" || record.status === "evidence_submitted";

  async function submit() {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim() || undefined,
          dataUrl: file?.dataUrl,
          name: file?.name,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Submission failed");
      setRecord(json.record);
      setText("");
      setFile(null);
      if (json.ai?.fallback) toast.warning("Assessment unavailable", { description: json.ai.note });
      else toast.success("Delivery assessed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="tp-glass tp-glass-edge sticky top-0 z-20 border-b border-border/80">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-6">
          <span className="text-[15px] font-semibold tracking-tight">
            Trust<span className="text-met">Pay</span>
          </span>
          <span className="tp-label rounded-full border border-sky-400/40 px-2.5 py-1 text-sky-300">
            Payee view
          </span>
          <Link
            href={`/contracts/${id}`}
            className="ml-auto text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            Switch to buyer view →
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {record.contract.purpose}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              You&apos;re being paid {formatMoney(record.contract.amount)} once the
              criteria below are satisfied.
            </p>
          </div>
          <StatusBadge status={record.status} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ContractDocument contract={record.contract} />

          <div className="space-y-6">
            {record.paypal.authorizationId ? (
              <p className="rounded-lg border border-met/30 bg-met/10 px-4 py-3 text-[13px] leading-relaxed text-met">
                The buyer has placed an authorization hold for{" "}
                {formatMoney(record.contract.amount)}. The money is committed but not
                yours yet — it is released when every criterion is met.
              </p>
            ) : (
              <p className="rounded-lg border border-uncertain/35 bg-uncertain/10 px-4 py-3 text-[13px] leading-relaxed text-uncertain">
                The buyer has not placed a hold yet. You can review the terms, but
                there is nothing to deliver against until they fund it.
              </p>
            )}

            {canSubmit ? (
              <section className="rounded-xl border border-border bg-card/40 p-5">
                <h2 className="mb-1.5 text-sm font-semibold tracking-tight">
                  Submit your delivery
                </h2>
                <p className="mb-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  Describe what you delivered and attach proof. TrustPay assesses it
                  against each criterion and shows you the result before the buyer
                  decides.
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  placeholder="What did you deliver?"
                  className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] outline-none focus:border-met/60"
                />
                <label className="mt-2.5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[12.5px] text-muted-foreground hover:border-foreground/30">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => setFile({ name: f.name, dataUrl: String(reader.result) });
                      reader.readAsDataURL(f);
                    }}
                  />
                  {file ? `Attached: ${file.name}` : "Attach an image (optional)"}
                </label>
                <button
                  onClick={submit}
                  disabled={busy || (!text.trim() && !file)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
                >
                  {busy ? <Spinner /> : null}
                  {busy ? "Assessing your delivery…" : "Submit delivery"}
                </button>
              </section>
            ) : null}

            <section className="rounded-xl border border-border p-5">
              <h2 className="mb-3.5 text-sm font-semibold tracking-tight">
                How your delivery was assessed
              </h2>
              <CriteriaList
                criteria={record.contract.acceptance_criteria}
                verdicts={record.verdicts}
              />
              <p className="mt-4 border-t border-border/70 pt-3 text-[12px] leading-relaxed text-muted-foreground">
                These are automated assessments, not decisions. The buyer reviews
                them and can disagree — with a recorded reason.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
