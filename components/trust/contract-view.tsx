"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ContractDocument } from "./contract-document";
import { ContractEditor } from "./contract-editor";
import { CriteriaList } from "./criteria-list";
import { AuditTimeline } from "./audit-timeline";
import { PolicyGate } from "./policy-gate";
import { StatusBadge } from "./status-badge";
import type { ContractRecord } from "@/lib/contract";
import type { PolicyDecision } from "@/lib/policy";
import { formatMoney } from "@/lib/contract";

export function ContractView({
  initial,
  paypalClientId,
}: {
  initial: ContractRecord;
  paypalClientId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [record, setRecord] = useState(initial);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [explanation, setExplanation] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [justification, setJustification] = useState("");

  const id = record.contract.id;
  const isDemo = record.paypal.orderId?.startsWith("DEMO-") ?? false;

  async function call(path: string, body?: unknown) {
    const res = await fetch(`/api/contracts/${id}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return { res, json: await res.json() };
  }

  /** Authorize an order the buyer approved on PayPal, then clean the URL. */
  const authorizeOrder = useCallback(
    async (orderId: string) => {
      setBusy("authorize");
      try {
        const res = await fetch(`/api/contracts/${id}/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Authorization failed");
        setRecord(json.record);
        toast.success("Funds held");
        router.replace(`/contracts/${id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Authorization failed");
      } finally {
        setBusy(null);
      }
    },
    [id, router],
  );

  // Returning from PayPal's approval page: ?approved=1&token=<orderId>
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current) return;
    if (searchParams.get("cancelled")) {
      handledReturn.current = true;
      toast.info("PayPal approval was cancelled");
      router.replace(`/contracts/${id}`);
      return;
    }
    const token = searchParams.get("token");
    if (searchParams.get("approved") && token) {
      handledReturn.current = true;
      void authorizeOrder(token);
    }
  }, [searchParams, authorizeOrder, id, router]);

  /** Full-page approval: works where the PayPal popup is blocked. */
  async function fundViaRedirect() {
    setBusy("redirect");
    try {
      const { json } = await call("/fund");
      if (!json.ok) throw new Error(json.error ?? "Could not create order");
      if (!json.approveUrl) throw new Error("PayPal did not return an approval link");
      window.location.href = json.approveUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  async function approve(scope: "fund" | "capture") {
    setBusy(scope);
    try {
      const { json } = await call("/approve", { scope, actor: "buyer@trustpay.demo" });
      if (!json.ok) throw new Error(json.error);
      setRecord(json.record);
      toast.success(scope === "fund" ? "Terms approved" : "Release approved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function submitEvidence() {
    if (!evidenceText.trim() && !evidenceFile) return;
    setBusy("evidence");
    try {
      const { json } = await call("/evidence", {
        text: evidenceText.trim() || undefined,
        dataUrl: evidenceFile?.dataUrl,
        name: evidenceFile?.name,
      });
      if (!json.ok) throw new Error(json.error);
      setRecord(json.record);
      setEvidenceText("");
      setEvidenceFile(null);
      setDecision(null);
      if (json.ai?.fallback) {
        toast.warning("Verification unavailable", { description: json.ai.note });
      } else {
        toast.success("Evidence assessed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  /** The demo moment: this either releases funds or refuses and says why. */
  async function attemptCapture() {
    setBusy("capture");
    try {
      const { json } = await call("/capture", {});
      setDecision(json.decision ?? null);
      setExplanation(json.explanation);
      if (json.ok) {
        setRecord(json.record);
        toast.success("Funds released");
      } else if (json.blocked) {
        toast.error("Capture blocked by policy", {
          description: json.decision?.blockedBy?.reason,
        });
      } else {
        toast.error(json.error ?? "Capture failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function overrideVerdict(criterionId: string, status: "met" | "not_met") {
    if (justification.trim().length < 3) {
      toast.error("A justification is required to override a verdict.");
      return;
    }
    setBusy("override");
    try {
      const { json } = await call("/override", {
        criterionId,
        status,
        justification,
        actor: "buyer@trustpay.demo",
      });
      if (!json.ok) throw new Error(json.error);
      setRecord(json.record);
      setOverriding(null);
      setJustification("");
      setDecision(null);
      toast.success("Verdict overridden", { description: "Recorded in the audit trail." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function voidHold() {
    setBusy("void");
    try {
      const { json } = await call("/void", { reason: "Buyer declined the delivery" });
      if (!json.ok) throw new Error(json.error);
      setRecord(json.record);
      toast.success("Authorization voided");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const hasFundApproval = record.approvals.some(
    (a) => a.scope === "fund" && a.contract_version === record.contract.version,
  );
  const hasCaptureApproval = record.approvals.some(
    (a) => a.scope === "capture" && a.contract_version === record.contract.version,
  );
  const settled = record.status === "captured" || record.status === "voided";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {record.contract.purpose}
          </h1>
          <p className="tp-value mt-1 text-[12px] text-muted-foreground">
            {record.contract.id} · v{record.contract.version}
            {record.paypal.authorizationId
              ? ` · auth ${record.paypal.authorizationId}`
              : ""}
          </p>
        </div>
        <StatusBadge status={record.status} />
      </div>

      {isDemo ? (
        <p className="mb-5 rounded-lg border border-uncertain/35 bg-uncertain/10 px-4 py-2.5 text-[12.5px] text-uncertain">
          Seeded demonstration record — its PayPal identifiers are placeholders, not
          real sandbox calls. Create a new contract to exercise the live sandbox.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {editing ? (
            <section className="rounded-xl border border-border bg-card/40 p-5">
              <h2 className="mb-4 text-sm font-semibold tracking-tight">Edit terms</h2>
              <ContractEditor
                contract={record.contract}
                onCancel={() => setEditing(false)}
                onSaved={(next) => {
                  setRecord(next as typeof record);
                  setEditing(false);
                  setDecision(null);
                }}
              />
            </section>
          ) : (
            <div className="relative">
              <ContractDocument contract={record.contract} />
              {record.status === "draft" || record.status === "approved" ? (
                <button
                  onClick={() => setEditing(true)}
                  className="tp-label absolute right-4 top-16 rounded-md border border-paper-border bg-paper px-2.5 py-1.5 text-paper-foreground/70 transition-colors hover:text-paper-foreground"
                >
                  Edit terms
                </button>
              ) : null}
            </div>
          )}

          <section className="rounded-xl border border-border p-5">
            <h2 className="mb-3.5 text-sm font-semibold tracking-tight">
              Acceptance criteria
            </h2>
            <CriteriaList
              criteria={record.contract.acceptance_criteria}
              verdicts={record.verdicts}
            />

            {record.paypal.authorizationId && !settled ? (
              <div className="mt-4 border-t border-border/70 pt-4">
                {overriding ? (
                  <div className="space-y-2.5">
                    <p className="text-[12.5px] text-muted-foreground">
                      Overriding:{" "}
                      <span className="text-foreground">
                        {record.contract.acceptance_criteria.find((c) => c.id === overriding)?.text}
                      </span>
                    </p>
                    <textarea
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      rows={2}
                      placeholder="Why are you overriding the assessment? This is recorded."
                      className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-uncertain/60"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => overrideVerdict(overriding, "met")}
                        disabled={busy !== null}
                        className="rounded-md border border-met/45 px-3 py-1.5 text-[12.5px] text-met disabled:opacity-40"
                      >
                        Mark met
                      </button>
                      <button
                        onClick={() => overrideVerdict(overriding, "not_met")}
                        disabled={busy !== null}
                        className="rounded-md border border-blocked/45 px-3 py-1.5 text-[12.5px] text-blocked disabled:opacity-40"
                      >
                        Mark not met
                      </button>
                      <button
                        onClick={() => { setOverriding(null); setJustification(""); }}
                        className="rounded-md border border-border px-3 py-1.5 text-[12.5px] text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] text-muted-foreground">
                      Disagree with an assessment?
                    </span>
                    {record.contract.acceptance_criteria.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => setOverriding(c.id)}
                        className="tp-label rounded-md border border-border px-2.5 py-1.5 text-muted-foreground transition-colors hover:border-uncertain/50 hover:text-uncertain"
                      >
                        Override {String(i + 1).padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-6">
          {/* ---- Step: approve terms ---- */}
          {record.status === "draft" ? (
            <Panel step="Step 2" title="Review and approve the terms">
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                Nothing has been paid. Approving records your signature against
                contract v{record.contract.version}. If the terms change later, this
                approval stops counting and you&apos;ll be asked again.
              </p>
              <button
                onClick={() => approve("fund")}
                disabled={busy !== null}
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                {busy === "fund" ? "Recording…" : "Approve terms"}
              </button>
            </Panel>
          ) : null}

          {/* ---- Step: fund via PayPal ---- */}
          {record.status === "approved" && hasFundApproval ? (
            <Panel step="Step 3" title="Hold the funds">
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                Creates a PayPal order with{" "}
                <span className="tp-value">intent=AUTHORIZE</span> and places a hold for{" "}
                {formatMoney(record.contract.amount)}. A hold is not escrow — PayPal
                still controls the funds.
              </p>
              {paypalClientId ? (
                <>
                  <button
                    onClick={fundViaRedirect}
                    disabled={busy !== null}
                    className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {busy === "redirect"
                      ? "Opening PayPal…"
                      : busy === "authorize"
                        ? "Placing hold…"
                        : "Continue on PayPal"}
                  </button>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
                    You&apos;ll approve on PayPal and return here, where the hold is
                    placed automatically. Sign in with your sandbox buyer account.
                  </p>
                </>
              ) : (
                <p className="rounded-md border border-blocked/40 bg-blocked/10 px-3 py-2.5 text-[12.5px] text-blocked">
                  NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set, so PayPal cannot be reached.
                  Add it to .env.local and restart the dev server.
                </p>
              )}
            </Panel>
          ) : null}

          {/* ---- Step: evidence ---- */}
          {(record.status === "authorized" || record.status === "evidence_submitted") ? (
            <Panel step="Step 4" title="Submit delivery evidence">
              <p className="mb-3.5 text-[13px] leading-relaxed text-muted-foreground">
                The payee submits proof. TrustPay assesses it against each criterion
                and reports confidence — it never decides the payment on its own.
              </p>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                rows={3}
                placeholder="Describe what was delivered…"
                className="w-full resize-y rounded-lg border border-border bg-card/60 px-3 py-2.5 text-[13px] outline-none focus:border-met/60"
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
                    reader.onload = () =>
                      setEvidenceFile({ name: f.name, dataUrl: String(reader.result) });
                    reader.readAsDataURL(f);
                  }}
                />
                {evidenceFile ? `Attached: ${evidenceFile.name}` : "Attach an image (optional)"}
              </label>
              <button
                onClick={submitEvidence}
                disabled={busy !== null || (!evidenceText.trim() && !evidenceFile)}
                className="mt-3 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                {busy === "evidence" ? "Assessing…" : "Submit and assess"}
              </button>
            </Panel>
          ) : null}

          {/* ---- Step: release decision ---- */}
          {record.paypal.authorizationId && !settled ? (
            <Panel step="Step 5" title="Release decision">
              {!hasCaptureApproval ? (
                <>
                  <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                    Rule R4 requires a human to approve releasing funds for this exact
                    contract version. Try releasing without it to see the gate refuse.
                  </p>
                  <button
                    onClick={() => approve("capture")}
                    disabled={busy !== null}
                    className="mb-2.5 w-full rounded-md border border-border px-4 py-2.5 text-sm disabled:opacity-40"
                  >
                    {busy === "capture" ? "Recording…" : "Approve release"}
                  </button>
                </>
              ) : null}
              <button
                onClick={attemptCapture}
                disabled={busy !== null}
                className="w-full rounded-md bg-met px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-40"
              >
                {busy === "capture" ? "Checking policy…" : "Release funds"}
              </button>
              <button
                onClick={voidHold}
                disabled={busy !== null}
                className="mt-2.5 w-full rounded-md border border-blocked/40 px-4 py-2.5 text-sm text-blocked disabled:opacity-40"
              >
                {busy === "void" ? "Voiding…" : "Refuse and return funds"}
              </button>
            </Panel>
          ) : null}

          {decision ? <PolicyGate decision={decision} explanation={explanation} /> : null}

          <section className="rounded-xl border border-border p-5">
            <h2 className="mb-4 text-sm font-semibold tracking-tight">Audit trail</h2>
            <AuditTimeline events={record.audit} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Panel({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <p className="tp-label text-met">{step}</p>
      <h2 className="mb-3 mt-1.5 text-sm font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
