import { cn } from "@/lib/utils";
import type { ContractStatus } from "@/lib/contract";

const MAP: Record<ContractStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-muted-foreground/40 text-muted-foreground" },
  approved: { label: "Terms approved", cls: "border-sky-400/40 text-sky-300" },
  authorized: { label: "Funds held", cls: "border-uncertain/50 text-uncertain" },
  evidence_submitted: { label: "Evidence submitted", cls: "border-sky-400/40 text-sky-300" },
  captured: { label: "Released", cls: "border-met/50 text-met" },
  voided: { label: "Voided", cls: "border-blocked/50 text-blocked" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ContractStatus;
  className?: string;
}) {
  const s = MAP[status];
  return (
    <span
      className={cn(
        "tp-label inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        s.cls,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
