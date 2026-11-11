import Link from "next/link";
import { Shell } from "@/components/trust/shell";
import { StatusBadge } from "@/components/trust/status-badge";
import { listContracts } from "@/lib/store";
import { formatMoney } from "@/lib/contract";
import { connection } from "next/server";

// Reads mutable server state on every request, so this route blocks
// rather than prerendering. (Next 16 Cache Components.)
export const instant = false;

export default async function HomePage() {
  // Reads mutable server state, so opt out of prerendering.
  await connection();
  const records = listContracts();

  return (
    <Shell>
      <section className="tp-grid-bg border-b border-border/70">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <p className="tp-label text-met">AI proposes · policy decides · human approves</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Let AI transact.
            <br />
            <span className="text-muted-foreground">Let TrustPay protect.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            TrustPay turns a natural-language payment request into a machine-readable{" "}
            <strong className="font-medium text-foreground">Trust Contract</strong>, holds
            the money under a PayPal authorization, and releases it only when submitted
            evidence satisfies the contract. A deterministic policy engine makes that
            call — never the model.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/new"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Create a Trust Contract
            </Link>
            <Link
              href="/spike"
              className="rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              PayPal sandbox check
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Contracts</h2>
          <span className="tp-label text-muted-foreground">{records.length} total</span>
        </div>

        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              No contracts yet. Describe a payment in plain English to create one.
            </p>
            <Link
              href="/new"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              New request
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {records.map((r) => {
              const met = r.verdicts.filter((v) => v.status === "met").length;
              return (
                <li key={r.contract.id}>
                  <Link
                    href={`/contracts/${r.contract.id}`}
                    className="group block rounded-xl border border-border bg-card/50 p-5 transition-colors hover:border-foreground/25 hover:bg-card"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-[14.5px] font-medium leading-snug">
                        {r.contract.purpose}
                      </p>
                      <StatusBadge status={r.status} className="shrink-0" />
                    </div>
                    <p className="tp-value mt-3 text-xl font-semibold">
                      {formatMoney(r.contract.amount)}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="tp-value text-[11px] text-muted-foreground">
                        {r.contract.id} · v{r.contract.version}
                      </span>
                      <span className="tp-label text-muted-foreground">
                        {met}/{r.contract.acceptance_criteria.length} criteria met
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Shell>
  );
}
