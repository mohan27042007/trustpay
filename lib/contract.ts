import { z } from "zod";

/**
 * The Trust Contract — TrustPay's central primitive.
 *
 * A human-approved, machine-readable agreement generated from a natural-language
 * request. It is the ONLY thing the policy engine consults when deciding whether
 * funds may be released. AI drafts it; a human approves it; it is then frozen
 * (bumping `version` on any edit, which invalidates prior approvals).
 */

/** Default currency, overridable per deployment via TRUSTPAY_CURRENCY. */
export const DEFAULT_CURRENCY = (
  process.env.NEXT_PUBLIC_TRUSTPAY_CURRENCY ?? "USD"
).toUpperCase();

export const MoneySchema = z.object({
  value: z.string().regex(/^\d+\.\d{2}$/, "amount must look like 150.00"),
  currency: z.string().length(3).default(DEFAULT_CURRENCY),
});
export type Money = z.infer<typeof MoneySchema>;

export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  /** How this criterion can be checked. "human" means AI must not decide it. */
  verifiable_by: z.enum(["vision", "text", "human"]).default("text"),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const PermittedActionSchema = z.enum([
  "create_order",
  "authorize",
  "capture",
  "void",
]);
export type PermittedAction = z.infer<typeof PermittedActionSchema>;

export const TrustContractSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  created_at: z.string(),

  payee_email: z.string().email(),
  purpose: z.string().min(1),
  amount: MoneySchema,

  deliverables: z.array(z.string().min(1)).min(1),
  acceptance_criteria: z.array(AcceptanceCriterionSchema).min(1),
  evidence_required: z.array(z.enum(["image", "file", "text"])).min(1),

  /** Capability boundary: actions the system is allowed to take at all. */
  permitted_actions: z.array(PermittedActionSchema).min(1),

  capture_policy: z.object({
    requires_all_criteria_met: z.boolean().default(true),
    requires_human_approval: z.boolean().default(true),
    /** Hard ceiling on a single capture, independent of the order amount. */
    max_capture_amount: MoneySchema,
  }),

  limits: z.object({
    max_amount: MoneySchema,
    /** ISO date after which this contract may not be acted on. */
    expiry: z.string(),
  }),
});
export type TrustContract = z.infer<typeof TrustContractSchema>;

/** Per-criterion verification result produced by the AI (advisory only). */
export const CriterionVerdictSchema = z.object({
  criterion_id: z.string(),
  status: z.enum(["met", "not_met", "uncertain"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  /** What in the evidence supports this verdict. */
  citation: z.string().optional(),
  /** Set when a human overrode the AI verdict. Requires justification. */
  human_override: z
    .object({
      status: z.enum(["met", "not_met"]),
      justification: z.string().min(1),
      actor: z.string(),
      at: z.string(),
    })
    .optional(),
});
export type CriterionVerdict = z.infer<typeof CriterionVerdictSchema>;

/** A human approval, bound to a specific contract version. */
export type Approval = {
  actor: string;
  at: string;
  contract_version: number;
  scope: "fund" | "capture";
};

export type AuditEvent = {
  at: string;
  /** Who acted: the AI, the deterministic engine, the human, or PayPal. */
  actor: "ai" | "policy" | "human" | "paypal" | "system";
  type: string;
  summary: string;
  /** Raw payload for inspection — PayPal responses, model output, rule results. */
  detail?: unknown;
};

/**
 * The policy verdict as it stood when funds were released or refused.
 *
 * Stored rather than recomputed, because the rules read live state: once a
 * capture succeeds, R5 ("uncaptured") correctly starts failing, so re-running
 * the engine afterwards reports that the release should never have happened.
 * A proof bundle has to carry the decision that was actually acted on.
 *
 * Shaped structurally instead of importing PolicyDecision, since policy.ts
 * imports this module.
 */
export type RecordedDecision = {
  at: string;
  allowed: boolean;
  blocked_by: string | null;
  rules: { id: string; title: string; passed: boolean; reason: string }[];
};

export type ContractStatus =
  | "draft"
  | "approved"
  | "authorized"
  | "evidence_submitted"
  | "captured"
  | "voided";

/** Runtime state wrapping an (immutable at a given version) Trust Contract. */
export type ContractRecord = {
  contract: TrustContract;
  status: ContractStatus;
  paypal: {
    orderId?: string;
    authorizationId?: string;
    captureId?: string;
    /** From PayPal's authorization resource; drives rule R5. */
    authorizationExpiresAt?: string;
  };
  verdicts: CriterionVerdict[];
  approvals: Approval[];
  /** Set the last time the capture gate ran. See RecordedDecision. */
  decision?: RecordedDecision;
  audit: AuditEvent[];
  evidence: {
    kind: "image" | "file" | "text";
    name: string;
    text?: string;
    dataUrl?: string;
    at: string;
  }[];
};

/** Money as integer minor units, so we never compare floats. */
export function toMinorUnits(m: Money): number {
  return Math.round(parseFloat(m.value) * 100);
}

export function formatMoney(m: Money): string {
  return `${m.currency} ${m.value}`;
}

/** Effective verdict for a criterion: a human override beats the AI. */
export function effectiveStatus(
  v: CriterionVerdict | undefined,
): "met" | "not_met" | "uncertain" | "missing" {
  if (!v) return "missing";
  if (v.human_override) return v.human_override.status;
  return v.status;
}
