"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { toast } from "sonner";
import { Spinner } from "./spinner";
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
  const [editing, setEditing] = useState(false);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  // Pre-created PayPal order, so clicking the button is instant rather than
  // waiting on a round trip to PayPal while nothing appears to happen.
  const [preparedOrder, setPreparedOrder] = useState<{ orderId: string; approveUrl: string | null } | null>(null);
  const [preparing, setPreparing] = useState(false);

  const id = record.contract.id;
  const isDemo = record.paypal.orderId?.startsWith("DEMO-") ?? false;
  const payeeLink =
    typeof window === "undefined" ? `/payee/${id}` : `${window.location.origin}/payee/${id}`;

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

  const readyToFund =
    record.status === "approved" &&
    !record.paypal.authorizationId &&
    Boolean(paypalClientId);

  // Create the order up front so the button responds immediately on click.
  // Tracked per contract version rather than as a one-shot flag: editing the
  // terms mints a new version, and the order prepared for the previous one
  // holds the previous amount. A plain boolean left that stale order in place.
  const preparedFor = useRef<number | null>(null);
  const version = record.contract.version;
  useEffect(() => {
    if (!readyToFund || preparedFor.current === version) return;
    preparedFor.current = version;
    setPreparedOrder(null);
    setPreparing(true);
    fetch(`/api/contracts/${id}/fund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setPreparedOrder({ orderId: json.orderId, approveUrl: json.approveUrl ?? null });
        else toast.error(json.error ?? "Could not prepare the PayPal order");
      })
      .catch(() => toast.error("Could not reach PayPal"))
      .finally(() => setPreparing(false));
  }, [readyToFund, id, version]);

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
      // Reacting to an external signal (PayPal redirected back with an approved
      // order), not deriving state from props. The guard above makes this run
      // exactly once. Deferred so the state update lands outside the effect body.
      queueMicrotask(() => void authorizeOrder(token));
    }
  }, [searchParams, authorizeOrder, id, router]);

  /** Full-page approval: works where the PayPal popup is blocked. */
  async function fundViaRedirect() {
    setBusy("redirect");
    try {
      if (preparedOrder?.approveUrl) {
        window.location.href = preparedOrder.approveUrl;
        return;
      }
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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
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
                  {preparing ? (
                    <p className="mb-3 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
                      <Spinner /> Preparing your PayPal order…
                    </p>
                  ) : preparedOrder ? (
                    <p className="tp-value mb-3 rounded-md border border-met/30 bg-met/10 px-3 py-2 text-[11.5px] text-met">
                      Order {preparedOrder.orderId} ready
                    </p>
                  ) : null}

                  {busy === "redirect" || busy === "authorize" ? (
                    <p className="mb-3 flex items-center gap-2 rounded-md border border-uncertain/40 bg-uncertain/10 px-3 py-2.5 text-[12.5px] text-uncertain">
                      <Spinner />
                      {busy === "authorize"
                        ? "Placing the authorization hold…"
                        : "Opening PayPal…"}
                    </p>
                  ) : null}

                  <div
                    className={`tp-paypal-surface${preparing ? " pointer-events-none opacity-50" : ""}`}
                  >
                    <PayPalScriptProvider
                      options={{
                        clientId: paypalClientId,
                        intent: "authorize",
                        currency: record.contract.amount.currency,
                      }}
                    >
                      <PayPalButtons
                        style={{
                          layout: "vertical",
                          color: "gold",
                          shape: "rect",
                          label: "paypal",
                          height: 45,
                        }}
                        disabled={preparing || busy !== null}
                        createOrder={async () => {
                          // Normally instant: the order was created on mount.
                          if (preparedOrder) return preparedOrder.orderId;
                          const { json } = await call("/fund");
                          if (!json.ok) throw new Error(json.error ?? "Could not create order");
                          setPreparedOrder({ orderId: json.orderId, approveUrl: json.approveUrl ?? null });
                          return json.orderId;
                        }}
                        onApprove={async (data) => {
                          await authorizeOrder(data.orderID);
                        }}
                        onCancel={() => toast.info("PayPal approval was cancelled")}
                        onError={(e) => toast.error(String(e))}
                      />
                    </PayPalScriptProvider>
                  </div>

                  <button
                    onClick={fundViaRedirect}
                    disabled={busy !== null || preparing}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    {busy === "redirect" ? <Spinner /> : null}
                    {busy === "redirect" ? "Opening PayPal…" : "Continue on PayPal (full page)"}
                  </button>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    Use the full-page option if the buttons above don&apos;t open — some
                    browsers block PayPal&apos;s popup. Sign in with your sandbox buyer
                    account.
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

          {/* ---- Step: hand off to the payee ---- */}
          {(record.status === "authorized" || record.status === "evidence_submitted") ? (
            <Panel step="Step 4" title="Waiting on the payee">
              <p className="mb-3.5 text-[13px] leading-relaxed text-muted-foreground">
                The freelancer delivers the work and submits evidence from their own
                view. Send them this link.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={payeeLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="tp-value flex-1 rounded-md border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(payeeLink);
                    toast.success("Payee link copied");
                  }}
                  className="rounded-md border border-border px-3 py-2 text-[12.5px] hover:bg-secondary"
                >
                  Copy
                </button>
              </div>
              <a
                href={`/payee/${id}`}
                className="mt-2.5 inline-block text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Open the payee view →
              </a>
              {record.evidence.length > 0 ? (
                <p className="mt-3.5 rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[12.5px] text-sky-300">
                  {record.evidence.length} submission
                  {record.evidence.length === 1 ? "" : "s"} received and assessed.
                </p>
              ) : null}
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
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-tight">Audit trail</h2>
              <a
                href={`/api/contracts/${id}/proof`}
                download
                className="tp-label rounded-md border border-border px-2.5 py-1.5 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                ↓ Proof bundle
              </a>
            </div>
            <AuditTimeline events={record.audit} />
            <p className="mt-4 border-t border-border/70 pt-3 text-[12px] leading-relaxed text-muted-foreground">
              The proof bundle is a single tamper-evident JSON record of why funds
              did or did not move: the agreed terms, the evidence, the AI&apos;s
              advisory verdicts, the human approvals and the rule-by-rule policy
              evaluation, each section hashed under one digest.
            </p>
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
