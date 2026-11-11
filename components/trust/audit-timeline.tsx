import { cn } from "@/lib/utils";
import type { AuditEvent } from "@/lib/contract";

const ACTOR = {
  ai: { label: "AI", cls: "border-sky-400/40 text-sky-300" },
  policy: { label: "Policy", cls: "border-met/45 text-met" },
  human: { label: "Human", cls: "border-foreground/30 text-foreground" },
  paypal: { label: "PayPal", cls: "border-uncertain/45 text-uncertain" },
  system: { label: "System", cls: "border-muted-foreground/35 text-muted-foreground" },
} as const;

/**
 * The audit trail distinguishes who acted — model, deterministic engine, human
 * or PayPal — so an AI recommendation is never mistaken for a decision.
 */
export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">No activity recorded yet.</p>
    );
  }
  return (
    <ol className="relative space-y-4 pl-5">
      <span
        aria-hidden
        className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border"
      />
      {[...events].reverse().map((e, i) => {
        const a = ACTOR[e.actor];
        return (
          <li key={`${e.at}-${i}`} className="relative">
            <span
              aria-hidden
              className="absolute -left-5 top-1.5 size-[11px] rounded-full border-2 border-background bg-border"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("tp-label rounded border px-1.5 py-0.5", a.cls)}>
                {a.label}
              </span>
              <span className="tp-value text-[11px] text-muted-foreground">
                {e.at.replace("T", " ").slice(0, 19)}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed">{e.summary}</p>
          </li>
        );
      })}
    </ol>
  );
}
