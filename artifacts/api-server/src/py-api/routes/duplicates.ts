import { Router } from "express";
import { query, queryOne, execute } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

function toCamel(r: Record<string, unknown>) {
  return {
    id: r["id"],
    payment1Id: r["payment1_id"],
    payment2Id: r["payment2_id"],
    probability: Number(r["probability"] ?? 0),
    duplicateType: r["duplicate_type"],
    paymentSystem: r["payment_system"],
    amount: Number(r["amount"] ?? 0),
    currency: r["currency"],
    senderBIC: r["sender_bic"],
    receiverBIC: r["receiver_bic"],
    originatorCountry: r["originator_country"],
    beneficiaryCountry: r["beneficiary_country"],
    paymentDate1: r["payment_date1"],
    paymentDate2: r["payment_date2"],
    status: r["status"],
    matchedFields: r["matched_fields"],
    detectedAt: r["detected_at"],
    notes: r["notes"],
    scanId: r["scan_id"],
  };
}

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query["page"] || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query["page_size"] || 50)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    const q = req.query as Record<string, string>;
    // Accept both camelCase (from generated client) and snake_case (legacy)
    const payment_system = q["paymentSystem"] || q["payment_system"];
    const status = q["status"];
    const min_probability = q["minProbability"] || q["min_probability"];
    const max_probability = q["maxProbability"] || q["max_probability"];
    const search = q["search"];
    const dateFrom = q["dateFrom"] || q["date_from"];
    const dateTo = q["dateTo"] || q["date_to"];

    if (payment_system) { conditions.push(`payment_system = $${pi++}`); params.push(payment_system); }
    if (status) { conditions.push(`status = $${pi++}`); params.push(status); }
    if (min_probability) { conditions.push(`probability >= $${pi++}`); params.push(Number(min_probability)); }
    if (max_probability) { conditions.push(`probability <= $${pi++}`); params.push(Number(max_probability)); }
    if (dateFrom) { conditions.push(`detected_at >= $${pi++}`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`detected_at <= $${pi++}`); params.push(dateTo); }
    if (search) {
      conditions.push(`(payment1_id ILIKE $${pi} OR payment2_id ILIKE $${pi} OR sender_bic ILIKE $${pi} OR receiver_bic ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRow] = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM dup_duplicate_payments ${where}`,
      params
    );
    const total = Number(countRow.total);

    const rows = await query(
      `SELECT * FROM dup_duplicate_payments ${where} ORDER BY probability DESC, detected_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, pageSize, offset]
    );

    // Return both schemas: new schema (items/limit/totalPages) and legacy (duplicates/pageSize/pages)
    const mapped = rows.map(toCamel);
    res.json({
      items: mapped,
      duplicates: mapped,
      total,
      page,
      limit: pageSize,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    console.error("List duplicates error:", e);
    res.status(500).json({ error: "Failed to list duplicates" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const row = await queryOne(`SELECT * FROM dup_duplicate_payments WHERE id = $1`, [req.params["id"]]);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(toCamel(row));
  } catch (e) {
    console.error("Get duplicate error:", e);
    return res.status(500).json({ error: "Failed to get duplicate" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status, notes } = req.body as { status: string; notes?: string };
    const validStatuses = ["pending", "confirmed_duplicate", "dismissed", "under_review"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const params: unknown[] = [status, req.params["id"]];
    let sql = `UPDATE dup_duplicate_payments SET status = $1`;
    if (notes !== undefined) { sql += `, notes = $3`; params.push(notes); }
    sql += ` WHERE id = $2 RETURNING *`;

    const rows = await query(sql, params);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    return res.json(toCamel(rows[0]));
  } catch (e) {
    console.error("Update status error:", e);
    return res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const count = await execute(`DELETE FROM dup_duplicate_payments WHERE id = $1`, [req.params["id"]]);
    if (!count) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (e) {
    console.error("Delete duplicate error:", e);
    return res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
