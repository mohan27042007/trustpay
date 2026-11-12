import { NextRequest, NextResponse } from "next/server";
import { TrustContractSchema } from "@/lib/contract";
import { audit, deleteContract, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const record = getContract(id);
  if (!record) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, record });
}

/**
 * Edit contract terms before funding.
 *
 * Any edit bumps `version`, which invalidates every existing approval (rule R4
 * binds approvals to a version). That is what stops an approved contract from
 * being quietly rewritten after the fact.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = getContract(id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (existing.status !== "draft" && existing.status !== "approved") {
      return NextResponse.json(
        { ok: false, error: "Terms can only be edited before funds are authorized." },
        { status: 409 },
      );
    }

    const next = TrustContractSchema.parse({
      ...existing.contract,
      ...body,
      id: existing.contract.id,
      version: existing.contract.version + 1,
      created_at: existing.contract.created_at,
    });

    const updated = updateContract(id, (r) => {
      r.contract = next;
      r.status = "draft";
      // Prior approvals no longer apply to the new terms.
      r.approvals = [];
      r.audit.push(
        audit(
          "human",
          "contract.edited",
          `Terms edited. Contract bumped to v${next.version}; previous approvals invalidated.`,
        ),
      );
      return r;
    });

    return NextResponse.json({ ok: true, record: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Remove a contract. Only allowed before funds are involved. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const record = getContract(id);
  if (!record) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (record.paypal.authorizationId || record.paypal.captureId) {
    return NextResponse.json(
      { ok: false, error: "Contracts with a PayPal authorization cannot be deleted." },
      { status: 409 },
    );
  }
  deleteContract(id);
  return NextResponse.json({ ok: true });
}
