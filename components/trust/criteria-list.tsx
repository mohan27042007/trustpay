import { cn } from "@/lib/utils";
import {
  effectiveStatus,
  type AcceptanceCriterion,
  type CriterionVerdict,
} from "@/lib/contract";

const TONE = {
  met: { label: "Met", cls: "text-met", bar: "bg-met" },
  not_met: { label: "Not met", cls: "text-blocked", bar: "bg-blocked" },
  uncertain: { label: "Uncertain", cls: "text-uncertain", bar: "bg-uncertain" },
  missing: { label: "Not assessed", cls: "text-muted-foreground", bar: "bg-muted-foreground" },
} as const;

export function CriteriaList({
  criteria,
  verdicts,
}: {
  criteria: AcceptanceCriterion[];
  verdicts: CriterionVerdict[];
}) {
  return (
    <ul className="space-y-2.5">
      {criteria.map((c) => {
        const v = verdicts.find((x) => x.criterion_id === c.id);
        const status = effectiveStatus(v);
        const tone = TONE[status];
        const confidence = v?.confidence ?? 0;

        return (
          <li
            key={c.id}
            className="rounded-lg border border-border bg-card/60 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="flex-1 text-[13px] leading-relaxed">{c.text}</p>
              <span className={cn("tp-label shrink-0", tone.cls)}>{tone.label}</span>
            </div>

            {v ? (
              <>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  {v.rationale}
                </p>
                {v.citation ? (
                  <p className="mt-1 text-[12px] italic text-muted-foreground/75">
                    Evidence: {v.citation}
                  </p>
                ) : null}

                <div className="mt-2.5 flex items-center gap-2.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-700", tone.bar)}
                      style={{ width: `${Math.round(confidence * 100)}%` }}
                    />
                  </div>
                  <span className="tp-value text-[10.5px] text-muted-foreground">
                    {Math.round(confidence * 100)}% confidence
                  </span>
                </div>

                {v.human_override ? (
                  <p className="mt-2.5 rounded-md border border-uncertain/35 bg-uncertain/10 px-2.5 py-1.5 text-[12px] text-uncertain">
                    Human override to &ldquo;{v.human_override.status}&rdquo; by{" "}
                    {v.human_override.actor}: {v.human_override.justification}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                No evidence has been assessed against this criterion yet.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
