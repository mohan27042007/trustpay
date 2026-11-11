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

    const result = await verifyEvidence(withEvidence.contract, withEvidence.evidence);
    const metCount = result.data.filter((v) => v.status === "met").length;

    const updated = updateContract(id, (r) => {
      r.verdicts = result.data;
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
