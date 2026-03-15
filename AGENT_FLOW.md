# DupDetect — Agent & Data Flow Reference

> **Last updated:** March 2026  
> **System:** Duplicate Payment Detection Platform  
> **Architecture:** React (Vite) → Express proxy (port 8080) → FastAPI (port 8000) → PostgreSQL

---

## Quick Answer: What Happens When You Open the Dashboard?

**No AI agents are called.** The dashboard loads entirely from direct SQL queries against PostgreSQL.  
AI agents only activate when you explicitly interact with them (chat, graph query, bulk scan, or training).

---

## Architecture Overview

```
Browser (React)
     │
     ▼
Express API Server  :8080   (reverse proxy + body re-write)
     │
     ▼
FastAPI Python API  :8000   (business logic + agent orchestration)
     │
     ├──► PostgreSQL         (payment data, memory, sessions)
     │
     └──► OpenAI gpt-4o-mini (via Replit AI Integration proxy :1106)
              ▲
              │  only called when user triggers an agent action
```

---

## Page-by-Page Data Flow

---

### 1. Dashboard  `/`

**Triggered on page load — 3 parallel HTTP GET requests**

| Request | Endpoint | SQL performed | Returns |
|---------|----------|---------------|---------|
| Stats cards | `GET /api/dashboard/stats` | COUNT, SUM, GROUP BY on `dup_duplicate_payments` | Total amount at risk, high-probability count, pending count, confirmed count |
| Detection trend chart | `GET /api/dashboard/trend?period=monthly` | `date_trunc('month', detected_at)` GROUP BY | Time-series array of `{date, count, amount, avgProbability}` |
| By-payment-system pie | `GET /api/dashboard/by-system` | GROUP BY `payment_system` | `[{system, count, amount, percentage}]` |

**AI agents called: None**  
All data is aggregated SQL. No LLM inference happens on dashboard load.

---

### 2. Duplicates List  `/duplicates`

**On page load — 1 paginated SQL query**

| Request | Endpoint | SQL performed |
|---------|----------|---------------|
| Payment records | `GET /api/duplicates?page=1&limit=50` | SELECT with optional filters (system, status, probability, date) |

**AI agent triggered: on demand only**

When you click **"Ask Agent"** and send a message:

```
User message
     │
     ▼
POST /api/agents/chat  { message, agentType: "master", conversationId }
     │
     ├──► PostgreSQL: load last 20 conversation messages (history)
     ├──► PostgreSQL: load AgentMemoryRecord (training context injected into prompt)
     │
     ▼
Master Detection Agent  (gpt-4o-mini)
     │
     │   System prompt includes:
     │   - Full SWIFT MT / MX / ACH / ISO 20022 knowledge base
     │   - Probability scoring tables
     │   - Regulatory context (ISO 20022 coexistence, ACH trace rules)
     │   - Injected page context (current records, filters, amounts, matched fields)
     │   - Any saved memory from training sessions
     │
     ▼
Response stored to PostgreSQL (ConversationMessageRecord)
     │
     ▼
Returned to browser
```

---

### 3. Corridor Analysis  `/corridor`

**On page load — 1 SQL query**

| Request | Endpoint | SQL performed |
|---------|----------|---------------|
| Corridor table | `GET /api/dashboard/corridor-analysis?topN=20` | GROUP BY `originator_country, beneficiary_country` with COUNT, SUM, AVG |

**AI agents called: None**

---

### 4. Master Console  `/console`

**Starting a bulk scan triggers a multi-agent pipeline**

```
POST /api/console/scan  { maxPayments, paymentSystems, useAllDetectors }
     │
     ▼
FastAPI orchestrates a background scan across up to 1,000,000 payments
     │
     ├── Phase 1: INITIALIZATION
     │       Create ScanRecord in PostgreSQL
     │
     ├── Phase 2: SCANNING
     │       Simulate payment ingestion (seeded data + random generation)
     │       Progress streamed back via GET /api/console/scan/status
     │
     ├── Phase 3: AI DETECTION  (only if useAllDetectors = true)
     │       Calls all 5 Detector Agents in sequence:
     │
     │       ┌─────────────────────────────────────────────┐
     │       │  SWIFT Specialist          (gpt-4o-mini)    │
     │       │  Focus: UETR, MT/MX fields, BIC pairs       │
     │       ├─────────────────────────────────────────────┤
     │       │  ACH Specialist            (gpt-4o-mini)    │
     │       │  Focus: trace numbers, batch/routing nums   │
     │       ├─────────────────────────────────────────────┤
     │       │  MultiSource Detector      (gpt-4o-mini)    │
     │       │  Focus: cross-system duplicates             │
     │       ├─────────────────────────────────────────────┤
     │       │  FuzzyMatch Engine         (gpt-4o-mini)    │
     │       │  Focus: near-duplicates (±0.1% amount)      │
     │       ├─────────────────────────────────────────────┤
     │       │  PatternAnalysis Agent     (gpt-4o-mini)    │
     │       │  Focus: temporal/batch retry patterns       │
     │       └─────────────────────────────────────────────┘
     │               │
     │               ▼
     │       Each agent returns JSON array:
     │       { paymentId, isDuplicate, confidence, reasoning, duplicateType }
     │               │
     │               ▼
     │       Consensus: average confidence across all 5 agents per payment
     │
     ├── Phase 4: PERSISTENCE
     │       Write flagged duplicates to dup_duplicate_payments (PostgreSQL)
     │
     └── Phase 5: COMPLETE
             ScanRecord updated with final counts and timestamp
```

**Polling while scan runs:**  
`GET /api/console/scan/status` — returns `{status, progress, paymentsScanned, duplicatesFound, currentPhase}`

---

### 5. Agent Training  `/training`

**On page load — 2 requests**

| Request | What it does |
|---------|-------------|
| `GET /api/agents/list` | Returns all 9 agent definitions with their system prompts (no LLM call) |
| `GET /api/training/sessions` | Lists past training sessions from PostgreSQL |

**Starting a training session and sending a message:**

```
POST /api/training/sessions  →  creates TrainingSessionRecord in PostgreSQL

User message
     │
     ▼
POST /api/training/sessions/{id}/messages  { message }
     │
     ├──► PostgreSQL: load conversation history (last 30 messages)
     │
     ▼
Training Agent  (gpt-4o-mini)
     │
     │   System prompt (base) +
     │   Mode extension (one of):
     │     • DB Schema mode: teaches agent table/column structure
     │     • Duplicate Definition mode: teaches custom duplicate rules
     │
     ▼
Auto-memory detection:
     If user message contains keywords like "schema", "table", "threshold",
     "we define", "is a duplicate", "rule", etc.
          └──► AgentMemoryRecord saved to PostgreSQL
               (key = first 5 words of message, category = training type)
               This memory is injected into Master Agent on all future chats.
     │
     ▼
Response + { memorySaved: bool, memoryKey } returned to browser
```

---

### 6. AI Graph Chat  `/chat`

```
User natural language query
     │
     ▼
POST /api/agents/graph-query  { query, conversationId }
     │
     ├──► PostgreSQL: COUNT total records for context
     ├──► PostgreSQL: load AgentMemoryRecord (training context)
     │
     ▼
Graph & Chart Agent  (gpt-4o-mini)
     │
     │   System prompt: instructs model to return a strict JSON chart spec
     │   Input context: query + "Database has N duplicate payment records."
     │
     ▼
Returns JSON:
{
  chartType: "bar" | "line" | "pie" | "scatter",
  title, labels, datasets,
  xAxisLabel, yAxisLabel,
  explanation,
  sql  (optional SQL that was conceptually used)
}
     │
     ▼
React renders chart using Recharts
Conversation stored to ConversationMessageRecord
```

---

### 7. Data Schema  `/schema`

**No AI agents called on any interaction.**  
The schema editor reads/writes `DataSourceSchemaRecord` rows in PostgreSQL directly.  
Schema saved here is later referenced by the Text-to-SQL Agent when constructing queries.

---

## All 9 Agents — At a Glance

| # | Agent | Category | When invoked | LLM model |
|---|-------|----------|-------------|-----------|
| 1 | **Master Detection Agent** | Orchestrator | "Ask Agent" on Duplicates List; any `agentType: master` chat | gpt-4o-mini |
| 2 | **Training Agent** | Memory | Training session message submit | gpt-4o-mini |
| 3 | **Text-to-SQL Agent** | Utility | `agentType: text_to_sql` chat; internally during scans | gpt-4o-mini |
| 4 | **Graph & Chart Agent** | Utility | AI Graph Chat query | gpt-4o-mini |
| 5 | **SWIFT Specialist** | Detector | Master Console bulk scan (all-detector mode); `/api/agents/detector-opinions` | gpt-4o-mini |
| 6 | **ACH Specialist** | Detector | Master Console bulk scan; `/api/agents/detector-opinions` | gpt-4o-mini |
| 7 | **MultiSource Detector** | Detector | Master Console bulk scan; `/api/agents/detector-opinions` | gpt-4o-mini |
| 8 | **FuzzyMatch Engine** | Detector | Master Console bulk scan; `/api/agents/detector-opinions` | gpt-4o-mini |
| 9 | **PatternAnalysis Agent** | Detector | Master Console bulk scan; `/api/agents/detector-opinions` | gpt-4o-mini |

---

## Memory Layer

Training sessions write knowledge into `AgentMemoryRecord` (PostgreSQL).  
Memory is automatically injected into the **Master Agent** and all **Detector Agents** on every invocation.

```
Training session
     └──► AgentMemoryRecord { category, key, content }
               │
               ├──► Injected into Master Agent system prompt
               └──► Injected into each Detector Agent system prompt
                    (prefixed as "## Custom Duplicate Definition (from training)")
```

Two memory categories:
- `database_schema` — custom table/column mappings used by the Text-to-SQL Agent
- `duplicate_definition` — institution-specific duplicate rules used by all Detector Agents

---

## Summary: When Is the LLM Actually Called?

| User action | LLM call? |
|-------------|-----------|
| Open Dashboard | No |
| View Duplicates List | No |
| Click "Compare" on a payment pair | No |
| Click "Ask Agent" → send message | **Yes** — Master Agent |
| View Corridor Analysis | No |
| View Data Schema | No |
| Edit Data Schema | No |
| Start Master Console scan (standard) | No |
| Start Master Console scan (all-detectors) | **Yes** — all 5 Detector Agents |
| Open Agent Training page | No |
| Send message in training session | **Yes** — Training Agent |
| Submit query in AI Graph Chat | **Yes** — Graph & Chart Agent |
