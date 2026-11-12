import { createAuthorizeOrder, getAccessToken } from "../lib/paypal";
import { draftContract, verifyEvidence } from "../lib/ai";
import { TrustContractSchema } from "../lib/contract";

(async () => {
  console.log("=== 1. PayPal OAuth ===");
  const tok = await getAccessToken();
  console.log("access token acquired, length:", tok.length);

  console.log("\n=== 2. Create order (intent=AUTHORIZE) ===");
  const { data } = await createAuthorizeOrder({
    amount: "150.00", currency: "USD",
    description: "TrustPay verification", referenceId: `verify-${Date.now()}`,
  });
  console.log("order id:", data.id);
  console.log("status  :", data.status);
  const approve = data.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
  console.log("approve :", approve?.href ?? "(none)");

  console.log("\n=== 3. Gemini: draft a contract ===");
  const d = await draftContract(
    "Hire a logo designer for $150. Pay only when the logo includes our brand name 'Ember Roast' and is delivered as a vector file."
  );
  console.log("fallback:", d.fallback, "| model:", d.model);
  console.log("amount  :", d.data.amount_value, d.data.amount_currency);
  console.log("criteria:");
  d.data.acceptance_criteria.forEach((c, i) => console.log(`   ${i + 1}. [${c.verifiable_by}] ${c.text}`));

  console.log("\n=== 4. Gemini: verify evidence that FAILS a criterion ===");
  const contract = TrustContractSchema.parse({
    id: "tc_verify", version: 1, created_at: new Date().toISOString(),
    payee_email: "d@example.com", purpose: "Logo design",
    amount: { value: "150.00", currency: "USD" },
    deliverables: ["Logo files"],
    acceptance_criteria: [
      { id: "ac1", text: "Logo includes the brand name 'Ember Roast'", verifiable_by: "vision" },
      { id: "ac2", text: "Delivered as a vector (.svg) file", verifiable_by: "text" },
    ],
    evidence_required: ["image"],
    permitted_actions: ["create_order", "authorize", "capture", "void"],
    capture_policy: { requires_all_criteria_met: true, requires_human_approval: true, max_capture_amount: { value: "150.00", currency: "USD" } },
    limits: { max_amount: { value: "150.00", currency: "USD" }, expiry: "2026-12-31T00:00:00.000Z" },
  });
  const v = await verifyEvidence(contract, [
    { kind: "text", name: "note.txt", text: "Delivered logo.png — a flat coffee-cup icon with no text or wordmark on it." },
  ]);
  console.log("fallback:", v.fallback);
  v.data.forEach((x) => console.log(`   ${x.criterion_id}: ${x.status} (${Math.round(x.confidence * 100)}%) — ${x.rationale.slice(0, 90)}`));
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
