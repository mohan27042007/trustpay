import {
  ContractRecord,
  Money,
  effectiveStatus,
  formatMoney,
  toMinorUnits,
} from "./contract";

/**
 * The deterministic policy engine.
 *
 * This file contains NO model calls and NO network calls. Given a contract
 * record it is a pure function, so its verdict is reproducible and auditable.
 *
 * This is the heart of TrustPay's safety claim: AI output is advisory input to
 * these rules, never a substitute for them. Money cannot move unless every
 * applicable rule passes.
 */

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5";

export type RuleResult = {
  id: RuleId;
  title: string;
  passed: boolean;
  /** Written for a human to read aloud — rendered verbatim in the UI. */
  reason: string;
};

export type PolicyDecision = {
  allowed: boolean;
  rules: RuleResult[];
  /** First failing rule — what the UI highlights when capture is blocked. */
  blockedBy: RuleResult | null;
};

/**
 * May funds be released for this contract, at this amount, right now?
 */
export function canCapture(
  record: ContractRecord,
  requested: Money,
  now: Date = new Date(),
): PolicyDecision {
  const { contract } = record;
  const rules: RuleResult[] = [];

  // ---- R1: amount ceiling -------------------------------------------------
  const req = toMinorUnits(requested);
  const contractCap = toMinorUnits(contract.limits.max_amount);
  const captureCap = toMinorUnits(contract.capture_policy.max_capture_amount);
  const cap = Math.min(contractCap, captureCap);
  const currencyMatches =
    requested.currency === contract.limits.max_amount.currency;

  rules.push({
    id: "R1",
    title: "Amount within contract limit",
    passed: currencyMatches && req <= cap && req > 0,
    reason: !currencyMatches
      ? `Currency mismatch: requested ${requested.currency}, contract is denominated in ${contract.limits.max_amount.currency}.`
      : req <= 0
        ? "Requested capture amount must be greater than zero."
        : req <= cap
          ? `Requested ${formatMoney(requested)} is within the ${formatMoney(contract.limits.max_amount)} contract limit.`
          : `Requested ${formatMoney(requested)} exceeds the contract limit of ${formatMoney(contract.limits.max_amount)}.`,
  });

  // ---- R2: capability boundary -------------------------------------------
  const captureAllowed = contract.permitted_actions.includes("capture");
  rules.push({
    id: "R2",
    title: "Capture is a permitted action",
    passed: captureAllowed,
    reason: captureAllowed
      ? "This contract permits the capture action."
      : "This contract does not list 'capture' among its permitted actions.",
  });

  // ---- R3: acceptance criteria -------------------------------------------
  if (contract.capture_policy.requires_all_criteria_met) {
    const unmet = contract.acceptance_criteria.filter((c) => {
      const verdict = record.verdicts.find((v) => v.criterion_id === c.id);
      return effectiveStatus(verdict) !== "met";
    });
    rules.push({
      id: "R3",
      title: "All acceptance criteria met",
      passed: unmet.length === 0,
      reason:
        unmet.length === 0
          ? `All ${contract.acceptance_criteria.length} acceptance criteria are satisfied.`
          : `${unmet.length} of ${contract.acceptance_criteria.length} criteria are not satisfied: ${unmet
              .map((c) => `"${c.text}"`)
              .join("; ")}.`,
    });
  } else {
    rules.push({
      id: "R3",
      title: "All acceptance criteria met",
      passed: true,
      reason: "This contract does not require all criteria to be met.",
    });
  }

  // ---- R4: human approval, bound to contract version ----------------------
  if (contract.capture_policy.requires_human_approval) {
    const approval = record.approvals.find(
      (a) => a.scope === "capture" && a.contract_version === contract.version,
    );
    const staleApproval = record.approvals.find(
      (a) => a.scope === "capture" && a.contract_version !== contract.version,
    );
    rules.push({
      id: "R4",
      title: "Human approval for this contract version",
      passed: Boolean(approval),
      reason: approval
        ? `Approved by ${approval.actor} for contract v${contract.version}.`
        : staleApproval
          ? `An approval exists but it was given for contract v${staleApproval.contract_version}; the contract has since changed to v${contract.version}. Re-approval is required.`
          : "No human has approved releasing these funds yet.",
    });
  } else {
    rules.push({
      id: "R4",
      title: "Human approval for this contract version",
      passed: true,
      reason: "This contract does not require human approval for capture.",
    });
  }

  // ---- R5: live, unexpired PayPal authorization ---------------------------
  const authId = record.paypal.authorizationId;
  const expiresAt = record.paypal.authorizationExpiresAt
    ? new Date(record.paypal.authorizationExpiresAt)
    : null;
  const contractExpiry = new Date(contract.limits.expiry);
  const authExpired = expiresAt ? expiresAt.getTime() <= now.getTime() : false;
  const contractExpired = contractExpiry.getTime() <= now.getTime();
  const alreadyCaptured = Boolean(record.paypal.captureId);

  rules.push({
    id: "R5",
    title: "Authorization is live and uncaptured",
    passed: Boolean(authId) && !authExpired && !contractExpired && !alreadyCaptured,
    reason: !authId
      ? "No PayPal authorization exists for this contract yet."
      : alreadyCaptured
        ? `Funds were already captured (capture ${record.paypal.captureId}).`
        : authExpired
          ? `The PayPal authorization expired at ${record.paypal.authorizationExpiresAt}.`
          : contractExpired
            ? `The Trust Contract expired at ${contract.limits.expiry}.`
            : `Authorization ${authId} is live${
                record.paypal.authorizationExpiresAt
                  ? ` until ${record.paypal.authorizationExpiresAt}`
                  : ""
              }.`,
  });

  const blockedBy = rules.find((r) => !r.passed) ?? null;
  return { allowed: rules.every((r) => r.passed), rules, blockedBy };
}

/** Guard for the hold step, mirroring R2/R5 at authorize time. */
export function canAuthorize(
  record: ContractRecord,
  now: Date = new Date(),
): PolicyDecision {
  const { contract } = record;
  const rules: RuleResult[] = [];

  const allowed = contract.permitted_actions.includes("authorize");
  rules.push({
    id: "R2",
    title: "Authorize is a permitted action",
    passed: allowed,
    reason: allowed
      ? "This contract permits placing an authorization hold."
      : "This contract does not permit the authorize action.",
  });

  const approval = record.approvals.find(
    (a) => a.scope === "fund" && a.contract_version === contract.version,
  );
  rules.push({
    id: "R4",
    title: "Human approved these contract terms",
    passed: Boolean(approval),
    reason: approval
      ? `Terms approved by ${approval.actor} for contract v${contract.version}.`
      : "The contract terms have not been approved by a human yet.",
  });

  const expired = new Date(contract.limits.expiry).getTime() <= now.getTime();
  rules.push({
    id: "R5",
    title: "Contract not expired",
    passed: !expired,
    reason: expired
      ? `The Trust Contract expired at ${contract.limits.expiry}.`
      : `Contract is valid until ${contract.limits.expiry}.`,
  });

  const blockedBy = rules.find((r) => !r.passed) ?? null;
  return { allowed: rules.every((r) => r.passed), rules, blockedBy };
}
