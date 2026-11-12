import Link from "next/link";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-tight">
              Trust<span className="text-met">Pay</span>
            </span>
            <span className="tp-label hidden text-muted-foreground sm:inline">
              conditional payments
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              My contracts
            </Link>
            <Link
              href="/new"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              New request
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/60 py-5">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            PayPal sandbox only. An authorization is a temporary hold, not escrow —
            captures are most likely to succeed within the 3-day honor period, and the
            authorization itself remains valid for up to 29 days. TrustPay does not
            guarantee refunds or dispute outcomes.
          </p>
        </div>
      </footer>
    </div>
  );
}
