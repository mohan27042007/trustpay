import { NextRequest, NextResponse } from "next/server";
import { draftContract } from "@/lib/ai";
import { TrustContractSchema, type ContractRecord } from "@/lib/contract";
import { audit, listContracts, newContractId, putContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

export async function GET() {
  return NextResponse.json({ ok: true, contracts: listContracts() });
}

/** Draft a Trust Contract from a natural-language request. Nothing is funded. */
export async function POST(req: NextRequest) {
  try {
    const { request } = await req.json();
    if (!request || typeof request !== "string") {
      return NextResponse.json(
        { ok: false, error: "A natural-language 'request' is required." },
        { status: 400 },
      );
    }

    const drafted = await draftContract(request);
    const d = drafted.data;
    const id = newContractId();
    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString();

    const contract = TrustContractSchema.parse({
      id,
      version: 1,
      created_at: now,
      payee_email: d.payee_email,
      purpose: d.purpose,
      amount: { value: d.amount_value, currency: d.amount_currency },
      deliverables: d.deliverables,
      acceptance_criteria: d.acceptance_criteria.map((c, i) => ({
        ...c,
        id: `ac${i + 1}`,
      })),
      evidence_required: d.evidence_required,
      permitted_actions: ["create_order", "authorize", "capture", "void"],
      capture_policy: {
        requires_all_criteria_met: true,
        requires_human_approval: true,
        max_capture_amount: { value: d.amount_value, currency: d.amount_currency },
      },
      limits: {
        max_amount: { value: d.amount_value, currency: d.amount_currency },
        expiry,
      },
    });

    const record: ContractRecord = {
      contract,
      status: "draft",
      paypal: {},
      verdicts: [],
      approvals: [],
      evidence: [],
      audit: [
        audit(
          "ai",
          "contract.drafted",
          drafted.fallback
            ? "Drafted from the request using the deterministic parser (model unavailable)."
            : `Drafted a Trust Contract from the request using ${drafted.model}.`,
          { original_request: request, fallback: drafted.fallback, note: drafted.note },
        ),
      ],
    };

    putContract(record);
    return NextResponse.json({
      ok: true,
      id,
      record,
      ai: { fallback: drafted.fallback, model: drafted.model, note: drafted.note },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
