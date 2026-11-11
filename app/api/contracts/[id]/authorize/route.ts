import { NextRequest, NextResponse } from "next/server";
import { authorizeOrder, extractAuthorizationId } from "@/lib/paypal";
import { audit, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/** Place the authorization hold after the buyer approves in PayPal. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { orderId } = await req.json();
    const record = getContract(id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const { data, raw } = await authorizeOrder(String(orderId ?? record.paypal.orderId));
    const authorizationId = extractAuthorizationId(data);
    const expires =
      data.purchase_units?.[0]?.payments?.authorizations?.[0]?.expiration_time;

    const updated = updateContract(id, (r) => {
      r.paypal.orderId = data.id;
      r.paypal.authorizationId = authorizationId ?? undefined;
      r.paypal.authorizationExpiresAt = expires;
      r.status = "authorized";
      r.audit.push(
        audit(
          "paypal",
          "payment.authorized",
          `Authorization hold placed for ${r.contract.amount.currency} ${r.contract.amount.value}. This is a temporary hold, not escrow.`,
          JSON.parse(raw),
        ),
      );
      return r;
    });

    return NextResponse.json({ ok: true, authorizationId, record: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
