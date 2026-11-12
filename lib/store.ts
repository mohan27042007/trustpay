import fs from "node:fs";
import path from "node:path";
import type { AuditEvent, ContractRecord } from "./contract";

/**
 * Process-local store with best-effort JSON persistence.
 *
 * Deliberately not a database: TrustPay is a hackathon demo and a native
 * sqlite build is a deploy-failure risk we don't need. Data is seeded on boot,
 * so a cold start on Render always presents judges with a populated app.
 */

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "contracts.json");

type DB = { contracts: Record<string, ContractRecord> };

// Survive Next.js hot-reload module re-evaluation in dev.
const g = globalThis as unknown as { __trustpay?: DB };

function load(): DB {
  if (g.__trustpay) {
    ensureSeeds(g.__trustpay);
    return g.__trustpay;
  }

  let db: DB = { contracts: {} };
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as DB;
    }
  } catch {
    // Corrupt or unreadable file: fall back to a fresh store rather than crash.
    db = { contracts: {} };
  }

  ensureSeeds(db);
  g.__trustpay = db;
  return db;
}

/**
 * Add any demo record that isn't present. Additive rather than
 * only-when-empty, so a new seed reaches an instance that already has data
 * (a redeploy, or a dev server holding state across a hot reload). A seed the
 * user has deleted stays deleted for the life of the process.
 */
function ensureSeeds(db: DB) {
  for (const r of seedRecords()) {
    if (!db.contracts[r.contract.id] && !deletedSeeds.has(r.contract.id)) {
      db.contracts[r.contract.id] = r;
    }
  }
}

const deletedSeeds = new Set<string>();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(load(), null, 2));
  } catch {
    // Read-only filesystem (some hosts): in-memory state is still correct.
  }
}

export function listContracts(): ContractRecord[] {
  return Object.values(load().contracts).sort((a, b) =>
    b.contract.created_at.localeCompare(a.contract.created_at),
  );
}

export function getContract(id: string): ContractRecord | null {
  return load().contracts[id] ?? null;
}

export function putContract(record: ContractRecord): ContractRecord {
  load().contracts[record.contract.id] = record;
  persist();
  return record;
}

export function deleteContract(id: string): void {
  delete load().contracts[id];
  // Remember the deletion so ensureSeeds doesn't resurrect a demo record.
  deletedSeeds.add(id);
  persist();
}

export function updateContract(
  id: string,
  fn: (r: ContractRecord) => ContractRecord,
): ContractRecord {
  const current = getContract(id);
  if (!current) throw new Error(`Contract ${id} not found`);
  const next = fn(structuredClone(current));
  return putContract(next);
}

export function appendAudit(id: string, event: AuditEvent): ContractRecord {
  return updateContract(id, (r) => {
    r.audit.push(event);
    return r;
  });
}

export function audit(
  actor: AuditEvent["actor"],
  type: string,
  summary: string,
  detail?: unknown,
): AuditEvent {
  return { at: new Date().toISOString(), actor, type, summary, detail };
}

export function newContractId(): string {
  return `tc_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

/** Demo data so a freshly deployed instance is never empty for judges. */
function seedRecords(): ContractRecord[] {
  const created = "2026-11-10T09:12:00.000Z";
  return [
    {
      // Matches the demo narration exactly: a $150 logo contract where four
      // policy rules pass and R3 fails on the brand-name criterion alone.
      contract: {
        id: "tc_demo03",
        version: 2,
        created_at: "2026-11-12T08:05:00.000Z",
        payee_email: "studio@pixelforge.example",
        purpose: "Logo design for Ember Roast",
        amount: { value: "150.00", currency: "USD" },
        deliverables: ["Primary logo", "Export files"],
        acceptance_criteria: [
          { id: "ac1", text: "The logo includes the brand name 'Ember Roast'", verifiable_by: "vision" },
          { id: "ac2", text: "The logo is delivered as a vector file (SVG, AI or EPS)", verifiable_by: "text" },
          { id: "ac3", text: "A monochrome variant is included", verifiable_by: "vision" },
        ],
        evidence_required: ["image", "text"],
        permitted_actions: ["create_order", "authorize", "capture", "void"],
        capture_policy: {
          requires_all_criteria_met: true,
          requires_human_approval: true,
          max_capture_amount: { value: "150.00", currency: "USD" },
        },
        limits: {
          max_amount: { value: "150.00", currency: "USD" },
          expiry: "2026-12-11T08:05:00.000Z",
        },
      },
      status: "evidence_submitted",
      paypal: {
        orderId: "DEMO-ORDER-03",
        authorizationId: "DEMO-AUTH-03",
        authorizationExpiresAt: "2026-12-10T08:05:00.000Z",
      },
      verdicts: [
        { criterion_id: "ac1", status: "not_met", confidence: 0.96, rationale: "The submitted artwork is a coffee-cup icon with no text on it. The brand name 'Ember Roast' does not appear anywhere in the logo.", citation: "Submitted image: icon only, no wordmark" },
        { criterion_id: "ac2", status: "met", confidence: 0.9, rationale: "The delivery note lists an .svg export alongside the raster files." },
        { criterion_id: "ac3", status: "met", confidence: 0.88, rationale: "A single-colour variant is present in the submitted sheet.", citation: "Second artboard" },
      ],
      approvals: [
        { actor: "buyer@trustpay.demo", at: "2026-11-12T08:07:00.000Z", contract_version: 2, scope: "fund" },
        { actor: "buyer@trustpay.demo", at: "2026-11-12T08:31:00.000Z", contract_version: 2, scope: "capture" },
      ],
      evidence: [
        { kind: "text", name: "delivery-note.txt", text: "Delivered: ember-mark.png, ember-mark.svg, ember-mark-mono.png", at: "2026-11-12T08:30:00.000Z" },
      ],
      audit: [
        { at: "2026-11-12T08:05:00.000Z", actor: "ai", type: "contract.drafted", summary: "Drafted a Trust Contract from the request using gemini-2.5-flash." },
        { at: "2026-11-12T08:06:00.000Z", actor: "human", type: "contract.edited", summary: "Terms edited. Contract bumped to v2; previous approvals invalidated." },
        { at: "2026-11-12T08:07:00.000Z", actor: "human", type: "contract.approved.fund", summary: "buyer@trustpay.demo approved the terms of contract v2." },
        { at: "2026-11-12T08:08:00.000Z", actor: "paypal", type: "payment.authorized", summary: "Authorization hold placed for USD 150.00. This is a temporary hold, not escrow." },
        { at: "2026-11-12T08:30:00.000Z", actor: "human", type: "evidence.submitted", summary: "Payee submitted \"delivery-note.txt\"." },
        { at: "2026-11-12T08:30:30.000Z", actor: "ai", type: "evidence.verified", summary: "2 of 3 criteria assessed as met by gemini-2.5-flash." },
        { at: "2026-11-12T08:31:00.000Z", actor: "human", type: "contract.approved.capture", summary: "buyer@trustpay.demo approved releasing funds for contract v2." },
      ],
    },
    {
      // Seeded at the refusal moment: four rules pass, R3 fails on one
      // criterion. A judge opening the deployed app sees the product's most
      // important behaviour without having to drive the whole flow first.
      contract: {
        id: "tc_demo02",
        version: 1,
        created_at: "2026-11-11T16:40:00.000Z",
        payee_email: "freelancer@northlight.example",
        purpose: "Landing page illustration pack",
        amount: { value: "220.00", currency: "USD" },
        deliverables: ["Six spot illustrations", "Source files"],
        acceptance_criteria: [
          { id: "ac1", text: "At least six distinct illustrations are delivered", verifiable_by: "vision" },
          { id: "ac2", text: "Illustrations use the agreed teal and charcoal palette", verifiable_by: "vision" },
          { id: "ac3", text: "Editable source files are included", verifiable_by: "text" },
        ],
        evidence_required: ["image", "text"],
        permitted_actions: ["create_order", "authorize", "capture", "void"],
        capture_policy: {
          requires_all_criteria_met: true,
          requires_human_approval: true,
          max_capture_amount: { value: "220.00", currency: "USD" },
        },
        limits: {
          max_amount: { value: "220.00", currency: "USD" },
          expiry: "2026-12-10T16:40:00.000Z",
        },
      },
      status: "evidence_submitted",
      paypal: {
        orderId: "DEMO-ORDER-02",
        authorizationId: "DEMO-AUTH-02",
        authorizationExpiresAt: "2026-12-09T16:40:00.000Z",
      },
      verdicts: [
        { criterion_id: "ac1", status: "met", confidence: 0.91, rationale: "Six separate illustrations are present in the submitted sheet.", citation: "Contact sheet, rows 1-2" },
        { criterion_id: "ac2", status: "met", confidence: 0.84, rationale: "Palette matches the agreed teal and charcoal.", citation: "Swatches sampled across all six pieces" },
        { criterion_id: "ac3", status: "not_met", confidence: 0.93, rationale: "Only flattened PNG exports were submitted. No editable source files (.ai, .svg or .fig) appear in the delivery.", citation: "Delivery note lists six .png files only" },
      ],
      approvals: [
        { actor: "buyer@trustpay.demo", at: "2026-11-11T16:42:00.000Z", contract_version: 1, scope: "fund" },
        { actor: "buyer@trustpay.demo", at: "2026-11-11T18:05:00.000Z", contract_version: 1, scope: "capture" },
      ],
      evidence: [
        { kind: "text", name: "delivery-note.txt", text: "Delivered six illustrations: hero.png, feature-a.png, feature-b.png, cta.png, footer.png, spot.png", at: "2026-11-11T18:00:00.000Z" },
      ],
      audit: [
        { at: "2026-11-11T16:40:00.000Z", actor: "ai", type: "contract.drafted", summary: "Drafted a Trust Contract from the buyer's request." },
        { at: "2026-11-11T16:42:00.000Z", actor: "human", type: "contract.approved.fund", summary: "Buyer approved the terms (v1)." },
        { at: "2026-11-11T16:43:00.000Z", actor: "paypal", type: "payment.authorized", summary: "Authorization hold placed for USD 220.00. This is a temporary hold, not escrow." },
        { at: "2026-11-11T18:00:00.000Z", actor: "human", type: "evidence.submitted", summary: "Payee submitted \"delivery-note.txt\"." },
        { at: "2026-11-11T18:01:00.000Z", actor: "ai", type: "evidence.verified", summary: "2 of 3 criteria assessed as met." },
        { at: "2026-11-11T18:05:00.000Z", actor: "human", type: "contract.approved.capture", summary: "Buyer approved releasing funds for contract v1." },
        { at: "2026-11-11T18:06:00.000Z", actor: "policy", type: "capture.blocked", summary: "Capture refused by rule R3: 1 of 3 criteria are not satisfied: \"Editable source files are included\"." },
      ],
    },
    {
      contract: {
        id: "tc_demo01",
        version: 2,
        created_at: created,
        payee_email: "studio@pixelforge.example",
        purpose: "Brand logo design for a coffee roastery",
        amount: { value: "150.00", currency: "USD" },
        deliverables: ["Primary logo (SVG + PNG)", "Monochrome variant"],
        acceptance_criteria: [
          { id: "ac1", text: "Logo includes the brand name 'Ember Roast'", verifiable_by: "vision" },
          { id: "ac2", text: "Delivered as a vector file", verifiable_by: "text" },
        ],
        evidence_required: ["image"],
        permitted_actions: ["create_order", "authorize", "capture", "void"],
        capture_policy: {
          requires_all_criteria_met: true,
          requires_human_approval: true,
          max_capture_amount: { value: "150.00", currency: "USD" },
        },
        limits: {
          max_amount: { value: "150.00", currency: "USD" },
          expiry: "2026-12-10T09:12:00.000Z",
        },
      },
      status: "captured",
      paypal: {
        orderId: "DEMO-ORDER-01",
        authorizationId: "DEMO-AUTH-01",
        captureId: "DEMO-CAP-01",
        authorizationExpiresAt: "2026-12-09T09:12:00.000Z",
      },
      verdicts: [
        { criterion_id: "ac1", status: "met", confidence: 0.94, rationale: "The wordmark 'Ember Roast' is legible in the supplied artwork.", citation: "Wordmark, lower third of the image" },
        { criterion_id: "ac2", status: "met", confidence: 0.88, rationale: "Submission notes list an .svg file." },
      ],
      approvals: [
        { actor: "buyer@trustpay.demo", at: "2026-11-10T09:20:00.000Z", contract_version: 2, scope: "fund" },
        { actor: "buyer@trustpay.demo", at: "2026-11-11T14:02:00.000Z", contract_version: 2, scope: "capture" },
      ],
      evidence: [
        { kind: "text", name: "delivery-note.txt", text: "Final logo delivered: ember-roast.svg + ember-roast.png", at: "2026-11-11T13:55:00.000Z" },
      ],
      audit: [
        { at: "2026-11-10T09:12:00.000Z", actor: "ai", type: "contract.drafted", summary: "Drafted Trust Contract from a natural-language request." },
        { at: "2026-11-10T09:15:00.000Z", actor: "human", type: "contract.edited", summary: "Buyer tightened criterion ac1 to require the exact brand name. Contract bumped to v2." },
        { at: "2026-11-10T09:20:00.000Z", actor: "human", type: "contract.approved", summary: "Buyer approved the terms (v2)." },
        { at: "2026-11-10T09:21:00.000Z", actor: "paypal", type: "payment.authorized", summary: "Authorization hold placed for USD 150.00." },
        { at: "2026-11-11T13:55:00.000Z", actor: "human", type: "evidence.submitted", summary: "Payee submitted delivery evidence." },
        { at: "2026-11-11T13:56:00.000Z", actor: "ai", type: "evidence.verified", summary: "2 of 2 criteria assessed as met." },
        { at: "2026-11-11T14:02:00.000Z", actor: "policy", type: "capture.allowed", summary: "All 5 rules passed. Capture permitted." },
        { at: "2026-11-11T14:02:05.000Z", actor: "paypal", type: "payment.captured", summary: "Captured USD 150.00." },
      ],
    },
  ];
}
