import { Router } from "express";
import { query, queryOne, execute } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { runMasterAgent, MASTER_AGENT_SYSTEM_PROMPT } from "../agents/masterAgent.js";
import { generateSql, generateGraphSpec } from "../agents/textToSqlAgent.js";
import { getAllDetectorOpinions, DETECTOR_AGENTS } from "../agents/detectorAgents.js";

const router = Router();

// Agent metadata
const AGENTS_METADATA = [
  {
    id: "master",
    name: "Master Agent",
    role: "Orchestrator",
    description: "The highest-authority AI in the Sentinel platform. Orchestrates all specialist agents, synthesises findings, and provides executive-level analysis and recommendations.",
    icon: "🧠",
    model: "gpt-4o-mini",
    capabilities: ["orchestration", "analysis", "regulatory-guidance", "swift-mt", "swift-mx", "ach", "internal"],
  },
  {
    id: "swift_specialist",
    name: "SWIFT Specialist",
    role: "SWIFT Detector",
    description: "Expert in SWIFT MT and MX payment duplicate detection. Specializes in UETR matching, Field 20/32A analysis, and MT-to-MX migration duplicates.",
    icon: "🔀",
    model: "gpt-4o-mini",
    capabilities: ["swift-mt", "swift-mx", "uetr-matching", "field20-analysis"],
  },
  {
    id: "ach_specialist",
    name: "ACH Specialist",
    role: "ACH Detector",
    description: "Expert in ACH duplicate detection. Focuses on trace numbers, batch processing, SEC codes, and NACHA Operating Rules.",
    icon: "🏦",
    model: "gpt-4o-mini",
    capabilities: ["ach", "trace-numbers", "nacha", "sec-codes"],
  },
  {
    id: "multisource",
    name: "MultiSource Detector",
    role: "Multi-Source Detector",
    description: "Specializes in detecting payments submitted from multiple source systems simultaneously (core banking + treasury + correspondent).",
    icon: "🔗",
    model: "gpt-4o-mini",
    capabilities: ["multi-source", "internal", "cross-system"],
  },
  {
    id: "fuzzymatch",
    name: "FuzzyMatch Engine",
    role: "Fuzzy Matcher",
    description: "Uses fuzzy logic to detect near-duplicate payments with slight variations in amount, date, or reference.",
    icon: "🔍",
    model: "gpt-4o-mini",
    capabilities: ["fuzzy-matching", "amount-tolerance", "date-proximity"],
  },
  {
    id: "pattern_analysis",
    name: "Pattern Analysis Agent",
    role: "Pattern Detector",
    description: "Analyzes temporal and behavioral patterns to identify systematic duplicate payment issues including batch reprocessing and system failover scenarios.",
    icon: "📊",
    model: "gpt-4o-mini",
    capabilities: ["pattern-analysis", "temporal-analysis", "systemic-issues"],
  },
  {
    id: "text_to_sql",
    name: "Text-to-SQL Agent",
    role: "SQL Generator",
    description: "Translates natural language questions into safe PostgreSQL SELECT queries against the Sentinel database.",
    icon: "🗄️",
    model: "gpt-4o-mini",
    capabilities: ["sql-generation", "schema-aware"],
  },
  {
    id: "graph_agent",
    name: "Graph & Chart Agent",
    role: "Visualisation",
    description: "Transforms SQL query results into publication-quality chart specifications for the analytics dashboard.",
    icon: "📈",
    model: "gpt-4o-mini",
    capabilities: ["chart-generation", "data-visualisation"],
  },
  {
    id: "training_agent",
    name: "Training Agent",
    role: "Knowledge Custodian",
    description: "Builds and validates the institutional knowledge base used by all other agents. Learns duplicate rules and database schema from analysts.",
    icon: "🎓",
    model: "gpt-4o-mini",
    capabilities: ["rule-learning", "schema-training", "memory-management"],
  },
];

router.get("/", (_req, res) => {
  res.json({ agents: AGENTS_METADATA });
});

// Alias: frontend uses /agents/list
router.get("/list", (_req, res) => {
  res.json({ agents: AGENTS_METADATA });
});

// Master agent conversation
router.post("/chat", async (req, res) => {
  try {
    const { message, conversationId } = req.body as { message: string; conversationId?: string };

    let convId = conversationId;
    if (!convId) {
      convId = uuidv4();
      await execute(
        `INSERT INTO dup_conversations (id, agent_type, created_at) VALUES ($1, 'master', NOW())`,
        [convId]
      );
    }

    const history = await query(
      "SELECT role, content FROM dup_conversation_messages WHERE conversation_id = $1 ORDER BY timestamp ASC LIMIT 40",
      [convId]
    ) as Array<{ role: string; content: string }>;

    const memoryRows = await query("SELECT content FROM dup_agent_memory ORDER BY updated_at DESC LIMIT 20");
    const memoryContext = memoryRows.map((r) => r["content"]).join("\n\n");

    const msgId = uuidv4();
    await execute(
      `INSERT INTO dup_conversation_messages (id, conversation_id, role, content, timestamp) VALUES ($1, $2, 'user', $3, NOW())`,
      [msgId, convId, message]
    );

    const response = await runMasterAgent(message, history, memoryContext);

    const replyId = uuidv4();
    await execute(
      `INSERT INTO dup_conversation_messages (id, conversation_id, role, content, timestamp) VALUES ($1, $2, 'assistant', $3, NOW())`,
      [replyId, convId, response]
    );

    res.json({ conversationId: convId, userMessageId: msgId, response, assistantMessageId: replyId });
  } catch (e) {
    console.error("Master agent chat error:", e);
    res.status(500).json({ error: "Chat failed" });
  }
});

// Text-to-SQL query
router.post("/query", async (req, res) => {
  try {
    const { query: nlQuery, executeQuery = true } = req.body as { query: string; executeQuery?: boolean };

    const schemaRow = await queryOne("SELECT tables, connection_hint FROM dup_data_source_schemas LIMIT 1");
    const schemaContext = schemaRow
      ? `Custom tables: ${JSON.stringify(schemaRow["tables"])}\nHint: ${schemaRow["connection_hint"] || ""}`
      : "";

    const sql = await generateSql(nlQuery, schemaContext);

    let results: unknown[] = [];
    let error: string | null = null;
    let rowCount = 0;

    if (executeQuery && !sql.includes("error_message")) {
      try {
        const rows = await query(sql + (sql.toLowerCase().includes("limit") ? "" : " LIMIT 500"));
        results = rows;
        rowCount = rows.length;
      } catch (dbErr: unknown) {
        error = dbErr instanceof Error ? dbErr.message : String(dbErr);
      }
    }

    res.json({ sql, results, rowCount, error, naturalLanguageQuery: nlQuery });
  } catch (e) {
    console.error("SQL query error:", e);
    res.status(500).json({ error: "Query failed" });
  }
});

// Graph / chart generation
router.post("/graph-query", async (req, res) => {
  try {
    const { query: nlQuery } = req.body as { query: string };

    const schemaRow = await queryOne("SELECT tables FROM dup_data_source_schemas LIMIT 1");
    const schemaContext = schemaRow ? JSON.stringify(schemaRow["tables"]) : "";
    const sql = await generateSql(nlQuery, schemaContext);

    let results: unknown[] = [];
    if (!sql.includes("error_message")) {
      try {
        results = await query(sql + (sql.toLowerCase().includes("limit") ? "" : " LIMIT 500"));
      } catch {
        /* ignore — pass empty to chart agent */
      }
    }

    const memoryRows = await query("SELECT content FROM dup_agent_memory ORDER BY updated_at DESC LIMIT 10");
    const memoryContext = memoryRows.map((r) => r["content"]).join("\n\n");

    const chartSpec = await generateGraphSpec(nlQuery, sql, results, memoryContext);
    res.json({ sql, rowCount: results.length, chartSpec });
  } catch (e) {
    console.error("Graph query error:", e);
    res.status(500).json({ error: "Graph query failed" });
  }
});

// Detector opinions for a payment
router.post("/review-payment", async (req, res) => {
  try {
    const { paymentIds } = req.body as { paymentIds: string[] };

    const rows = await query(
      `SELECT * FROM dup_duplicate_payments WHERE id = ANY($1::text[]) LIMIT 20`,
      [paymentIds]
    );
    if (!rows.length) return res.status(404).json({ error: "No payments found" });

    const memoryRows = await query("SELECT content FROM dup_agent_memory ORDER BY updated_at DESC LIMIT 20");
    const memoryContext = memoryRows.map((r) => r["content"]).join("\n\n");

    const { opinions, consensus } = await getAllDetectorOpinions(rows, memoryContext);
    return res.json({ opinions, consensus, reviewedCount: rows.length });
  } catch (e) {
    console.error("Review payment error:", e);
    return res.status(500).json({ error: "Review failed" });
  }
});

router.get("/conversations", async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM dup_conversations ORDER BY created_at DESC LIMIT 50");
    res.json({ conversations: rows });
  } catch (e) {
    res.status(500).json({ error: "Failed to get conversations" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM dup_conversation_messages WHERE conversation_id = $1 ORDER BY timestamp ASC",
      [req.params["id"]]
    );
    res.json({ messages: rows });
  } catch (e) {
    res.status(500).json({ error: "Failed to get messages" });
  }
});

export default router;
