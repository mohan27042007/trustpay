import { NextResponse } from "next/server";
import { createAuthorizeOrder, getAccessToken } from "@/lib/paypal";
import { draftContract } from "@/lib/ai";
import { DEFAULT_CURRENCY } from "@/lib/contract";

type Check = {
  id: string;
  label: string;
  state: "ok" | "fail" | "warn";
  detail: string;
};

/**
 * Setup check.
 *
 * Runs the calls that actually have to work and reports what came back.
 * Where something cannot be verified it says so rather than implying it
 * passed — see currencyAdvice() below.
 */
export async function GET() {
  const checks: Check[] = [];

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const publicId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  if (!clientId || !secret) {
    checks.push({
      id: "paypal-credentials",
      label: "PayPal credentials present",
      state: "fail",
      detail:
        "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not both set. Copy .env.example to .env.local and fill them in from your sandbox app.",
    });
  } else {
    checks.push({
      id: "paypal-credentials",
      label: "PayPal credentials present",
      state: "ok",
      detail: "Both the client id and the secret are set.",
    });

    try {
      const token = await getAccessToken();
      checks.push({
        id: "paypal-oauth",
        label: "PayPal accepts the credentials",
        state: "ok",
        detail: `OAuth token issued (${token.length} characters).`,
      });

      try {
        const { data } = await createAuthorizeOrder({
          amount: "1.00",
          currency: DEFAULT_CURRENCY,
          description: "TrustPay setup check",
          referenceId: `diagnostic-${Date.now()}`,
        });
        const approve = data.links?.find(
          (l) => l.rel === "payer-action" || l.rel === "approve",
        );
        checks.push({
          id: "paypal-order",
          label: `Order creation in ${DEFAULT_CURRENCY}`,
          state: approve ? "ok" : "warn",
          detail: approve
            ? `Order ${data.id} created with intent=AUTHORIZE and an approval link. Nothing was charged — unapproved orders expire on their own.`
            : `Order ${data.id} was created, but PayPal returned no approval link.`,
        });
      } catch (err) {
        checks.push({
          id: "paypal-order",
          label: `Order creation in ${DEFAULT_CURRENCY}`,
          state: "fail",
          detail: err instanceof Error ? err.message : "Order creation failed.",
        });
      }
    } catch (err) {
      checks.push({
        id: "paypal-oauth",
        label: "PayPal accepts the credentials",
        state: "fail",
        detail:
          err instanceof Error
            ? err.message
            : "PayPal rejected the credentials. Check they are the sandbox pair rather than live.",
      });
    }
  }

  checks.push({
    id: "paypal-public-id",
    label: "Browser-side PayPal client id",
    state: !publicId ? "fail" : publicId === clientId ? "ok" : "warn",
    detail: !publicId
      ? "NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set, so the PayPal buttons cannot load. Next.js inlines this at build time, so on a hosted deploy it must be set before the build runs."
      : publicId === clientId
        ? "Set, and matches PAYPAL_CLIENT_ID."
        : "Set, but it does not match PAYPAL_CLIENT_ID. These are normally the same value.",
  });

  if (!process.env.GEMINI_API_KEY) {
    checks.push({
      id: "gemini",
      label: "Gemini reachable",
      state: "warn",
      detail:
        "GEMINI_API_KEY is not set. TrustPay still runs: contracts fall back to a deterministic parser, and every criterion is recorded as unassessed — which holds funds rather than releasing them.",
    });
  } else {
    const probe = await draftContract(
      "Pay alex@example.com $25 for a one-page summary, delivered as a PDF.",
    );
    checks.push({
      id: "gemini",
      label: "Gemini reachable",
      state: probe.fallback ? "warn" : "ok",
      detail: probe.fallback
        ? `No model in the chain answered, so the deterministic fallback was used. ${probe.note ?? ""} The free tier returns 503 under load; retrying usually clears it.`
        : `Answered by ${probe.model}, and the response passed schema validation.`,
    });
  }

  return NextResponse.json({
    checks,
    config: {
      paypal_api_base:
        process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com",
      currency: DEFAULT_CURRENCY,
      gemini_model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    },
    currency_advice: currencyAdvice(),
  });
}

/**
 * The currency trap — stated, not detected.
 *
 * A sandbox business account that cannot accept the configured currency does
 * not fail here: order creation succeeds, and PayPal only refuses at the
 * buyer's approval page with "this seller doesn't accept payments in your
 * currency". To whoever is testing, that reads as the login looping.
 *
 * PayPal offers no straightforward read-only way to ask which currencies a
 * merchant accepts, so this is guidance rather than a check — and saying so
 * is the point. A setup page is worthless if it implies it verified
 * something it did not.
 */
function currencyAdvice() {
  return {
    currency: DEFAULT_CURRENCY,
    symptom:
      "At the PayPal approval page: “This seller doesn’t accept payments in your currency.” It can look like the login is looping.",
    cause:
      "The sandbox business account behind your client id cannot accept this currency. The buyer’s account is not the problem — the merchant’s country decides it.",
    fix: "Create a sandbox Business account with country United States, then create a new REST app bound to it (the Create App screen has a dropdown for which business account owns the app — easy to miss) and use its credentials. Alternatively set NEXT_PUBLIC_TRUSTPAY_CURRENCY to a currency your existing merchant account accepts.",
  };
}
