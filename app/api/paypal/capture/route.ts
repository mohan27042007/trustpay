import { NextRequest, NextResponse } from "next/server";
import { captureAuthorization } from "@/lib/paypal";
import { errorResponse } from "@/lib/api-utils";

/**
 * Release held funds.
 *
 * NOTE (Block B): this route will be gated by the deterministic policy engine
 * so that capture is impossible unless canCapture() returns allowed:true.
 * Right now it is the raw spike endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const { authorizationId, amount, currency } = await req.json();
    if (!authorizationId) {
      return NextResponse.json(
        { ok: false, error: "authorizationId is required" },
        { status: 400 },
      );
    }

    const { data, raw } = await captureAuthorization(String(authorizationId), {
      amount,
      currency,
    });

    return NextResponse.json({
      ok: true,
      captureId: data.id,
      status: data.status,
      amount: data.amount,
      raw: JSON.parse(raw),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
