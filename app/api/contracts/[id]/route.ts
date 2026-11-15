import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AcceptanceCriterionSchema,
  MoneySchema,
  TrustContractSchema,
} from "@/lib/contract";
import { audit, deleteContract, getContract, updateContract } from "@/lib/store";
import { errorResponse } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * What a buyer may edit before funding.
 *
 * Everything absent from this list — the capture policy flags, the permitted
 * actions, the limits, the version — is either derived or carried over. That
 * is the whole point: these are the fields the policy engine reads to decide
 * whether money moves.
 */
const EditableTerms = z
  .object({
    payee_email: z.string().email("Needs to be a valid email address."),
    purpose: z.string().min(1, "Give the payment a purpose."),
    amount: MoneySchema,
    deliverables: z.array(z.string().min(1)).min(1, "List at least one deliverable."),
    acceptance_criteria: z
      .array(AcceptanceCriterionSchema)
      .min(1, "A contract needs at least one acceptance criterion."),
    evidence_required: z.array(z.enum(["image", "file", "text"])).min(1),
  })
  .partial()
  .strict();

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

    // Only the terms a buyer is entitled to change. Spreading the request body
    // over the contract let a client send capture_policy with its flags turned
    // off, after which R3 and R4 passed themselves and capture needed nothing
    // but a live authorization. The contract is the sole input to the
    // deterministic guarantee, so the API must not let a client rewrite the
    // parts of it that *are* the guarantee.
    const patch = EditableTerms.safeParse(body);
    if (!patch.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Those terms aren't valid.",
          issues: patch.error.issues.map((i) => ({
            field: i.path.join(".") || "(root)",
            problem: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const amount = patch.data.amount ?? existing.contract.amount;
    const next = TrustContractSchema.parse({
      ...existing.contract,
      ...patch.data,
      amount,
      // Derived from the amount, never accepted from the client.
      limits: { ...existing.contract.limits, max_amount: amount },
      capture_policy: {
        ...existing.contract.capture_policy,
        max_capture_amount: amount,
      },
      permitted_actions: existing.contract.permitted_actions,
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
