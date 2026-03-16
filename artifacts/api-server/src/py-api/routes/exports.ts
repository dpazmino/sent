import { Router } from "express";
import { query } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

function dupToRow(r: Record<string, unknown>) {
  return {
    id: r["id"],
    payment1Id: r["payment1_id"],
    payment2Id: r["payment2_id"],
    probability: r["probability"],
    duplicateType: r["duplicate_type"],
    paymentSystem: r["payment_system"],
    amount: r["amount"],
    currency: r["currency"],
    senderBIC: r["sender_bic"],
    receiverBIC: r["receiver_bic"],
    originatorCountry: r["originator_country"],
    beneficiaryCountry: r["beneficiary_country"],
    paymentDate1: r["payment_date1"],
    paymentDate2: r["payment_date2"],
    status: r["status"],
    matchedFields: r["matched_fields"] || [],
    detectedAt: r["detected_at"],
    notes: r["notes"],
  };
}

function toCSV(rows: Record<string, unknown>[]): string {
  const headers = [
    "ID", "Payment1_ID", "Payment2_ID", "Probability", "Duplicate_Type",
    "Payment_System", "Amount", "Currency", "Sender_BIC", "Receiver_BIC",
    "Originator_Country", "Beneficiary_Country", "Payment_Date1", "Payment_Date2",
    "Status", "Matched_Fields", "Detected_At", "Notes",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const d = dupToRow(r);
    const matched = Array.isArray(d.matchedFields) ? JSON.stringify(d.matchedFields) : "[]";
    const detAt = d.detectedAt ? new Date(d.detectedAt as string).toISOString() : "";
    lines.push([
      d.id, d.payment1Id, d.payment2Id, d.probability, d.duplicateType,
      d.paymentSystem, d.amount, d.currency, d.senderBIC, d.receiverBIC,
      d.originatorCountry, d.beneficiaryCountry, d.paymentDate1, d.paymentDate2,
      d.status, `"${matched}"`, detAt, `"${String(d.notes || "").replace(/"/g, '""')}"`,
    ].join(","));
  }
  return lines.join("\n");
}

router.post("/duplicates", async (req, res) => {
  try {
    const body = req.body as { format?: string; filters?: Record<string, unknown> };
    const fmt = body.format || "csv";
    const filters = body.filters || {};

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (filters["minProbability"] != null) { conditions.push(`probability >= $${pi++}`); params.push(Number(filters["minProbability"])); }
    if (filters["paymentSystem"]) { conditions.push(`payment_system = $${pi++}`); params.push(filters["paymentSystem"]); }
    if (filters["status"]) { conditions.push(`status = $${pi++}`); params.push(filters["status"]); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await query(
      `SELECT * FROM dup_duplicate_payments ${where} ORDER BY probability DESC LIMIT 100000`,
      params
    );

    const exportId = uuidv4().slice(0, 8);
    const filename = `duplicate_payments_${exportId}.${fmt}`;

    let content: string;
    if (fmt === "csv") {
      content = toCSV(rows);
    } else {
      content = JSON.stringify(rows.map(dupToRow), null, 2);
    }

    res.json({
      downloadUrl: `/py-api/exports/download/${exportId}?format=${fmt}`,
      filename,
      recordCount: rows.length,
      format: fmt,
      data: content,
    });
  } catch (e) {
    console.error("Export error:", e);
    res.status(500).json({ error: "Export failed" });
  }
});

router.get("/download/:exportId", async (req, res) => {
  try {
    const fmt = (req.query["format"] as string) || "csv";
    const rows = await query("SELECT * FROM dup_duplicate_payments ORDER BY probability DESC LIMIT 100000");

    if (fmt === "csv") {
      const csv = toCSV(rows);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=duplicates_${req.params["exportId"]}.csv`);
      res.send(csv);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=duplicates_${req.params["exportId"]}.json`);
      res.send(JSON.stringify(rows.map(dupToRow), null, 2));
    }
  } catch (e) {
    console.error("Download error:", e);
    res.status(500).json({ error: "Download failed" });
  }
});

export default router;
