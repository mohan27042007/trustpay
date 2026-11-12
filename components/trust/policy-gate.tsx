"use client";

import { cn } from "@/lib/utils";
import type { PolicyDecision } from "@/lib/policy";

/**
 * The signature panel: the deterministic engine's verdict, rule by rule.
 *
 * Rules stamp in sequentially so the user sees a machine working through a
 * checklist rather than a result appearing from nowhere.
 */
export function PolicyGate({
  decision,
  explanation,
}: {
  decision: PolicyDecision;
  explanation?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border",
        decision.allowed ? "border-met/35 tp-sweep" : "border-blocked/40",
      )}
    >
      <header
        className={cn(
          "tp-glass-edge flex items-center justify-between gap-4 px-5 py-3.5",
          decision.allowed ? "bg-met/10" : "bg-blocked/10",
        )}
      >
        <div>
          <p className="tp-label text-muted-foreground">Policy engine</p>
          <p
            className={cn(
              "mt-0.5 text-sm font-semibold tracking-tight",
              decision.allowed ? "text-met" : "text-blocked",
            )}
          >
            {decision.allowed ? "Release permitted" : "Release blocked"}
          </p>
        </div>
        <span className="tp-label rounded-full border border-current/30 px-2.5 py-1 text-muted-foreground">
          {decision.rules.filter((r) => r.passed).length}/{decision.rules.length} rules pass
        </span>
      </header>

      <ol className="divide-y divide-border/70">
        {decision.rules.map((rule, i) => (
          <li
            key={rule.id}
            className={cn(
              "tp-stamp flex gap-3.5 px-5 py-3",
              !rule.passed && "bg-blocked/[0.06]",
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span
              className={cn(
                "tp-value mt-0.5 shrink-0 text-[11px] font-semibold",
                rule.passed ? "text-met" : "text-blocked",
              )}
            >
              {rule.id}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13px] font-medium">
                {rule.title}
                <span
                  className={cn(
                    "tp-label",
                    rule.passed ? "text-met" : "text-blocked",
                  )}
                >
                  {rule.passed ? "pass" : "fail"}
                </span>
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {rule.reason}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {explanation ? (
        <div className="border-t border-border/70 bg-card/60 px-5 py-3.5">
          <p className="tp-label mb-1 text-muted-foreground">In plain language</p>
          <p className="text-[13px] leading-relaxed">{explanation}</p>
        </div>
      ) : null}
    </section>
  );
}
