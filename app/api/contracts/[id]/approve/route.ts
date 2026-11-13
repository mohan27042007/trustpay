import { NextRequest, NextResponse } from "next/server";
import { audit, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/** Record a human approval, bound to the current contract version. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { scope, actor } = await req.json();
    if (scope !== "fund" && scope !== "capture") {
      return NextResponse.json(
        { ok: false, error: "scope must be 'fund' or 'capture'" },
        { status: 400 },
      );
    }
    const record = getContract(id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Approvals on a settled contract are meaningless and left the record
    // looking as though a decision were still pending.
    if (record.status === "captured" || record.status === "voided") {
      return NextResponse.json(
        { ok: false, error: `This contract is already ${record.status}.` },
        { status: 409 },
      );
    }

    const who = String(actor ?? "buyer@trustpay.demo");
    const updated = updateContract(id, (r) => {
      r.approvals.push({
        actor: who,
        at: new Date().toISOString(),
        contract_version: r.contract.version,
        scope,
      });
      if (scope === "fund" && r.status === "draft") r.status = "approved";
      r.audit.push(
        audit(
          "human",
          `contract.approved.${scope}`,
          scope === "fund"
            ? `${who} approved the terms of contract v${r.contract.version}.`
            : `${who} approved releasing funds for contract v${r.contract.version}.`,
        ),
      );
      return r;
    });

    return NextResponse.json({ ok: true, record: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
