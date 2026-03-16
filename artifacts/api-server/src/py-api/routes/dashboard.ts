import { Router } from "express";
import { query } from "../db.js";

const router = Router();

router.get("/stats", async (_req, res) => {
  try {
    const [totals] = await query<{
      total: string;
      pending: string;
      confirmed: string;
      dismissed: string;
      under_review: string;
      high: string;
      medium: string;
      low: string;
      amount_at_risk: string;
    }>(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'confirmed_duplicate') AS confirmed,
        COUNT(*) FILTER (WHERE status = 'dismissed') AS dismissed,
        COUNT(*) FILTER (WHERE status = 'under_review') AS under_review,
        COUNT(*) FILTER (WHERE probability >= 0.8) AS high,
        COUNT(*) FILTER (WHERE probability >= 0.5 AND probability < 0.8) AS medium,
        COUNT(*) FILTER (WHERE probability < 0.5) AS low,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','confirmed_duplicate','under_review')), 0) AS amount_at_risk
      FROM dup_duplicate_payments`
    );

    const bySystemRows = await query<{ payment_system: string; count: string }>(
      `SELECT payment_system, COUNT(*) AS count
       FROM dup_duplicate_payments
       GROUP BY payment_system
       ORDER BY count DESC`
    );

    const byPaymentSystem: Record<string, number> = {};
    for (const r of bySystemRows) {
      byPaymentSystem[r.payment_system] = Number(r.count);
    }

    const [latestScan] = await query<{ last_scan: string }>(
      `SELECT MAX(detected_at) AS last_scan FROM dup_duplicate_payments`
    );

    res.json({
      totalDuplicatesFound: Number(totals.total),
      highProbabilityCount: Number(totals.high),
      mediumProbabilityCount: Number(totals.medium),
      lowProbabilityCount: Number(totals.low),
      totalAmountAtRisk: Number(totals.amount_at_risk),
      confirmedDuplicates: Number(totals.confirmed),
      pendingReview: Number(totals.pending),
      dismissedCount: Number(totals.dismissed),
      byPaymentSystem,
      lastScanAt: latestScan?.last_scan ?? null,
      scanCoverage: 100,
    });
  } catch (e) {
    console.error("Dashboard stats error:", e);
    res.status(500).json({ error: "Failed to load dashboard stats" });
  }
});

router.get("/trend", async (req, res) => {
  try {
    const period = String(req.query.period ?? "monthly");

    let truncUnit: string;
    let interval: string;
    if (period === "weekly") {
      truncUnit = "week";
      interval = "12 weeks";
    } else if (period === "daily") {
      truncUnit = "day";
      interval = "30 days";
    } else {
      truncUnit = "month";
      interval = "12 months";
    }

    const rows = await query<{
      date: string;
      count: string;
      total_amount: string;
      avg_probability: string;
    }>(
      `SELECT
        TO_CHAR(date_trunc('${truncUnit}', detected_at), 'YYYY-MM-DD') AS date,
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS total_amount,
        COALESCE(AVG(probability), 0) AS avg_probability
       FROM dup_duplicate_payments
       WHERE detected_at >= NOW() - INTERVAL '${interval}'
       GROUP BY date_trunc('${truncUnit}', detected_at)
       ORDER BY date_trunc('${truncUnit}', detected_at)`
    );

    res.json({
      data: rows.map((r) => ({
        date: String(r.date),
        count: Number(r.count),
        amount: Number(r.total_amount),
        avgProbability: Math.round(Number(r.avg_probability) * 10000) / 10000,
      })),
      period,
    });
  } catch (e) {
    console.error("Dashboard trend error:", e);
    res.status(500).json({ error: "Failed to load trend data" });
  }
});

router.get("/by-system", async (_req, res) => {
  try {
    const rows = await query<{
      payment_system: string;
      count: string;
      total_amount: string;
    }>(
      `SELECT
        payment_system,
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS total_amount
       FROM dup_duplicate_payments
       GROUP BY payment_system
       ORDER BY count DESC`
    );

    const total = rows.reduce((s, r) => s + Number(r.count), 0) || 1;

    res.json({
      data: rows.map((r) => ({
        system: r.payment_system,
        count: Number(r.count),
        amount: Number(r.total_amount),
        percentage: Math.round((Number(r.count) / total) * 10000) / 100,
      })),
    });
  } catch (e) {
    console.error("Dashboard by-system error:", e);
    res.status(500).json({ error: "Failed to load by-system data" });
  }
});

router.get("/corridor-analysis", async (_req, res) => {
  try {
    const rows = await query<{
      originator_country: string;
      beneficiary_country: string;
      count: string;
      total_amount: string;
      avg_probability: string;
    }>(
      `SELECT
        originator_country,
        beneficiary_country,
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS total_amount,
        COALESCE(AVG(probability), 0) AS avg_probability
       FROM dup_duplicate_payments
       WHERE originator_country IS NOT NULL AND beneficiary_country IS NOT NULL
       GROUP BY originator_country, beneficiary_country
       ORDER BY count DESC
       LIMIT 50`
    );

    res.json({
      corridors: rows.map((r) => ({
        originCountry: r.originator_country,
        destCountry: r.beneficiary_country,
        corridor: `${r.originator_country}->${r.beneficiary_country}`,
        duplicateCount: Number(r.count),
        totalAmount: Number(r.total_amount),
        avgProbability: Math.round(Number(r.avg_probability) * 10000) / 10000,
      })),
      totalCorridors: rows.length,
    });
  } catch (e) {
    console.error("Corridor analysis error:", e);
    res.status(500).json({ error: "Failed to load corridor analysis" });
  }
});

export default router;
