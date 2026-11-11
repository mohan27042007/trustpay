import { NextRequest, NextResponse } from "next/server";
import { voidAuthorization } from "@/lib/paypal";
import { audit, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/** Cancel the hold and return funds to the buyer — the explicit refuse path. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { reason } = await req.json().catch(() => ({ reason: undefined }));
    const record = getContract(id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (!record.paypal.authorizationId) {
      return NextResponse.json(
        { ok: false, error: "There is no authorization to void." },
        { status: 409 },
      );
    }

    const { raw } = await voidAuthorization(record.paypal.authorizationId);

    const updated = updateContract(id, (r) => {
      r.status = "voided";
      r.audit.push(
        audit(
          "human",
          "payment.voided",
          `Authorization voided and funds released back to the buyer.${reason ? ` Reason: ${reason}` : ""}`,
          raw ? JSON.parse(raw) : undefined,
        ),
      );
      return r;
    });

    return NextResponse.json({ ok: true, record: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
