import { Router } from "express";
import { query } from "../db.js";

const router = Router();

router.get("/stats", async (_req, res) => {
  try {
    const [totals] = await query<{ total: string; pending: string; confirmed: string; dismissed: string; under_review: string }>(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'confirmed_duplicate') AS confirmed,
        COUNT(*) FILTER (WHERE status = 'dismissed') AS dismissed,
        COUNT(*) FILTER (WHERE status = 'under_review') AS under_review
      FROM dup_duplicate_payments`
    );

    const topCorridor = await query<{ corridor: string; count: string; total_amount: string }>(
      `SELECT CONCAT(originator_country, '->', beneficiary_country) AS corridor,
        COUNT(*) AS count, SUM(amount) AS total_amount
       FROM dup_duplicate_payments
       WHERE originator_country IS NOT NULL AND beneficiary_country IS NOT NULL
       GROUP BY corridor ORDER BY count DESC LIMIT 10`
    );

    const bySystem = await query<{ payment_system: string; count: string; total_amount: string; avg_probability: string }>(
      `SELECT payment_system, COUNT(*) AS count, SUM(amount) AS total_amount, AVG(probability) AS avg_probability
       FROM dup_duplicate_payments GROUP BY payment_system ORDER BY count DESC`
    );

    const byType = await query<{ duplicate_type: string; count: string }>(
      `SELECT duplicate_type, COUNT(*) AS count FROM dup_duplicate_payments GROUP BY duplicate_type ORDER BY count DESC`
    );

    const exposureByCurrency = await query<{ currency: string; total_amount: string; count: string }>(
      `SELECT currency, SUM(amount) AS total_amount, COUNT(*) AS count
       FROM dup_duplicate_payments WHERE status IN ('pending','confirmed_duplicate')
       GROUP BY currency ORDER BY total_amount DESC LIMIT 10`
    );

    const recentTrend = await query<{ day: string; count: string; total_amount: string }>(
      `SELECT date_trunc('day', detected_at)::date AS day, COUNT(*) AS count, SUM(amount) AS total_amount
       FROM dup_duplicate_payments WHERE detected_at >= NOW() - INTERVAL '30 days'
       GROUP BY day ORDER BY day`
    );

    const highRisk = await query<{ id: string; payment1_id: string; payment2_id: string; probability: number; amount: number; currency: string; payment_system: string; duplicate_type: string; status: string; detected_at: string }>(
      `SELECT id, payment1_id, payment2_id, probability, amount, currency, payment_system, duplicate_type, status, detected_at
       FROM dup_duplicate_payments WHERE probability >= 0.85 AND status = 'pending'
       ORDER BY probability DESC, amount DESC LIMIT 10`
    );

    res.json({
      totals: {
        total: Number(totals.total),
        pending: Number(totals.pending),
        confirmed: Number(totals.confirmed),
        dismissed: Number(totals.dismissed),
        underReview: Number(totals.under_review),
      },
      topCorridors: topCorridor.map((r) => ({
        corridor: r.corridor,
        count: Number(r.count),
        totalAmount: Number(r.total_amount),
      })),
      byPaymentSystem: bySystem.map((r) => ({
        paymentSystem: r.payment_system,
        count: Number(r.count),
        totalAmount: Number(r.total_amount),
        avgProbability: Math.round(Number(r.avg_probability) * 10000) / 10000,
      })),
      byDuplicateType: byType.map((r) => ({
        duplicateType: r.duplicate_type,
        count: Number(r.count),
      })),
      exposureByCurrency: exposureByCurrency.map((r) => ({
        currency: r.currency,
        totalAmount: Number(r.total_amount),
        count: Number(r.count),
      })),
      recentTrend: recentTrend.map((r) => ({
        day: String(r.day),
        count: Number(r.count),
        totalAmount: Number(r.total_amount),
      })),
      highRiskAlerts: highRisk,
    });
  } catch (e) {
    console.error("Dashboard stats error:", e);
    res.status(500).json({ error: "Failed to load dashboard stats" });
  }
});

export default router;
