import { NextRequest, NextResponse } from "next/server";
import { audit, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A human overrides the AI's verdict on one criterion.
 *
 * Justification is mandatory and is written to the audit trail: the point is
 * not to bypass the check but to make overriding it attributable. Rule R3
 * honours the override; the override itself is recorded as a human act.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { criterionId, status, justification, actor } = await req.json();

    if (status !== "met" && status !== "not_met") {
      return NextResponse.json(
        { ok: false, error: "status must be 'met' or 'not_met'" },
        { status: 400 },
      );
    }
    if (!justification || String(justification).trim().length < 3) {
      return NextResponse.json(
        { ok: false, error: "A justification is required to override a verdict." },
        { status: 400 },
      );
    }

    const record = getContract(id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const criterion = record.contract.acceptance_criteria.find(
      (c) => c.id === criterionId,
    );
    if (!criterion) {
      return NextResponse.json(
        { ok: false, error: "Unknown criterion" },
        { status: 400 },
      );
    }

    const who = String(actor ?? "buyer@trustpay.demo");
    const updated = updateContract(id, (r) => {
      const existing = r.verdicts.find((v) => v.criterion_id === criterionId);
      const override = {
        status: status as "met" | "not_met",
        justification: String(justification).trim(),
        actor: who,
        at: new Date().toISOString(),
      };
      if (existing) {
        existing.human_override = override;
      } else {
        r.verdicts.push({
          criterion_id: criterionId,
          status: "uncertain",
          confidence: 0,
          rationale: "No automated assessment was recorded for this criterion.",
          human_override: override,
        });
      }
      r.audit.push(
        audit(
          "human",
          "verdict.overridden",
          `${who} overrode "${criterion.text}" to ${status}. Reason: ${override.justification}`,
        ),
      );
      return r;
    });

    return NextResponse.json({ ok: true, record: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
