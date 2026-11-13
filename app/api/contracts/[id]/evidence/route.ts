import { NextRequest, NextResponse } from "next/server";
import { verifyEvidence } from "@/lib/ai";
import { audit, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/** Submit delivery evidence and run AI verification against each criterion. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { text, dataUrl, name } = await req.json();
    const record = getContract(id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (!text && !dataUrl) {
      return NextResponse.json(
        { ok: false, error: "Provide evidence text or a file." },
        { status: 400 },
      );
    }
    // A settled contract is finished. Without this guard, posting evidence to
    // a captured contract reset its status and the buyer UI re-rendered a live
    // "Release funds" button over money that had already moved.
    if (record.status === "captured" || record.status === "voided") {
      return NextResponse.json(
        {
          ok: false,
          error: `This contract is already ${record.status}. No further evidence can be submitted.`,
        },
        { status: 409 },
      );
    }
    if (!record.paypal.authorizationId) {
      return NextResponse.json(
        {
          ok: false,
          error: "The buyer has not placed a hold yet, so there is nothing to deliver against.",
        },
        { status: 409 },
      );
    }

    const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
    if (typeof dataUrl === "string" && dataUrl.length > MAX_EVIDENCE_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: "That attachment is too large. Please keep it under 4MB.",
        },
        { status: 413 },
      );
    }

    const entry = {
      kind: (dataUrl ? "image" : "text") as "image" | "text",
      name: String(name ?? (dataUrl ? "evidence" : "note.txt")),
      text: text ? String(text) : undefined,
      dataUrl: dataUrl ? String(dataUrl) : undefined,
      at: new Date().toISOString(),
    };

    const withEvidence = updateContract(id, (r) => {
      r.evidence.push(entry);
      r.status = "evidence_submitted";
      r.audit.push(audit("human", "evidence.submitted", `Payee submitted "${entry.name}".`));
      return r;
    });

    // Assess the new submission, not the whole history. Passing every past
    // attachment re-uploaded them on each round, growing the request until it
    // eventually failed.
    const result = await verifyEvidence(withEvidence.contract, [entry]);
    const metCount = result.data.filter((v) => v.status === "met").length;

    const updated = updateContract(id, (r) => {
      // Carry any human override forward. Replacing verdicts wholesale
      // discarded a buyer's recorded decision — and its justification —
      // without trace, which is precisely what the audit trail exists to
      // prevent. A fresh submission supersedes the AI's own verdict only.
      const overrides = new Map(
        r.verdicts
          .filter((v) => v.human_override)
          .map((v) => [v.criterion_id, v.human_override!]),
      );
      r.verdicts = result.data.map((v) => {
        const carried = overrides.get(v.criterion_id);
        return carried ? { ...v, human_override: carried } : v;
      });
      if (overrides.size > 0) {
        r.audit.push(
          audit(
            "system",
            "verdict.override_retained",
            `${overrides.size} human override${overrides.size === 1 ? "" : "s"} carried forward over the new assessment.`,
          ),
        );
      }
      r.audit.push(
        audit(
          "ai",
          "evidence.verified",
          result.fallback
            ? "Verification unavailable; every criterion recorded as unassessed, which keeps funds held."
            : `${metCount} of ${r.contract.acceptance_criteria.length} criteria assessed as met by ${result.model}.`,
          { verdicts: result.data, fallback: result.fallback, note: result.note },
        ),
      );
      return r;
    });

    return NextResponse.json({
      ok: true,
      record: updated,
      ai: { fallback: result.fallback, model: result.model, note: result.note },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
