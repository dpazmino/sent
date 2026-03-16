import { Router } from "express";
import { query, queryOne } from "../db.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query["page"] || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query["page_size"] || 50)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    const { payment_system, source_system, currency, status, search } = req.query as Record<string, string>;

    if (payment_system) { conditions.push(`payment_system = $${pi++}`); params.push(payment_system); }
    if (source_system) { conditions.push(`source_system = $${pi++}`); params.push(source_system); }
    if (currency) { conditions.push(`currency = $${pi++}`); params.push(currency); }
    if (status) { conditions.push(`status = $${pi++}`); params.push(status); }
    if (search) {
      conditions.push(`(id ILIKE $${pi} OR originator_name ILIKE $${pi} OR beneficiary_name ILIKE $${pi} OR uetr ILIKE $${pi} OR trace_number ILIKE $${pi} OR transaction_reference ILIKE $${pi} OR end_to_end_id ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRow] = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM dup_payments ${where}`, params
    );
    const total = Number(countRow.total);

    const rows = await query(
      `SELECT * FROM dup_payments ${where} ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, pageSize, offset]
    );

    res.json({ total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), payments: rows });
  } catch (e) {
    console.error("List payments error:", e);
    res.status(500).json({ error: "Failed to list payments" });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const [{ total }] = await query<{ total: string }>("SELECT COUNT(*) AS total FROM dup_payments");
    const bySystem = await query("SELECT payment_system, COUNT(*) AS cnt FROM dup_payments GROUP BY payment_system ORDER BY cnt DESC");
    const bySource = await query("SELECT source_system, COUNT(*) AS cnt FROM dup_payments WHERE source_system IS NOT NULL GROUP BY source_system ORDER BY cnt DESC");
    const byCurrency = await query("SELECT currency, COUNT(*) AS cnt, SUM(amount) AS total_amount FROM dup_payments GROUP BY currency ORDER BY cnt DESC LIMIT 10");
    const byStatus = await query("SELECT status, COUNT(*) AS cnt FROM dup_payments GROUP BY status ORDER BY cnt DESC");
    const byMsgType = await query("SELECT message_type, COUNT(*) AS cnt FROM dup_payments WHERE message_type IS NOT NULL GROUP BY message_type ORDER BY cnt DESC LIMIT 15");

    res.json({
      total: Number(total),
      byPaymentSystem: bySystem.map((r) => ({ system: r["payment_system"], count: Number(r["cnt"]) })),
      bySourceSystem: bySource.map((r) => ({ system: r["source_system"], count: Number(r["cnt"]) })),
      byCurrency: byCurrency.map((r) => ({ currency: r["currency"], count: Number(r["cnt"]), totalAmount: Number(r["total_amount"] || 0) })),
      byStatus: byStatus.map((r) => ({ status: r["status"], count: Number(r["cnt"]) })),
      byMessageType: byMsgType.map((r) => ({ type: r["message_type"], count: Number(r["cnt"]) })),
    });
  } catch (e) {
    console.error("Payment stats error:", e);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const row = await queryOne("SELECT * FROM dup_payments WHERE id = $1", [req.params["id"]]);
    if (!row) return res.status(404).json({ error: "Payment not found" });
    return res.json(row);
  } catch (e) {
    console.error("Get payment error:", e);
    return res.status(500).json({ error: "Failed to get payment" });
  }
});

export default router;
