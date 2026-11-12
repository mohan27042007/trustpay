import { formatMoney, type ContractRecord } from "@/lib/contract";
import { cn } from "@/lib/utils";

/**
 * Portfolio-level numbers.
 *
 * The product's work is mostly visible inside a single contract, so the list
 * view reads quiet without this. These four figures say at a glance that the
 * system is holding money, releasing some of it, and refusing the rest.
 */
export function StatsStrip({ records }: { records: ContractRecord[] }) {
  const held = records.filter((r) =>
    ["authorized", "evidence_submitted"].includes(r.status),
  );
  const released = records.filter((r) => r.status === "captured");

  const sum = (rs: ContractRecord[]) =>
    rs.reduce((t, r) => t + parseFloat(r.contract.amount.value), 0).toFixed(2);

  const currency = records[0]?.contract.amount.currency ?? "USD";

  const blocked = records.filter((r) =>
    r.audit.some((e) => e.type === "capture.blocked"),
  ).length;

  const criteria = records.flatMap((r) => r.verdicts);
  const met = criteria.filter((v) => v.status === "met").length;

  const stats = [
    {
      label: "Under hold",
      value: formatMoney({ value: sum(held), currency }),
      sub: `${held.length} contract${held.length === 1 ? "" : "s"}`,
      tone: "text-uncertain",
    },
    {
      label: "Released",
      value: formatMoney({ value: sum(released), currency }),
      sub: `${released.length} contract${released.length === 1 ? "" : "s"}`,
      tone: "text-met",
    },
    {
      label: "Releases refused",
      value: String(blocked),
      sub: "by policy rules",
      tone: blocked > 0 ? "text-blocked" : "text-muted-foreground",
    },
    {
      label: "Criteria assessed",
      value: `${met}/${criteria.length}`,
      sub: "met by evidence",
      tone: "text-foreground",
    },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-border bg-card/40 px-4 py-3.5"
        >
          <dt className="tp-label text-muted-foreground">{s.label}</dt>
          <dd className={cn("tp-value mt-1.5 text-xl font-semibold", s.tone)}>
            {s.value}
          </dd>
          <dd className="mt-0.5 text-[12px] text-muted-foreground">{s.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
