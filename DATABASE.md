# Sentinel — Database Reference

## Connection

Sentinel uses **PostgreSQL** accessed via the `DATABASE_URL` environment variable.

```
DATABASE_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=disable
```

The API server connects through Node.js `pg` (Pool) — no ORM, raw SQL only.

- **Replit (dev)**: the database is provisioned automatically; `DATABASE_URL` is injected into the environment.
- **AWS self-hosting**: set `DATABASE_URL` in your ECS task definition, Lambda environment, or EC2 `.env` pointing to your RDS PostgreSQL instance.

---

## Tables Overview

| Table | Purpose | Current Rows |
|---|---|---|
| `dup_payments` | Raw payment records ingested from all systems | 2,960 |
| `dup_duplicate_payments` | Detected duplicate pairs with probability scores | 520 |
| `dup_users` | Analyst user accounts (10 predefined) | 10 |
| `dup_user_reviews` | Per-analyst review decisions on duplicate pairs | varies |
| `dup_user_review_messages` | Chat messages within a review session | varies |
| `dup_training_sessions` | Agent training chat sessions per analyst | varies |
| `dup_training_messages` | Individual messages within training sessions | varies |
| `dup_agent_memory` | Persistent memory stored by the Training Agent | varies |
| `dup_conversations` | General agent conversation threads | varies |
| `dup_conversation_messages` | Messages within agent conversations | varies |
| `dup_scan_records` | History of duplicate-detection scan runs | varies |
| `dup_data_source_schemas` | Data source schema definitions (AI query context) | 1 |

---

## Table Schemas

### `dup_payments`
Raw payment data ingested from all payment systems. This is the source of truth for duplicate detection.

```sql
CREATE TABLE dup_payments (
  id                    VARCHAR PRIMARY KEY,
  payment_system        VARCHAR NOT NULL,       -- SWIFT_MT | SWIFT_MX | ACH | INTERNAL
  message_type          VARCHAR,                -- e.g. MT103, pacs.008
  source_system         VARCHAR,
  channel               VARCHAR,
  amount                DOUBLE PRECISION NOT NULL,
  currency              VARCHAR NOT NULL,
  value_date            VARCHAR,
  status                VARCHAR,
  priority              VARCHAR,
  created_at            TIMESTAMPTZ,
  processed_at          TIMESTAMPTZ,

  -- Parties
  originator_name       VARCHAR,
  originator_account    VARCHAR,
  originator_country    VARCHAR,
  sender_bic            VARCHAR,
  sender_bank_name      VARCHAR,
  beneficiary_name      VARCHAR,
  beneficiary_account   VARCHAR,
  beneficiary_country   VARCHAR,
  receiver_bic          VARCHAR,
  receiver_bank_name    VARCHAR,

  -- References
  uetr                  VARCHAR,               -- ISO 20022 Unique End-to-End Transaction Reference
  transaction_reference VARCHAR,
  related_reference     VARCHAR,
  end_to_end_id         VARCHAR,
  correspondent_bank    VARCHAR,
  trace_number          VARCHAR,               -- ACH trace number
  routing_number        VARCHAR,               -- ACH routing
  sec_code              VARCHAR,               -- ACH SEC code
  company_name          VARCHAR,
  individual_name       VARCHAR,
  batch_number          VARCHAR,
  effective_date        VARCHAR,
  internal_ref          VARCHAR,
  from_account          VARCHAR,
  to_account            VARCHAR,
  gl_code               VARCHAR,
  department            VARCHAR,
  cost_centre           VARCHAR,
  remittance_info       TEXT,
  purpose_code          VARCHAR,
  invoice_reference     VARCHAR,
  is_scanned            BOOLEAN                -- true once included in a scan
);
```

**Payment systems in use:**

| Value | Description |
|---|---|
| `SWIFT_MT` | SWIFT MT103 cross-border wire transfers |
| `SWIFT_MX` | ISO 20022 pacs.008 messages |
| `ACH` | US ACH credit/debit entries |
| `INTERNAL` | Internal bank GL/ledger transfers |

---

### `dup_duplicate_payments`
Each row represents a detected duplicate pair — two payments believed to be the same transaction.

```sql
CREATE TABLE dup_duplicate_payments (
  id                   VARCHAR PRIMARY KEY,
  payment1_id          VARCHAR NOT NULL,        -- FK → dup_payments.id
  payment2_id          VARCHAR NOT NULL,        -- FK → dup_payments.id
  probability          DOUBLE PRECISION NOT NULL, -- 0.0 – 1.0
  duplicate_type       VARCHAR NOT NULL,        -- see types below
  payment_system       VARCHAR NOT NULL,
  amount               DOUBLE PRECISION NOT NULL,
  currency             VARCHAR NOT NULL,
  sender_bic           VARCHAR,
  receiver_bic         VARCHAR,
  originator_country   VARCHAR,
  beneficiary_country  VARCHAR,
  payment_date1        VARCHAR,
  payment_date2        VARCHAR,
  status               VARCHAR NOT NULL,        -- see statuses below
  matched_fields       JSON,                    -- array of field names that matched
  detected_at          TIMESTAMP,
  notes                TEXT,
  scan_id              VARCHAR                  -- FK → dup_scan_records.id
);
```

**Duplicate types:**

| Value | Description |
|---|---|
| `exact_match` | All key fields identical |
| `uetr_duplicate` | Same UETR (ISO 20022 unique reference) |
| `fuzzy_amount_date` | Same amount + parties, dates within tolerance |
| `network_retry` | Network retry detected via timing pattern |
| `manual_resubmission` | Human re-entered the same payment |
| `system_reprocessing` | System reprocessed without idempotency check |
| `multi_source_consolidation` | Same payment received from multiple source systems |

**Review statuses:**

| Value | Description |
|---|---|
| `pending` | Not yet reviewed by any analyst |
| `under_review` | Assigned to an analyst actively reviewing |
| `confirmed_duplicate` | Analyst confirmed — payment blocked/reversed |
| `dismissed` | Analyst dismissed — not a real duplicate |

---

### `dup_users`
The 10 predefined analyst accounts. Passwords are not stored — login is username-only.

```sql
CREATE TABLE dup_users (
  id           VARCHAR PRIMARY KEY,
  username     VARCHAR NOT NULL UNIQUE,
  display_name VARCHAR NOT NULL,
  created_at   TIMESTAMP
);
```

**Predefined analysts:**

| id | username | display_name |
|---|---|---|
| user_1 | alice_chen | Alice Chen |
| user_2 | bob_martinez | Bob Martinez |
| user_3 | carol_smith | Carol Smith |
| user_4 | david_kim | David Kim |
| user_5 | emma_wilson | Emma Wilson |
| user_6 | frank_johnson | Frank Johnson |
| user_7 | grace_liu | Grace Liu |
| user_8 | henry_brown | Henry Brown |
| user_9 | iris_patel | Iris Patel |
| user_10 | james_taylor | James Taylor |

---

### `dup_user_reviews`
One row per analyst per duplicate payment. Tracks the analyst's decision.

```sql
CREATE TABLE dup_user_reviews (
  id                   VARCHAR PRIMARY KEY,
  user_id              VARCHAR NOT NULL,        -- FK → dup_users.id
  duplicate_payment_id VARCHAR NOT NULL,        -- FK → dup_duplicate_payments.id
  status               VARCHAR NOT NULL,        -- confirmed_duplicate | dismissed | pending | under_review
  notes                TEXT,
  created_at           TIMESTAMP,
  updated_at           TIMESTAMP
);
```

---

### `dup_user_review_messages`
Chat messages exchanged between an analyst and an AI agent during a review.

```sql
CREATE TABLE dup_user_review_messages (
  id        VARCHAR PRIMARY KEY,
  review_id VARCHAR NOT NULL,   -- FK → dup_user_reviews.id
  role      VARCHAR NOT NULL,   -- user | assistant
  content   TEXT NOT NULL,
  timestamp TIMESTAMP
);
```

---

### `dup_training_sessions`
Agent training sessions. Each analyst can run multiple training sessions per topic.

```sql
CREATE TABLE dup_training_sessions (
  id              VARCHAR PRIMARY KEY,
  training_type   VARCHAR NOT NULL,    -- e.g. swift_specialist | ach_expert | graph_agent
  title           VARCHAR NOT NULL,
  created_at      TIMESTAMP,
  last_message_at TIMESTAMP,
  message_count   INTEGER
);
```

---

### `dup_training_messages`
Individual messages within a training session.

```sql
CREATE TABLE dup_training_messages (
  id         VARCHAR PRIMARY KEY,
  session_id VARCHAR NOT NULL,   -- FK → dup_training_sessions.id
  role       VARCHAR NOT NULL,   -- user | assistant
  content    TEXT NOT NULL,
  timestamp  TIMESTAMP
);
```

---

### `dup_agent_memory`
Persistent facts and rules the Training Agent has learned and stored for future use.

```sql
CREATE TABLE dup_agent_memory (
  id         VARCHAR PRIMARY KEY,
  category   VARCHAR NOT NULL,   -- which agent/domain this memory belongs to
  key        VARCHAR NOT NULL UNIQUE,
  content    TEXT NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

### `dup_conversations`
General-purpose agent conversation threads (used by the Graph Chat and other agents).

```sql
CREATE TABLE dup_conversations (
  id         VARCHAR PRIMARY KEY,
  agent_type VARCHAR NOT NULL,
  created_at TIMESTAMP
);
```

---

### `dup_conversation_messages`
Messages within a general agent conversation.

```sql
CREATE TABLE dup_conversation_messages (
  id              VARCHAR PRIMARY KEY,
  conversation_id VARCHAR NOT NULL,   -- FK → dup_conversations.id
  role            VARCHAR NOT NULL,   -- user | assistant
  content         TEXT NOT NULL,
  timestamp       TIMESTAMP
);
```

---

### `dup_scan_records`
Audit log of every duplicate-detection scan run.

```sql
CREATE TABLE dup_scan_records (
  id               VARCHAR PRIMARY KEY,
  status           VARCHAR NOT NULL,   -- idle | running | completed | aborted | error
  payments_scanned INTEGER,
  duplicates_found INTEGER,
  progress         DOUBLE PRECISION,   -- 0.0 – 1.0
  current_phase    VARCHAR,
  started_at       TIMESTAMP,
  completed_at     TIMESTAMP,
  message          TEXT
);
```

---

### `dup_data_source_schemas`
Stores the schema definition presented to AI agents so they can generate correct SQL queries.

```sql
CREATE TABLE dup_data_source_schemas (
  id              VARCHAR PRIMARY KEY,
  name            VARCHAR NOT NULL,
  description     TEXT,
  tables          JSON,              -- array of table definitions with columns
  connection_hint TEXT,
  updated_at      TIMESTAMP
);
```

---

## Entity Relationships

```
dup_payments ──────────────────────────────────┐
  (payment1_id, payment2_id)                    │
         ↓                                      │
dup_duplicate_payments ←── scan_id ── dup_scan_records
         │
         ├── id ← dup_user_reviews.duplicate_payment_id
         │              │
         │              └── id ← dup_user_review_messages.review_id
         │
         └── (reviewed by) dup_users.id ← dup_user_reviews.user_id

dup_training_sessions.id ← dup_training_messages.session_id
dup_conversations.id     ← dup_conversation_messages.conversation_id
dup_agent_memory         (standalone — keyed by category + key)
dup_data_source_schemas  (standalone — one row per configured data source)
```

---

## Loading the Database

### Option 1 — Replit (automatic)
On Replit, the PostgreSQL database is provisioned automatically and `DATABASE_URL` is already set. The API server connects on startup with no extra steps. Run the setup SQL below once if starting from an empty database.

### Option 2 — AWS Self-Hosting (RDS)
1. Create an RDS PostgreSQL 15+ instance (or Aurora PostgreSQL-compatible).
2. Set the `DATABASE_URL` environment variable in your deployment (ECS task definition, EC2 `.env`, etc.):
   ```
   DATABASE_URL=postgresql://sentinel:<password>@<rds-endpoint>:5432/sentineldb
   ```
3. Run the schema creation script below against your RDS instance.
4. Run the seed script to load users and sample payment data.

---

## Schema Creation Script

Run this once against an empty database to create all tables:

```sql
-- Payments source data
CREATE TABLE IF NOT EXISTS dup_payments (
  id VARCHAR PRIMARY KEY,
  payment_system VARCHAR NOT NULL,
  message_type VARCHAR,
  source_system VARCHAR,
  channel VARCHAR,
  amount DOUBLE PRECISION NOT NULL,
  currency VARCHAR NOT NULL,
  value_date VARCHAR,
  status VARCHAR,
  priority VARCHAR,
  created_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  originator_name VARCHAR,
  originator_account VARCHAR,
  originator_country VARCHAR,
  sender_bic VARCHAR,
  sender_bank_name VARCHAR,
  beneficiary_name VARCHAR,
  beneficiary_account VARCHAR,
  beneficiary_country VARCHAR,
  receiver_bic VARCHAR,
  receiver_bank_name VARCHAR,
  uetr VARCHAR,
  transaction_reference VARCHAR,
  related_reference VARCHAR,
  end_to_end_id VARCHAR,
  correspondent_bank VARCHAR,
  trace_number VARCHAR,
  routing_number VARCHAR,
  sec_code VARCHAR,
  company_name VARCHAR,
  individual_name VARCHAR,
  batch_number VARCHAR,
  effective_date VARCHAR,
  internal_ref VARCHAR,
  from_account VARCHAR,
  to_account VARCHAR,
  gl_code VARCHAR,
  department VARCHAR,
  cost_centre VARCHAR,
  remittance_info TEXT,
  purpose_code VARCHAR,
  invoice_reference VARCHAR,
  is_scanned BOOLEAN
);

-- Detected duplicate pairs
CREATE TABLE IF NOT EXISTS dup_duplicate_payments (
  id VARCHAR PRIMARY KEY,
  payment1_id VARCHAR NOT NULL,
  payment2_id VARCHAR NOT NULL,
  probability DOUBLE PRECISION NOT NULL,
  duplicate_type VARCHAR NOT NULL,
  payment_system VARCHAR NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  currency VARCHAR NOT NULL,
  sender_bic VARCHAR,
  receiver_bic VARCHAR,
  originator_country VARCHAR,
  beneficiary_country VARCHAR,
  payment_date1 VARCHAR,
  payment_date2 VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'pending',
  matched_fields JSON,
  detected_at TIMESTAMP,
  notes TEXT,
  scan_id VARCHAR
);

-- Analyst users
CREATE TABLE IF NOT EXISTS dup_users (
  id VARCHAR PRIMARY KEY,
  username VARCHAR NOT NULL UNIQUE,
  display_name VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Per-analyst review decisions
CREATE TABLE IF NOT EXISTS dup_user_reviews (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  duplicate_payment_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Review chat messages
CREATE TABLE IF NOT EXISTS dup_user_review_messages (
  id VARCHAR PRIMARY KEY,
  review_id VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Training sessions
CREATE TABLE IF NOT EXISTS dup_training_sessions (
  id VARCHAR PRIMARY KEY,
  training_type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP,
  message_count INTEGER DEFAULT 0
);

-- Training session messages
CREATE TABLE IF NOT EXISTS dup_training_messages (
  id VARCHAR PRIMARY KEY,
  session_id VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Agent persistent memory
CREATE TABLE IF NOT EXISTS dup_agent_memory (
  id VARCHAR PRIMARY KEY,
  category VARCHAR NOT NULL,
  key VARCHAR NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- General agent conversations
CREATE TABLE IF NOT EXISTS dup_conversations (
  id VARCHAR PRIMARY KEY,
  agent_type VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversation messages
CREATE TABLE IF NOT EXISTS dup_conversation_messages (
  id VARCHAR PRIMARY KEY,
  conversation_id VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Scan audit log
CREATE TABLE IF NOT EXISTS dup_scan_records (
  id VARCHAR PRIMARY KEY,
  status VARCHAR NOT NULL DEFAULT 'idle',
  payments_scanned INTEGER DEFAULT 0,
  duplicates_found INTEGER DEFAULT 0,
  progress DOUBLE PRECISION DEFAULT 0.0,
  current_phase VARCHAR,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  message TEXT
);

-- AI agent data source schema registry
CREATE TABLE IF NOT EXISTS dup_data_source_schemas (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  tables JSON,
  connection_hint TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## User Seed Script

Load the 10 predefined analyst accounts:

```sql
INSERT INTO dup_users (id, username, display_name, created_at) VALUES
  ('user_1',  'alice_chen',    'Alice Chen',    NOW()),
  ('user_2',  'bob_martinez',  'Bob Martinez',  NOW()),
  ('user_3',  'carol_smith',   'Carol Smith',   NOW()),
  ('user_4',  'david_kim',     'David Kim',     NOW()),
  ('user_5',  'emma_wilson',   'Emma Wilson',   NOW()),
  ('user_6',  'frank_johnson', 'Frank Johnson', NOW()),
  ('user_7',  'grace_liu',     'Grace Liu',     NOW()),
  ('user_8',  'henry_brown',   'Henry Brown',   NOW()),
  ('user_9',  'iris_patel',    'Iris Patel',    NOW()),
  ('user_10', 'james_taylor',  'James Taylor',  NOW())
ON CONFLICT (id) DO NOTHING;
```

---

## Generating Payment Data

The Sentinel Console (Operations Console in the UI) includes a built-in scan engine that:
1. Reads real payments from `dup_payments` and runs candidate-pair SQL queries.
2. Scores pairs using probability rules and the 5-agent detector panel.
3. Writes detected pairs into `dup_duplicate_payments`.

To populate `dup_payments` with real data, load your bank's payment export as CSV/JSON and `INSERT` into the table mapping your field names to the columns above. The minimum required fields are:

- `id` (unique)
- `payment_system`
- `amount`
- `currency`

All other fields enrich duplicate detection quality — particularly `uetr`, `transaction_reference`, `trace_number`, `sender_bic`, `receiver_bic`, `originator_account`, and `beneficiary_account`.

---

## API Data Connections

The frontend connects exclusively through the REST API — there is no direct database access from the browser. All database queries go through:

```
Browser → React (dup-detect) → HTTP → API Server (api-server:8080) → PostgreSQL
```

Key API endpoints that read/write the database:

| Endpoint | Table(s) |
|---|---|
| `GET /api/duplicates` | `dup_duplicate_payments` |
| `GET /api/payments/:id` | `dup_payments` |
| `GET /api/dashboard/stats` | `dup_duplicate_payments`, `dup_scan_records` |
| `GET /api/dashboard/trend` | `dup_duplicate_payments` |
| `GET /api/dashboard/corridor-analysis` | `dup_duplicate_payments` |
| `POST /api/agents/detector-opinions` | `dup_duplicate_payments`, `dup_agent_memory` |
| `GET /api/user-reviews` | `dup_user_reviews` |
| `POST /api/user-reviews` | `dup_user_reviews` |
| `GET /api/training/sessions` | `dup_training_sessions` |
| `POST /api/training/sessions/:id/messages` | `dup_training_messages`, `dup_agent_memory` |
| `GET /api/training/memory` | `dup_agent_memory` |
| `DELETE /api/training/memory` | `dup_agent_memory` |
| `GET /api/console/scan/status` | (in-memory) |
| `POST /api/console/scan` | `dup_scan_records`, `dup_duplicate_payments` |
| `GET /api/schema/datasource` | `dup_data_source_schemas` |
| `POST /api/exports/duplicates` | `dup_duplicate_payments` |

---

## AWS Bedrock Notes

When self-hosting on AWS, replace the OpenAI-compatible AI integration with Amazon Bedrock by updating the model client in `artifacts/api-server/src/py-api/agents/`:

```
Model ID: anthropic.claude-3-5-sonnet-20241022-v2:0  (or your chosen Bedrock model)
Region:   set AWS_REGION env var
Auth:     IAM role on ECS/EC2 (no key needed) or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
```

All other database connectivity remains identical — only the AI model endpoint changes.
