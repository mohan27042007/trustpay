import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContractRecord, Money, TrustContract } from "./contract";
import { canCapture } from "./policy";

const USD = (value: string): Money => ({ value, currency: "USD" });

function contract(over: Partial<TrustContract> = {}): TrustContract {
  return {
    id: "c_test",
    version: 1,
    created_at: "2026-11-12T00:00:00.000Z",
    payee_email: "designer@example.com",
    purpose: "Logo design",
    amount: USD("150.00"),
    deliverables: ["Logo files"],
    acceptance_criteria: [
      { id: "ac1", text: "Logo includes the brand name", verifiable_by: "vision" },
    ],
    evidence_required: ["image"],
    permitted_actions: ["create_order", "authorize", "capture", "void"],
    capture_policy: {
      requires_all_criteria_met: true,
      requires_human_approval: true,
      max_capture_amount: USD("150.00"),
    },
    limits: { max_amount: USD("150.00"), expiry: "2026-12-31T00:00:00.000Z" },
    ...over,
  };
}

function record(over: Partial<ContractRecord> = {}): ContractRecord {
  const c = over.contract ?? contract();
  return {
    contract: c,
    status: "evidence_submitted",
    paypal: {
      orderId: "ORDER1",
      authorizationId: "AUTH1",
      authorizationExpiresAt: "2026-12-01T00:00:00.000Z",
    },
    verdicts: [
      { criterion_id: "ac1", status: "met", confidence: 0.95, rationale: "Brand name visible" },
    ],
    approvals: [
      { actor: "buyer@example.com", at: "2026-11-12T01:00:00.000Z", contract_version: c.version, scope: "capture" },
    ],
    audit: [],
    evidence: [],
    ...over,
  };
}

const NOW = new Date("2026-11-12T02:00:00.000Z");

test("happy path: all rules pass, capture allowed", () => {
  const d = canCapture(record(), USD("150.00"), NOW);
  assert.equal(d.allowed, true);
  assert.equal(d.blockedBy, null);
  assert.equal(d.rules.length, 5);
});

test("R1 blocks capture above the contract limit", () => {
  const d = canCapture(record(), USD("500.00"), NOW);
  assert.equal(d.allowed, false);
  assert.equal(d.blockedBy?.id, "R1");
  assert.match(d.blockedBy!.reason, /exceeds the contract limit/);
});

test("R1 blocks a currency mismatch", () => {
  const d = canCapture(record(), { value: "150.00", currency: "EUR" }, NOW);
  assert.equal(d.blockedBy?.id, "R1");
  assert.match(d.blockedBy!.reason, /Currency mismatch/);
});

test("R2 blocks when capture is not a permitted action", () => {
  const c = contract({ permitted_actions: ["create_order", "authorize", "void"] });
  const d = canCapture(record({ contract: c }), USD("150.00"), NOW);
  assert.equal(d.blockedBy?.id, "R2");
});

test("R3 blocks when a criterion is not met, and names it", () => {
  const d = canCapture(
    record({
      verdicts: [
        { criterion_id: "ac1", status: "not_met", confidence: 0.88, rationale: "Brand name absent" },
      ],
    }),
    USD("150.00"),
    NOW,
  );
  assert.equal(d.blockedBy?.id, "R3");
  assert.match(d.blockedBy!.reason, /Logo includes the brand name/);
});

test("R3 blocks on an uncertain verdict (uncertainty is not consent)", () => {
  const d = canCapture(
    record({
      verdicts: [
        { criterion_id: "ac1", status: "uncertain", confidence: 0.4, rationale: "Image unclear" },
      ],
    }),
    USD("150.00"),
    NOW,
  );
  assert.equal(d.blockedBy?.id, "R3");
});

test("R3 blocks when the AI produced no verdict at all", () => {
  const d = canCapture(record({ verdicts: [] }), USD("150.00"), NOW);
  assert.equal(d.blockedBy?.id, "R3");
});

test("R3 passes when a human overrides a not_met verdict with justification", () => {
  const d = canCapture(
    record({
      verdicts: [
        {
          criterion_id: "ac1",
          status: "not_met",
          confidence: 0.88,
          rationale: "Brand name absent",
          human_override: {
            status: "met",
            justification: "Buyer accepted the wordmark variant over email",
            actor: "buyer@example.com",
            at: "2026-11-12T01:30:00.000Z",
          },
        },
      ],
    }),
    USD("150.00"),
    NOW,
  );
  assert.equal(d.allowed, true);
});

test("R4 blocks when no human has approved", () => {
  const d = canCapture(record({ approvals: [] }), USD("150.00"), NOW);
  assert.equal(d.blockedBy?.id, "R4");
});

test("R4 blocks when the approval belongs to an older contract version", () => {
  const c = contract({ version: 2 });
  const d = canCapture(
    record({
      contract: c,
      approvals: [
        { actor: "buyer@example.com", at: "2026-11-12T01:00:00.000Z", contract_version: 1, scope: "capture" },
      ],
    }),
    USD("150.00"),
    NOW,
  );
  assert.equal(d.blockedBy?.id, "R4");
  assert.match(d.blockedBy!.reason, /Re-approval is required/);
});

test("R4 blocks when the only approval was for funding, not capture", () => {
  const d = canCapture(
    record({
      approvals: [
        { actor: "buyer@example.com", at: "2026-11-12T01:00:00.000Z", contract_version: 1, scope: "fund" },
      ],
    }),
    USD("150.00"),
    NOW,
  );
  assert.equal(d.blockedBy?.id, "R4");
});

test("R5 blocks when there is no authorization", () => {
  const d = canCapture(record({ paypal: {} }), USD("150.00"), NOW);
  assert.equal(d.blockedBy?.id, "R5");
});

test("R5 blocks an expired authorization", () => {
  const d = canCapture(
    record({
      paypal: {
        orderId: "ORDER1",
        authorizationId: "AUTH1",
        authorizationExpiresAt: "2026-11-01T00:00:00.000Z",
      },
    }),
    USD("150.00"),
    NOW,
  );
  assert.equal(d.blockedBy?.id, "R5");
  assert.match(d.blockedBy!.reason, /expired/);
});

test("R5 blocks double capture", () => {
  const d = canCapture(
    record({
      paypal: {
        orderId: "ORDER1",
        authorizationId: "AUTH1",
        captureId: "CAP1",
        authorizationExpiresAt: "2026-12-01T00:00:00.000Z",
      },
    }),
    USD("150.00"),
    NOW,
  );
  assert.equal(d.blockedBy?.id, "R5");
  assert.match(d.blockedBy!.reason, /already captured/);
});

test("every rule always reports a human-readable reason", () => {
  const d = canCapture(record({ verdicts: [], approvals: [], paypal: {} }), USD("999.00"), NOW);
  for (const r of d.rules) {
    assert.ok(r.reason.length > 10, `rule ${r.id} has no usable reason`);
  }
});
