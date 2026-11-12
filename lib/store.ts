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
  if (g.__trustpay) return g.__trustpay;

  let db: DB = { contracts: {} };
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as DB;
    }
  } catch {
    // Corrupt or unreadable file: fall back to a fresh store rather than crash.
    db = { contracts: {} };
  }

  if (Object.keys(db.contracts).length === 0) {
    for (const r of seedRecords()) db.contracts[r.contract.id] = r;
  }

  g.__trustpay = db;
  return db;
}

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
