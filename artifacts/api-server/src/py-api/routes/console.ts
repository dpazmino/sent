import { Router } from "express";
import { query, execute, queryOne } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// In-memory live scan state
const _currentScan: Record<string, unknown> = {
  scanId: null,
  status: "idle",
  progress: 0.0,
  paymentsScanned: 0,
  duplicatesFound: 0,
  startedAt: null,
  completedAt: null,
  currentPhase: null,
};

let _scanAborted = false;

const CANDIDATE_QUERIES = [
  {
    sql: `SELECT a.id AS id1, b.id AS id2, 'uetr_exact' AS match_type FROM dup_payments a JOIN dup_payments b ON a.uetr = b.uetr AND a.id < b.id WHERE a.uetr IS NOT NULL LIMIT $1`,
    limit: 60,
    duplicateType: "uetr_duplicate",
    probability: 0.99,
    matchedFields: ["uetr"],
  },
  {
    sql: `SELECT a.id AS id1, b.id AS id2, 'trace_exact' AS match_type FROM dup_payments a JOIN dup_payments b ON a.trace_number = b.trace_number AND a.id < b.id WHERE a.trace_number IS NOT NULL AND a.payment_system = 'ACH' AND b.payment_system = 'ACH' LIMIT $1`,
    limit: 50,
    duplicateType: "trace_duplicate",
    probability: 0.99,
    matchedFields: ["trace_number"],
  },
  {
    sql: `SELECT a.id AS id1, b.id AS id2, 'amount_bic_date' AS match_type FROM dup_payments a JOIN dup_payments b ON a.amount = b.amount AND a.currency = b.currency AND a.sender_bic = b.sender_bic AND a.receiver_bic = b.receiver_bic AND a.value_date = b.value_date AND a.id < b.id WHERE a.sender_bic IS NOT NULL AND a.value_date IS NOT NULL LIMIT $1`,
    limit: 80,
    duplicateType: "exact_match",
    probability: 0.93,
    matchedFields: ["amount", "currency", "sender_bic", "receiver_bic", "value_date"],
  },
  {
    sql: `SELECT a.id AS id1, b.id AS id2, 'e2e_same_corridor' AS match_type FROM dup_payments a JOIN dup_payments b ON a.end_to_end_id = b.end_to_end_id AND a.sender_bic = b.sender_bic AND a.receiver_bic = b.receiver_bic AND a.id < b.id WHERE a.end_to_end_id IS NOT NULL LIMIT $1`,
    limit: 60,
    duplicateType: "uetr_duplicate",
    probability: 0.97,
    matchedFields: ["end_to_end_id", "sender_bic", "receiver_bic"],
  },
  {
    sql: `SELECT a.id AS id1, b.id AS id2, 'cross_system_amount_corridor' AS match_type FROM dup_payments a JOIN dup_payments b ON a.amount = b.amount AND a.currency = b.currency AND a.sender_bic = b.sender_bic AND a.receiver_bic = b.receiver_bic AND a.source_system != b.source_system AND a.id < b.id WHERE a.source_system IS NOT NULL LIMIT $1`,
    limit: 70,
    duplicateType: "multi_source_consolidation",
    probability: 0.88,
    matchedFields: ["amount", "currency", "sender_bic", "receiver_bic"],
  },
];

async function runScan(scanId: string): Promise<void> {
  try {
    const totalPayments = await query<{ cnt: string }>("SELECT COUNT(*) AS cnt FROM dup_payments");
    const total = Number(totalPayments[0]?.cnt || 0);

    _currentScan["currentPhase"] = "Fetching candidate pairs";
    _currentScan["progress"] = 0.05;

    const seenPairs = new Set<string>();
    let duplicatesFound = 0;
    let paymentsScanned = 0;

    const totalCandidates = CANDIDATE_QUERIES.length;
    for (let qi = 0; qi < totalCandidates; qi++) {
      if (_scanAborted) break;
      const qdef = CANDIDATE_QUERIES[qi];
      _currentScan["currentPhase"] = `Running query ${qi + 1}/${totalCandidates}`;
      _currentScan["progress"] = 0.1 + (qi / totalCandidates) * 0.7;

      const pairs = await query<{ id1: string; id2: string; match_type: string }>(qdef.sql, [qdef.limit]);
      for (const pair of pairs) {
        if (_scanAborted) break;
        const pairKey = [pair.id1, pair.id2].sort().join("|");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const p1 = await queryOne("SELECT * FROM dup_payments WHERE id = $1", [pair.id1]);
        const p2 = await queryOne("SELECT * FROM dup_payments WHERE id = $1", [pair.id2]);
        if (!p1 || !p2) continue;

        const paymentSystem = String(p1["payment_system"] || "UNKNOWN");
        const currency = String(p1["currency"] || "USD");
        const amount = Number(p1["amount"] || 0);

        await execute(
          `INSERT INTO dup_duplicate_payments (id, payment1_id, payment2_id, probability, duplicate_type, payment_system, amount, currency, sender_bic, receiver_bic, originator_country, beneficiary_country, payment_date1, payment_date2, status, matched_fields, detected_at, scan_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15, NOW(), $16)
           ON CONFLICT DO NOTHING`,
          [
            uuidv4(), pair.id1, pair.id2, qdef.probability, qdef.duplicateType,
            paymentSystem, amount, currency,
            p1["sender_bic"] || null, p1["receiver_bic"] || null,
            p1["originator_country"] || null, p1["beneficiary_country"] || null,
            p1["value_date"] ? String(p1["value_date"]) : null,
            p2["value_date"] ? String(p2["value_date"]) : null,
            JSON.stringify(qdef.matchedFields), scanId,
          ]
        );

        duplicatesFound++;
        paymentsScanned += 2;
        _currentScan["duplicatesFound"] = duplicatesFound;
        _currentScan["paymentsScanned"] = paymentsScanned;
      }
    }

    _currentScan["progress"] = 0.9;
    _currentScan["currentPhase"] = "Marking scanned payments";

    await execute("UPDATE dup_payments SET is_scanned = TRUE WHERE is_scanned = FALSE");

    _currentScan["progress"] = 1.0;
    _currentScan["status"] = "completed";
    _currentScan["completedAt"] = new Date().toISOString();
    _currentScan["currentPhase"] = "Scan complete";

    await execute(
      `UPDATE dup_scan_records SET status = 'completed', progress = 1.0, payments_scanned = $1, duplicates_found = $2, completed_at = NOW(), current_phase = 'Scan complete' WHERE id = $3`,
      [paymentsScanned, duplicatesFound, scanId]
    );
  } catch (e) {
    console.error("Scan error:", e);
    _currentScan["status"] = "error";
    _currentScan["currentPhase"] = String((e as Error).message || "Unknown error");
    await execute(
      `UPDATE dup_scan_records SET status = 'error', current_phase = $1, completed_at = NOW() WHERE id = $2`,
      [String((e as Error).message || "error"), _currentScan["scanId"]]
    );
  }
}

// GET /status and /scan/status both return current scan state
router.get("/status", (_req, res) => { res.json({ ..._currentScan }); });
router.get("/scan/status", (_req, res) => { res.json({ ..._currentScan }); });

router.post("/scan", async (req, res) => {
  if (_currentScan["status"] === "running") {
    return res.status(409).json({ error: "Scan already in progress", scan: _currentScan });
  }

  const scanId = uuidv4();
  _scanAborted = false;
  Object.assign(_currentScan, {
    scanId,
    status: "running",
    progress: 0.0,
    paymentsScanned: 0,
    duplicatesFound: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    currentPhase: "Initializing",
  });

  await execute(
    `INSERT INTO dup_scan_records (id, status, payments_scanned, duplicates_found, progress, current_phase, started_at)
     VALUES ($1, 'running', 0, 0, 0.0, 'Initializing', NOW())`,
    [scanId]
  );

  // Run in background (don't await)
  runScan(scanId).catch(console.error);

  return res.json({ scanId, status: "running", message: "Scan started" });
});

router.post("/scan/abort", (_req, res) => {
  if (_currentScan["status"] !== "running") {
    return res.status(400).json({ error: "No scan running" });
  }
  _scanAborted = true;
  _currentScan["status"] = "aborted";
  _currentScan["completedAt"] = new Date().toISOString();
  return res.json({ message: "Scan aborted" });
});

router.get("/scans", async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM dup_scan_records ORDER BY started_at DESC LIMIT 20");
    res.json({ scans: rows });
  } catch (e) {
    res.status(500).json({ error: "Failed to list scans" });
  }
});

export default router;
