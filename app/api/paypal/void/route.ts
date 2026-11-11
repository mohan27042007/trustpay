import { NextRequest, NextResponse } from "next/server";
import { voidAuthorization } from "@/lib/paypal";
import { errorResponse } from "@/lib/api-utils";

/** Cancel the hold and return funds to the buyer — the "refuse" path. */
export async function POST(req: NextRequest) {
  try {
    const { authorizationId } = await req.json();
    if (!authorizationId) {
      return NextResponse.json(
        { ok: false, error: "authorizationId is required" },
        { status: 400 },
      );
    }
    const { raw } = await voidAuthorization(String(authorizationId));
    return NextResponse.json({
      ok: true,
      voided: true,
      raw: raw ? JSON.parse(raw) : {},
    });
  } catch (err) {
    return errorResponse(err);
  }
}
