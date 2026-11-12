import { NextRequest, NextResponse } from "next/server";
import { buildProofBundle } from "@/lib/proof";
import { getContract } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

/** Download a tamper-evident record of why funds did or did not move. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const record = getContract(id);
  if (!record) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const bundle = buildProofBundle(record);
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="trustpay-proof-${id}.json"`,
    },
  });
}
