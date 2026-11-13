import { NextRequest, NextResponse } from "next/server";
import { captureAuthorization } from "@/lib/paypal";
import { explainDecision } from "@/lib/ai";
import { canCapture } from "@/lib/policy";
import { audit, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Release held funds — the only endpoint in TrustPay that moves money.
 *
 * The ordering here is the entire safety argument:
 *
 *   1. Run the deterministic policy engine.
 *   2. If ANY rule fails, return 409 and record why. PayPal is never called.
 *   3. Only on a clean pass do we capture.
 *
 * No model output reaches this decision. The AI's verdicts are data consumed by
 * rule R3; they cannot authorise a capture on their own, and an unavailable
 * model degrades to "uncertain", which R3 treats as a failure.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const record = getContract(id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const requested = {
      value: String(body.amount ?? record.contract.amount.value),
      currency: String(body.currency ?? record.contract.amount.currency),
    };

    // ---- The gate -------------------------------------------------------
    const decision = canCapture(record, requested);

    if (!decision.allowed) {
      const explanation = await explainDecision({
        allowed: false,
        rules: decision.rules,
      });
      updateContract(id, (r) => {
        r.decision = {
          at: new Date().toISOString(),
          allowed: false,
          blocked_by: decision.blockedBy?.id ?? null,
          rules: decision.rules,
        };
        r.audit.push(
          audit(
            "policy",
            "capture.blocked",
            `Capture refused by rule ${decision.blockedBy?.id}: ${decision.blockedBy?.reason}`,
            decision.rules,
          ),
        );
        return r;
      });
      // 409, and crucially: no PayPal call was made.
      return NextResponse.json(
        { ok: false, blocked: true, decision, explanation: explanation.data },
        { status: 409 },
      );
    }

    // ---- Permitted: move the money --------------------------------------
    const { data, raw } = await captureAuthorization(record.paypal.authorizationId!, {
      amount: requested.value,
      currency: requested.currency,
      final: true,
    });

    const explanation = await explainDecision({ allowed: true, rules: decision.rules });

    const updated = updateContract(id, (r) => {
      r.decision = {
        at: new Date().toISOString(),
        allowed: true,
        blocked_by: null,
        rules: decision.rules,
      };
      r.paypal.captureId = data.id;
      r.status = "captured";
      r.audit.push(
        audit("policy", "capture.allowed", "All policy rules passed. Capture permitted.", decision.rules),
      );
      r.audit.push(
        audit("paypal", "payment.captured", `Captured ${requested.currency} ${requested.value}.`, JSON.parse(raw)),
      );
      return r;
    });

    return NextResponse.json({
      ok: true,
      captureId: data.id,
      decision,
      explanation: explanation.data,
      record: updated,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
