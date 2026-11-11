import { NextRequest, NextResponse } from "next/server";
import { authorizeOrder, extractAuthorizationId } from "@/lib/paypal";
import { errorResponse } from "@/lib/api-utils";

/** Place the authorization hold on an order the buyer has approved. */
export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: "orderId is required" },
        { status: 400 },
      );
    }

    const { data, raw } = await authorizeOrder(String(orderId));
    const authorizationId = extractAuthorizationId(data);

    return NextResponse.json({
      ok: true,
      orderId: data.id,
      status: data.status,
      authorizationId,
      raw: JSON.parse(raw),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
