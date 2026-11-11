import { cn } from "@/lib/utils";
import { formatMoney, type TrustContract } from "@/lib/contract";

/**
 * The Trust Contract rendered as a document.
 *
 * Deliberately light on a dark app: the contract is the record of record, not
 * another dashboard card. All values are monospace so amounts, identifiers and
 * dates read as fixed terms rather than UI copy.
 */
export function ContractDocument({
  contract,
  className,
}: {
  contract: TrustContract;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border border-paper-border bg-paper text-paper-foreground shadow-[0_1px_0_rgba(255,255,255,0.04),0_18px_40px_-24px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-border/80 px-6 py-4">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em]">
            Trust Contract
          </h2>
          <p className="tp-value mt-1 text-[11px] text-paper-foreground/55">
            {contract.id} · v{contract.version}
          </p>
        </div>
        <div className="text-right">
          <p className="tp-value text-2xl font-semibold leading-none">
            {formatMoney(contract.amount)}
          </p>
          <p className="tp-label mt-1.5 text-paper-foreground/55">maximum</p>
        </div>
      </header>

      <div className="grid gap-x-8 gap-y-5 px-6 py-5 sm:grid-cols-2">
        <Field label="Purpose" className="sm:col-span-2">
          {contract.purpose}
        </Field>
        <Field label="Payee">
          <span className="tp-value text-[13px]">{contract.payee_email}</span>
        </Field>
        <Field label="Valid until">
          <span className="tp-value text-[13px]">
            {contract.limits.expiry.slice(0, 10)}
          </span>
        </Field>

        <Field label="Deliverables" className="sm:col-span-2">
          <ul className="space-y-1">
            {contract.deliverables.map((d) => (
              <li key={d} className="flex gap-2 text-[13px]">
                <span className="text-paper-foreground/35">—</span>
                {d}
              </li>
            ))}
          </ul>
        </Field>
      </div>

      <section className="border-t border-paper-border/80 px-6 py-5">
        <p className="tp-label mb-3 text-paper-foreground/55">
          Acceptance criteria · funds release only if all are met
        </p>
        <ol className="space-y-2.5">
          {contract.acceptance_criteria.map((c, i) => (
            <li key={c.id} className="flex gap-3">
              <span className="tp-value mt-0.5 text-[11px] text-paper-foreground/40">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="flex-1 text-[13px] leading-relaxed">
                {c.text}
                <span className="tp-label ml-2 rounded border border-paper-border px-1.5 py-0.5 text-paper-foreground/50">
                  {c.verifiable_by}
                </span>
              </p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="grid gap-x-8 gap-y-4 border-t border-paper-border/80 px-6 py-5 sm:grid-cols-2">
        <Field label="Permitted actions">
          <span className="tp-value text-[12px]">
            {contract.permitted_actions.join(" · ")}
          </span>
        </Field>
        <Field label="Release conditions">
          <span className="text-[12.5px]">
            {contract.capture_policy.requires_all_criteria_met
              ? "All criteria met"
              : "Criteria advisory"}
            {" + "}
            {contract.capture_policy.requires_human_approval
              ? "human approval"
              : "no approval required"}
          </span>
        </Field>
      </footer>
    </article>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="tp-label mb-1.5 text-paper-foreground/55">{label}</p>
      <div className="text-[13.5px] leading-relaxed">{children}</div>
    </div>
  );
}
