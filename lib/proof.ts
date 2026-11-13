import { createHash } from "node:crypto";
import type { ContractRecord } from "./contract";
import { canCapture } from "./policy";

/**
 * The proof bundle.
 *
 * A single self-contained record of why money did or did not move: the agreed
 * terms, the evidence considered, the AI's advisory verdicts, the human
 * approvals, the deterministic rule evaluation, and the PayPal identifiers.
 *
 * Each section is hashed, and the bundle carries a digest over those hashes.
 * That makes it verifiable: anyone holding the bundle can recompute the digest
 * and detect alteration. It is a tamper-evident record, not a signature — we
 * make no claim of cryptographic non-repudiation.
 */

export type ProofBundle = ReturnType<typeof buildProofBundle>;

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function buildProofBundle(record: ContractRecord, now = new Date()) {
  const { contract } = record;
  // Prefer the decision recorded when the gate actually ran. Re-evaluating
  // here would judge the contract by its state *after* the outcome: a captured
  // contract fails R5 ("uncaptured"), so a successful release would export a
  // bundle claiming it should have been blocked. Fall back to a live
  // evaluation only for contracts the gate has not reached yet.
  const recorded = record.decision;
  const live = canCapture(record, contract.amount, now);

  const sections = {
    contract,
    evidence: record.evidence.map((e) => ({
      kind: e.kind,
      name: e.name,
      at: e.at,
      // Hash rather than embed file bytes: keeps the bundle small and avoids
      // redistributing uploaded content, while still proving what was assessed.
      text: e.text,
      content_sha256: e.dataUrl ? sha256(e.dataUrl) : undefined,
    })),
    ai_verdicts: record.verdicts,
    human_approvals: record.approvals,
    policy_evaluation: recorded
      ? {
          allowed: recorded.allowed,
          evaluated_at: recorded.at,
          rules: recorded.rules,
          blocked_by: recorded.blocked_by,
          source: "recorded at the time the gate ran",
        }
      : {
          allowed: live.allowed,
          evaluated_at: now.toISOString(),
          rules: live.rules,
          blocked_by: live.blockedBy?.id ?? null,
          source: "evaluated now; the capture gate has not run for this contract yet",
        },
    paypal: record.paypal,
    audit: record.audit,
  };

  const section_hashes = Object.fromEntries(
    Object.entries(sections).map(([k, v]) => [k, sha256(v)]),
  );

  return {
    format: "trustpay.proof-bundle/v1",
    generated_at: now.toISOString(),
    contract_id: contract.id,
    contract_version: contract.version,
    status: record.status,
    /**
     * How to read this bundle: the AI's verdicts are advisory input. Only
     * policy_evaluation decides whether funds may move, and it is reproducible
     * from the contract plus the verdicts plus the approvals.
     */
    decision_authority: "deterministic policy engine (lib/policy.ts), rules R1-R5",
    environment: "paypal-sandbox",
    ...sections,
    section_hashes,
    digest: sha256(section_hashes),
  };
}
