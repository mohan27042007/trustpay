import { NextRequest, NextResponse } from "next/server";
import { createAuthorizeOrder } from "@/lib/paypal";
import { errorResponse } from "@/lib/api-utils";

/**
 * Create a PayPal order with intent=AUTHORIZE.
 * No money moves here — the buyer must still approve.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const amount = String(body.amount ?? "150.00");
    const currency = String(body.currency ?? "USD");
    const description = String(body.description ?? "TrustPay contract");
    const referenceId = String(body.referenceId ?? `tp-${Date.now()}`);

    const { data, raw } = await createAuthorizeOrder({
      amount,
      currency,
      description,
      referenceId,
    });

    return NextResponse.json({
      ok: true,
      orderId: data.id,
      status: data.status,
      raw: JSON.parse(raw),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
