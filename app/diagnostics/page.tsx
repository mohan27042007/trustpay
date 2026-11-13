"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/trust/shell";
import { Spinner } from "@/components/trust/spinner";
import { cn } from "@/lib/utils";

type Check = {
  id: string;
  label: string;
  state: "ok" | "fail" | "warn";
  detail: string;
};

type Report = {
  checks: Check[];
  config: Record<string, string>;
  currency_advice: { currency: string; symptom: string; cause: string; fix: string };
};

const TONE = {
  ok: { ring: "border-met/35", text: "text-met", mark: "PASS" },
  warn: { ring: "border-uncertain/40", text: "text-uncertain", mark: "WARN" },
  fail: { ring: "border-blocked/45", text: "text-blocked", mark: "FAIL" },
} as const;

export default function DiagnosticsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostics", { cache: "no-store" });
      if (!res.ok) throw new Error(`The check failed to run (HTTP ${res.status}).`);
      setReport(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check could not be run.");
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="tp-label text-met">Setup check</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Is this instance wired up correctly?
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          Runs the calls TrustPay depends on and reports what came back. The
          PayPal check creates a one-dollar sandbox order and leaves it
          unapproved — nothing is charged.
        </p>

        <button
          onClick={run}
          disabled={running}
          className="mt-5 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-met disabled:opacity-40"
        >
          {running ? <Spinner /> : null}
          {running ? "Running…" : "Run again"}
        </button>

        {error ? (
          <p className="mt-6 rounded-lg border border-blocked/40 bg-blocked/10 px-4 py-3 text-[13px] text-blocked">
            {error}
          </p>
        ) : null}

        {running && !report ? (
          <div className="mt-6 space-y-3" aria-live="polite">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[76px] animate-pulse rounded-xl border border-border bg-card/40"
              />
            ))}
          </div>
        ) : null}

        {report ? (
          <>
            <ul className="mt-6 space-y-3">
              {report.checks.map((c) => {
                const tone = TONE[c.state];
                return (
                  <li
                    key={c.id}
                    className={cn("rounded-xl border bg-card/40 px-4 py-3.5", tone.ring)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-medium">{c.label}</p>
                      <span className={cn("tp-label shrink-0", tone.text)}>{tone.mark}</span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      {c.detail}
                    </p>
                  </li>
                );
              })}
            </ul>

            <section className="mt-8 rounded-xl border border-uncertain/35 bg-uncertain/[0.07] px-4 py-4 sm:px-5">
              <p className="tp-label text-uncertain">If checkout rejects your currency</p>
              <p className="mt-2 text-[13px] leading-relaxed">
                {report.currency_advice.symptom}
              </p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
                <strong className="font-medium text-foreground">Why:</strong>{" "}
                {report.currency_advice.cause}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                <strong className="font-medium text-foreground">Fix:</strong>{" "}
                {report.currency_advice.fix}
              </p>
              <p className="mt-3 border-t border-uncertain/25 pt-2.5 text-[12px] leading-relaxed text-muted-foreground">
                This one is guidance, not a check. PayPal only refuses the currency
                at the buyer&apos;s approval page, and offers no read-only way to ask
                which currencies a merchant accepts — so nothing above can confirm it
                either way.
              </p>
            </section>

            <section className="mt-6 rounded-xl border border-border px-4 py-4 sm:px-5">
              <p className="tp-label mb-3 text-muted-foreground">Configuration</p>
              <dl className="space-y-1.5">
                {Object.entries(report.config).map(([k, v]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                    <dt className="tp-value text-[12px] text-muted-foreground">{k}</dt>
                    <dd className="tp-value text-[12px]">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
