import { Router } from "express";
import { query, queryOne, execute } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { runMasterAgent, MASTER_AGENT_SYSTEM_PROMPT } from "../agents/masterAgent.js";
import { generateSql, generateGraphSpec } from "../agents/textToSqlAgent.js";
import { getAllDetectorOpinions, DETECTOR_AGENTS } from "../agents/detectorAgents.js";

const router = Router();

// Build the enriched agent list from actual agent module definitions
function buildAgentList(includePrompts: boolean) {
  const detectorMeta: Record<string, { id: string; name: string; role: string; icon: string; capabilities: string[] }> = {
    SWIFT_Specialist:     { id: "swift_specialist",  name: "SWIFT Specialist",       role: "SWIFT Detector",       icon: "🔀", capabilities: ["swift-mt", "swift-mx", "uetr-matching", "field20-analysis"] },
    ACH_Specialist:       { id: "ach_specialist",     name: "ACH Specialist",          role: "ACH Detector",         icon: "🏦", capabilities: ["ach", "trace-numbers", "nacha", "sec-codes"] },
    MultiSource_Detector: { id: "multisource",        name: "MultiSource Detector",    role: "Multi-Source Detector",icon: "🔗", capabilities: ["multi-source", "internal", "cross-system"] },
    FuzzyMatch_Engine:    { id: "fuzzymatch",         name: "FuzzyMatch Engine",       role: "Fuzzy Matcher",        icon: "🔍", capabilities: ["fuzzy-matching", "amount-tolerance", "date-proximity"] },
    PatternAnalysis_Agent:{ id: "pattern_analysis",   name: "Pattern Analysis Agent",  role: "Pattern Detector",     icon: "📊", capabilities: ["pattern-analysis", "temporal-analysis", "systemic-issues"] },
  };

  const detectorAgents = DETECTOR_AGENTS.map((agent) => {
    const meta = detectorMeta[agent.name] ?? { id: agent.name.toLowerCase(), name: agent.name, role: "Detector", icon: "🤖", capabilities: [] };
    return {
      ...meta,
      category: "detector" as const,
      isTrainable: false,
      model: "gpt-4o-mini",
      description: agent.description,
      focus: agent.focus,
      agentInstruction: agent.agentInstruction,
      ...(includePrompts ? { systemPrompt: agent.systemPrompt } : {}),
    };
  });

  const masterAgent = {
    id: "master",
    name: "Master Agent",
    role: "Orchestrator",
    category: "orchestrator" as const,
    isTrainable: false,
    description: "The highest-authority AI in the Sentinel platform. Orchestrates all specialist agents, synthesises findings, and provides executive-level analysis and recommendations.",
    icon: "🧠",
    model: "gpt-4o-mini",
    capabilities: ["orchestration", "analysis", "regulatory-guidance", "swift-mt", "swift-mx", "ach", "internal"],
    focus: "All payment systems",
    agentInstruction: "Orchestrate the specialist agents and provide executive-level synthesis.",
    ...(includePrompts ? { systemPrompt: MASTER_AGENT_SYSTEM_PROMPT } : {}),
  };

  const utilityAgents = [
    {
      id: "text_to_sql",
      name: "Text-to-SQL Agent",
      role: "SQL Generator",
      category: "utility" as const,
      isTrainable: false,
      description: "Translates natural language questions into safe PostgreSQL SELECT queries against the Sentinel database.",
      icon: "🗄️",
      model: "gpt-4o-mini",
      capabilities: ["sql-generation", "schema-aware"],
      focus: "Database querying",
      agentInstruction: "Generate safe, read-only PostgreSQL SELECT queries from natural language.",
      ...(includePrompts ? { systemPrompt: "Generates safe SQL SELECT queries from natural language input against the Sentinel PostgreSQL schema." } : {}),
    },
    {
      id: "graph_agent",
      name: "Graph & Chart Agent",
      role: "Visualisation",
      category: "utility" as const,
      isTrainable: false,
      description: "Transforms SQL query results into publication-quality chart specifications for the analytics dashboard.",
      icon: "📈",
      model: "gpt-4o-mini",
      capabilities: ["chart-generation", "data-visualisation"],
      focus: "Chart and graph generation",
      agentInstruction: "Transform query results into Recharts-compatible chart specifications.",
      ...(includePrompts ? { systemPrompt: "Transforms structured data results into publication-quality Recharts-compatible chart specifications." } : {}),
    },
    {
      id: "training_agent",
      name: "Training Agent",
      role: "Knowledge Custodian",
      category: "memory" as const,
      isTrainable: true,
      description: "Builds and validates the institutional knowledge base used by all other agents. Learns duplicate rules and database schema from analysts.",
      icon: "🎓",
      model: "gpt-4o-mini",
      capabilities: ["rule-learning", "schema-training", "memory-management"],
      focus: "Knowledge base management",
      agentInstruction: "Learn and store institutional duplicate detection rules taught by analysts.",
      ...(includePrompts ? { systemPrompt: "Maintains the institutional knowledge base — stores and validates duplicate detection rules taught by payment analysts. Responds to analyst training inputs with acknowledgements, rule storage confirmations, and clarifying questions." } : {}),
    },
  ];

  return [masterAgent, ...detectorAgents, ...utilityAgents];
}

router.get("/", (_req, res) => {
  res.json({ agents: buildAgentList(false) });
});

// Alias: frontend uses /agents/list (includes systemPrompt for display)
router.get("/list", (_req, res) => {
  res.json({ agents: buildAgentList(true) });
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

    // Extract explanation from chartSpec and promote to top level to match GraphQueryResponse schema
    const { explanation, ...graphSpec } = chartSpec as Record<string, unknown>;
    res.json({
      graphSpec,
      explanation: explanation ?? "",
      sqlUsed: sql,
      rowCount: results.length,
    });
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
