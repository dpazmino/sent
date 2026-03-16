import { Router } from "express";
import { query, queryOne, execute, PREDEFINED_USERS } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { runReviewAgent } from "../agents/reviewAgent.js";
import { getAllDetectorOpinions, getDetectorOpinion, DETECTOR_AGENTS } from "../agents/detectorAgents.js";

const router = Router();

// ── 1. Profiles / User list ──────────────────────────────────────────────────
router.get("/users", async (_req, res) => {
  try {
    const dbUsers = await query("SELECT id, username, display_name, created_at FROM dup_users");
    const byId = new Map(dbUsers.map((u) => [u["id"], u]));
    const users = PREDEFINED_USERS.map((u) => ({
      id: u.id,
      username: u.username,
      display_name: u.displayName,
      displayName: u.displayName,
      createdAt: byId.get(u.id)?.["created_at"] ?? new Date().toISOString(),
    }));
    res.json({ users });
  } catch (e) {
    console.error("Get users error:", e);
    res.status(500).json({ error: "Failed to get users" });
  }
});

// ── 2. Fetch (assign) queue ───────────────────────────────────────────────────
router.post("/fetch", async (req, res) => {
  try {
    const { userId, limit = 20 } = req.body as { userId: string; limit?: number };
    const user = PREDEFINED_USERS.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const fetchLimit = Math.min(100, Math.max(1, Number(limit)));
    const pending = await query(
      `SELECT id FROM dup_duplicate_payments WHERE status = 'pending' OR status = 'under_review' ORDER BY probability DESC LIMIT $1`,
      [fetchLimit * 3]
    );

    const prevTotal = await query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM dup_user_reviews WHERE user_id = $1",
      [userId]
    );
    const prevTotalCount = Number(prevTotal[0]?.total || 0);

    let newlyAssigned = 0;
    for (const p of pending) {
      const exists = await queryOne(
        "SELECT id FROM dup_user_reviews WHERE user_id = $1 AND duplicate_payment_id = $2",
        [userId, p["id"]]
      );
      if (!exists) {
        await execute(
          `INSERT INTO dup_user_reviews (id, user_id, duplicate_payment_id, status, created_at, updated_at) VALUES ($1, $2, $3, 'pending', NOW(), NOW())`,
          [uuidv4(), userId, p["id"]]
        );
        newlyAssigned++;
        if (newlyAssigned >= fetchLimit) break;
      }
    }

    const newTotal = await query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM dup_user_reviews WHERE user_id = $1",
      [userId]
    );
    const totalAssigned = Number(newTotal[0]?.total || 0);

    return res.json({
      totalFetched: newlyAssigned,
      newlyAssigned,
      totalAssigned,
      summary: newlyAssigned > 0
        ? `Assigned ${newlyAssigned} new duplicate payment${newlyAssigned !== 1 ? "s" : ""} to ${user.displayName}'s review queue. Total queue size: ${totalAssigned}.`
        : `No new payments to assign. ${user.displayName} already has ${totalAssigned} payment${totalAssigned !== 1 ? "s" : ""} in their queue.`,
    });
  } catch (e) {
    console.error("Fetch reviews error:", e);
    return res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// ── 3. List reviews for a user ───────────────────────────────────────────────
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const page = Math.max(1, Number(req.query["page"] || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query["page_size"] || 20)));
    const offset = (page - 1) * pageSize;
    const statusFilter = req.query["status"] as string | undefined;

    const params: unknown[] = [userId];
    let where = "WHERE ur.user_id = $1";
    if (statusFilter) { where += " AND ur.status = $2"; params.push(statusFilter); }

    const [countRow] = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM dup_user_reviews ur ${where}`, params
    );
    const total = Number(countRow.total);

    const reviews = await query(
      `SELECT ur.id, ur.user_id, ur.duplicate_payment_id, ur.status, ur.notes, ur.created_at, ur.updated_at,
              dp.payment1_id, dp.payment2_id, dp.probability, dp.duplicate_type, dp.payment_system,
              dp.amount, dp.currency, dp.sender_bic, dp.receiver_bic, dp.originator_country,
              dp.beneficiary_country, dp.payment_date1, dp.payment_date2, dp.matched_fields, dp.detected_at
       FROM dup_user_reviews ur
       JOIN dup_duplicate_payments dp ON dp.id = ur.duplicate_payment_id
       ${where}
       ORDER BY dp.probability DESC, ur.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    res.json({
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      reviews: reviews.map((r) => ({
        id: r["id"],
        userId: r["user_id"],
        duplicatePaymentId: r["duplicate_payment_id"],
        status: r["status"],
        notes: r["notes"],
        createdAt: r["created_at"],
        updatedAt: r["updated_at"],
        payment: {
          id: r["duplicate_payment_id"],
          payment1Id: r["payment1_id"],
          payment2Id: r["payment2_id"],
          probability: Number(r["probability"] || 0),
          duplicateType: r["duplicate_type"],
          paymentSystem: r["payment_system"],
          amount: Number(r["amount"] || 0),
          currency: r["currency"],
          senderBIC: r["sender_bic"],
          receiverBIC: r["receiver_bic"],
          originatorCountry: r["originator_country"],
          beneficiaryCountry: r["beneficiary_country"],
          paymentDate1: r["payment_date1"],
          paymentDate2: r["payment_date2"],
          matchedFields: r["matched_fields"],
          detectedAt: r["detected_at"],
        },
      })),
    });
  } catch (e) {
    console.error("List reviews error:", e);
    res.status(500).json({ error: "Failed to list reviews" });
  }
});

// ── 4. Get chat messages for a review ─────────────────────────────────────────
router.get("/:userId/:reviewId/messages", async (req, res) => {
  try {
    const { userId, reviewId } = req.params;
    const review = await queryOne(
      `SELECT ur.status FROM dup_user_reviews ur WHERE ur.id = $1 AND ur.user_id = $2`,
      [reviewId, userId]
    );
    if (!review) return res.status(404).json({ error: "Review not found" });

    const rows = await query(
      "SELECT * FROM dup_user_review_messages WHERE review_id = $1 ORDER BY timestamp ASC",
      [reviewId]
    );
    return res.json({
      messages: rows.map((r) => ({ id: r["id"], role: r["role"], content: r["content"], timestamp: r["timestamp"] })),
      currentStatus: review["status"],
    });
  } catch (e) {
    console.error("Get review messages error:", e);
    return res.status(500).json({ error: "Failed to get messages" });
  }
});

// ── 5. Detector opinions for a review ─────────────────────────────────────────
router.get("/:userId/:reviewId/opinions", async (req, res) => {
  try {
    const { userId, reviewId } = req.params;
    const review = await queryOne(
      `SELECT ur.duplicate_payment_id FROM dup_user_reviews ur WHERE ur.id = $1 AND ur.user_id = $2`,
      [reviewId, userId]
    );
    if (!review) return res.status(404).json({ error: "Review not found" });

    const dup = await queryOne("SELECT * FROM dup_duplicate_payments WHERE id = $1", [review["duplicate_payment_id"]]);
    if (!dup) return res.status(404).json({ error: "Duplicate payment not found" });

    const memoryRows = await query("SELECT content FROM dup_agent_memory ORDER BY updated_at DESC LIMIT 20");
    const memoryContext = memoryRows.map((r) => r["content"]).join("\n\n");

    const { opinions, consensus } = await getAllDetectorOpinions([dup], memoryContext);
    return res.json({ opinions, consensus });
  } catch (e) {
    console.error("Detector opinions error:", e);
    return res.status(500).json({ error: "Failed to get detector opinions" });
  }
});

// ── 6. Chat (Training Agent per review) ───────────────────────────────────────
router.post("/:userId/:reviewId/chat", async (req, res) => {
  try {
    const { userId, reviewId } = req.params;
    const { message } = req.body as { message: string };

    const user = PREDEFINED_USERS.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const review = await queryOne(
      `SELECT ur.*, dp.payment1_id, dp.payment2_id, dp.probability, dp.duplicate_type,
              dp.payment_system, dp.amount, dp.currency, dp.sender_bic, dp.receiver_bic,
              dp.originator_country, dp.beneficiary_country, dp.payment_date1, dp.payment_date2,
              dp.matched_fields
       FROM dup_user_reviews ur
       JOIN dup_duplicate_payments dp ON dp.id = ur.duplicate_payment_id
       WHERE ur.id = $1 AND ur.user_id = $2`,
      [reviewId, userId]
    );
    if (!review) return res.status(404).json({ error: "Review not found" });

    const paymentData = {
      id: review["duplicate_payment_id"],
      payment1Id: review["payment1_id"],
      payment2Id: review["payment2_id"],
      probability: review["probability"],
      duplicateType: review["duplicate_type"],
      paymentSystem: review["payment_system"],
      amount: review["amount"],
      currency: review["currency"],
      senderBIC: review["sender_bic"],
      receiverBIC: review["receiver_bic"],
      originatorCountry: review["originator_country"],
      beneficiaryCountry: review["beneficiary_country"],
      paymentDate1: review["payment_date1"],
      paymentDate2: review["payment_date2"],
      matchedFields: review["matched_fields"],
      status: review["status"],
    };

    const savedMsgId = uuidv4();
    await execute(
      `INSERT INTO dup_user_review_messages (id, review_id, role, content, timestamp) VALUES ($1, $2, 'user', $3, NOW())`,
      [savedMsgId, reviewId, message]
    );

    const dbHistory = await query(
      "SELECT role, content FROM dup_user_review_messages WHERE review_id = $1 ORDER BY timestamp ASC LIMIT 100",
      [reviewId]
    ) as Array<{ role: string; content: string }>;

    const { response, statusUpdate } = await runReviewAgent({
      userMessage: message,
      userId,
      reviewerName: user.displayName,
      paymentData,
      detectorOpinions: [],
      dbHistory,
    });

    const replyId = uuidv4();
    await execute(
      `INSERT INTO dup_user_review_messages (id, review_id, role, content, timestamp) VALUES ($1, $2, 'assistant', $3, NOW())`,
      [replyId, reviewId, response]
    );

    if (statusUpdate) {
      await execute(
        `UPDATE dup_user_reviews SET status = $1, updated_at = NOW() WHERE id = $2`,
        [statusUpdate, reviewId]
      );
      await syncGlobalStatus(review["duplicate_payment_id"] as string);
    }

    const currentReview = await queryOne("SELECT status FROM dup_user_reviews WHERE id = $1", [reviewId]);

    return res.json({
      userMessageId: savedMsgId,
      response,
      assistantMessageId: replyId,
      statusUpdate,
      currentStatus: currentReview?.["status"] ?? review["status"],
    });
  } catch (e) {
    console.error("Review chat error:", e);
    return res.status(500).json({ error: "Chat failed" });
  }
});

// ── 7. Update status for a review (PATCH /:userId/:reviewId/status) ──────────
router.patch("/:userId/:reviewId/status", async (req, res) => {
  try {
    const { userId, reviewId } = req.params;
    const { status, notes } = req.body as { status: string; notes?: string };
    const validStatuses = ["pending", "confirmed_duplicate", "dismissed", "under_review"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const params: unknown[] = [status, new Date().toISOString()];
    let sql = `UPDATE dup_user_reviews SET status = $1, updated_at = $2`;
    if (notes !== undefined) { sql += `, notes = $${params.length + 1}`; params.push(notes); }
    sql += ` WHERE id = $${params.length + 1} AND user_id = $${params.length + 2} RETURNING *`;
    params.push(reviewId, userId);

    const rows = await query(sql, params);
    if (!rows.length) return res.status(404).json({ error: "Review not found" });

    await syncGlobalStatus(rows[0]["duplicate_payment_id"] as string);
    return res.json(rows[0]);
  } catch (e) {
    console.error("Update review status error:", e);
    return res.status(500).json({ error: "Failed to update status" });
  }
});

// ── Helper: sync global status ────────────────────────────────────────────────
async function syncGlobalStatus(duplicatePaymentId: string): Promise<void> {
  try {
    const reviews = await query(
      "SELECT status FROM dup_user_reviews WHERE duplicate_payment_id = $1",
      [duplicatePaymentId]
    );
    if (!reviews.length) return;

    const statuses = reviews.map((r) => String(r["status"]));
    const confirmedCount = statuses.filter((s) => s === "confirmed_duplicate").length;
    const dismissedCount = statuses.filter((s) => s === "dismissed").length;
    const underReviewCount = statuses.filter((s) => s === "under_review").length;
    const total = statuses.length;

    let globalStatus: string;
    if (confirmedCount > total / 2) globalStatus = "confirmed_duplicate";
    else if (dismissedCount > total / 2) globalStatus = "dismissed";
    else if (underReviewCount > 0 || confirmedCount > 0) globalStatus = "under_review";
    else globalStatus = "pending";

    await execute("UPDATE dup_duplicate_payments SET status = $1 WHERE id = $2", [globalStatus, duplicatePaymentId]);
  } catch (e) {
    console.error("Sync global status error:", e);
  }
}

export default router;
