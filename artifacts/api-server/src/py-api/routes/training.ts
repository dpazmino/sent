import { Router } from "express";
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

router.post("/sessions/:sessionId/chat", async (req, res) => {
  try {
    const { message } = req.body as { message: string };
    const sessionId = req.params["sessionId"];

    const session = await queryOne("SELECT * FROM dup_training_sessions WHERE id = $1", [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });

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
      ).catch(() => {
        return execute(
          `INSERT INTO dup_agent_memory (id, category, key, content, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [uuidv4(), String(session["training_type"]), memoryKey, memoryContent]
        );
      });
    }

    return res.json({
      userMessageId: msgId,
      response,
      assistantMessageId: replyId,
      memorySaved,
      memoryKey,
    });
  } catch (e) {
    console.error("Training chat error:", e);
    return res.status(500).json({ error: "Chat failed" });
  }
});

router.get("/memory", async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM dup_agent_memory ORDER BY updated_at DESC");
    res.json({ memories: rows.map((r) => ({ id: r["id"], category: r["category"], key: r["key"], content: r["content"], updatedAt: r["updated_at"] })) });
  } catch (e) {
    res.status(500).json({ error: "Failed to get memory" });
  }
});

export default router;
