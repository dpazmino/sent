import { Router } from "express";
import { query, queryOne, execute } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.get("/datasource", async (_req, res) => {
  try {
    const row = await queryOne("SELECT * FROM dup_data_source_schemas ORDER BY updated_at DESC LIMIT 1");
    if (!row) {
      return res.json({
        id: "default",
        name: "Payment Data Source",
        description: "Define your payment data source schema here. The AI agents will use this to understand your database structure and generate accurate SQL queries.",
        tables: [],
        connectionHint: "",
        updatedAt: new Date().toISOString(),
      });
    }
    return res.json({
      id: row["id"],
      name: row["name"],
      description: row["description"],
      tables: row["tables"] || [],
      connectionHint: row["connection_hint"],
      updatedAt: row["updated_at"],
    });
  } catch (e) {
    console.error("Get schema error:", e);
    return res.status(500).json({ error: "Failed to get schema" });
  }
});

router.put("/datasource", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const existing = await queryOne("SELECT id FROM dup_data_source_schemas LIMIT 1");

    if (!existing) {
      const id = uuidv4();
      await execute(
        `INSERT INTO dup_data_source_schemas (id, name, description, tables, connection_hint, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [id, body["name"] || "Payment Data Source", body["description"] || "", JSON.stringify(body["tables"] || []), body["connectionHint"] || ""]
      );
    } else {
      await execute(
        `UPDATE dup_data_source_schemas SET name = $1, description = $2, tables = $3, connection_hint = $4, updated_at = NOW() WHERE id = $5`,
        [body["name"] || "Payment Data Source", body["description"] || "", JSON.stringify(body["tables"] || []), body["connectionHint"] || "", existing["id"]]
      );
    }

    const updated = await queryOne("SELECT * FROM dup_data_source_schemas ORDER BY updated_at DESC LIMIT 1");
    return res.json({
      id: updated!["id"],
      name: updated!["name"],
      description: updated!["description"],
      tables: updated!["tables"] || [],
      connectionHint: updated!["connection_hint"],
      updatedAt: updated!["updated_at"],
    });
  } catch (e) {
    console.error("Update schema error:", e);
    return res.status(500).json({ error: "Failed to update schema" });
  }
});

export default router;
