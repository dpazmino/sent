import { Router, Request, Response } from "express";
import { query, queryOne, execute } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { runTrainingAgent } from "../agents/trainingAgent.js";

const router = Router();

router.get("/sessions", async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM dup_training_sessions ORDER BY last_message_at DESC NULLS LAST, created_at DESC");
    res.json({ sessions: rows.map((r) => ({
      id: r["id"],
      trainingType: r["training_type"],
      title: r["title"],
      createdAt: r["created_at"],
      lastMessageAt: r["last_message_at"],
      messageCount: Number(r["message_count"] || 0),
    })) });
  } catch (e) {
    console.error("List training sessions error:", e);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const { trainingType, title } = req.body as { trainingType: string; title?: string };
    const id = uuidv4();
    await execute(
      `INSERT INTO dup_training_sessions (id, training_type, title, created_at, message_count)
       VALUES ($1, $2, $3, NOW(), 0)`,
      [id, trainingType, title || `${trainingType} Session`]
    );
    const row = await queryOne("SELECT * FROM dup_training_sessions WHERE id = $1", [id]);
    res.json({
      id: row!["id"],
      trainingType: row!["training_type"],
      title: row!["title"],
      createdAt: row!["created_at"],
      lastMessageAt: null,
      messageCount: 0,
    });
  } catch (e) {
    console.error("Create training session error:", e);
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/sessions/:sessionId/messages", async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM dup_training_messages WHERE session_id = $1 ORDER BY timestamp ASC",
      [req.params["sessionId"]]
    );
    res.json({ messages: rows.map((r) => ({ id: r["id"], role: r["role"], content: r["content"], timestamp: r["timestamp"] })) });
  } catch (e) {
    console.error("Get training messages error:", e);
    res.status(500).json({ error: "Failed to get messages" });
  }
});

// Shared chat handler — handles both /sessions/:id/messages (schema) and /sessions/:id/chat (legacy)
async function handleTrainingChat(req: Request, res: Response): Promise<void> {
  try {
    const { message } = req.body as { message: string };
    const sessionId = req.params["sessionId"] || req.params["id"];

    const session = await queryOne("SELECT * FROM dup_training_sessions WHERE id = $1", [sessionId]);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const msgId = uuidv4();
    await execute(
      `INSERT INTO dup_training_messages (id, session_id, role, content, timestamp) VALUES ($1, $2, 'user', $3, NOW())`,
      [msgId, sessionId, message]
    );

    const history = await query(
      "SELECT role, content FROM dup_training_messages WHERE session_id = $1 ORDER BY timestamp ASC",
      [sessionId]
    );

    const { response, memorySaved, memoryKey, memoryContent } = await runTrainingAgent({
      userMessage: message,
      trainingType: String(session["training_type"]),
      sessionId,
      dbHistory: history as Array<{ role: string; content: string }>,
    });

    const replyId = uuidv4();
    await execute(
      `INSERT INTO dup_training_messages (id, session_id, role, content, timestamp) VALUES ($1, $2, 'assistant', $3, NOW())`,
      [replyId, sessionId, response]
    );

    await execute(
      `UPDATE dup_training_sessions SET last_message_at = NOW(), message_count = message_count + 2 WHERE id = $1`,
      [sessionId]
    );

    if (memorySaved && memoryKey && memoryContent) {
      await execute(
        `INSERT INTO dup_agent_memory (id, category, key, content, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
        [uuidv4(), String(session["training_type"]), memoryKey, memoryContent]
      ).catch(() =>
        execute(
          `INSERT INTO dup_agent_memory (id, category, key, content, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [uuidv4(), String(session["training_type"]), memoryKey, memoryContent]
        )
      );
    }

    res.json({ response, memorySaved, memoryKey: memoryKey ?? null });
  } catch (e) {
    console.error("Training chat error:", e);
    res.status(500).json({ error: "Chat failed" });
  }
}

// POST /sessions/:id/messages  — matches generated client schema
router.post("/sessions/:sessionId/messages", handleTrainingChat);
// POST /sessions/:id/chat      — legacy alias kept for backward compat
router.post("/sessions/:sessionId/chat", handleTrainingChat);

router.get("/memory", async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM dup_agent_memory ORDER BY updated_at DESC");
    res.json({ memories: rows.map((r) => ({
      id: r["id"],
      category: r["category"],
      key: r["key"],
      content: r["content"],
      createdAt: r["created_at"],
      updatedAt: r["updated_at"],
    })) });
  } catch (e) {
    res.status(500).json({ error: "Failed to get memory" });
  }
});

// DELETE /memory — clear all agent memory entries
router.delete("/memory", async (_req, res) => {
  try {
    await execute("DELETE FROM dup_agent_memory");
    res.json({ success: true, message: "All agent memory cleared" });
  } catch (e) {
    console.error("Clear memory error:", e);
    res.status(500).json({ error: "Failed to clear memory" });
  }
});

export default router;
