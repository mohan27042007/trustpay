import { NextRequest, NextResponse } from "next/server";
import { createAuthorizeOrder } from "@/lib/paypal";
import { canAuthorize } from "@/lib/policy";
import { audit, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/** Create the PayPal order. Gated on the terms having been approved. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const record = getContract(id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const decision = canAuthorize(record);
    if (!decision.allowed) {
      updateContract(id, (r) => {
        r.audit.push(
          audit("policy", "fund.blocked", `Funding blocked: ${decision.blockedBy?.reason}`, decision.rules),
        );
        return r;
      });
      return NextResponse.json({ ok: false, decision }, { status: 409 });
    }

    // Redirect flow: browsers (and embedded panes) often block the PayPal
    // popup, so we always provide a full-page approval URL as well.
    const origin = req.nextUrl.origin;
    const { data, raw } = await createAuthorizeOrder({
      amount: record.contract.amount.value,
      currency: record.contract.amount.currency,
      description: record.contract.purpose,
      referenceId: record.contract.id,
      returnUrl: `${origin}/contracts/${record.contract.id}?approved=1`,
      cancelUrl: `${origin}/contracts/${record.contract.id}?cancelled=1`,
    });

    const approveUrl =
      data.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href ??
      null;

    updateContract(id, (r) => {
      r.paypal.orderId = data.id;
      r.audit.push(
        audit("paypal", "order.created", `PayPal order ${data.id} created with intent=AUTHORIZE.`, JSON.parse(raw)),
      );
      return r;
    });

    return NextResponse.json({ ok: true, orderId: data.id, approveUrl });
  } catch (err) {
    return errorResponse(err);
  }
}
