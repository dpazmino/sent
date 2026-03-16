import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db import get_db, ConversationRecord, ConversationMessageRecord, DuplicatePaymentRecord, AgentMemoryRecord
from agents.master_agent import run_master_agent, MASTER_AGENT_SYSTEM_PROMPT
from agents.text_to_sql_agent import generate_sql, generate_graph_spec, TEXT_TO_SQL_SYSTEM_PROMPT, GRAPH_SYSTEM_PROMPT
from agents.detector_agents import get_all_detector_opinions, DETECTOR_AGENTS
from agents.training_agent import TRAINING_AGENT_SYSTEM_PROMPT  # noqa: F401 — displayed in agent list
from datetime import datetime, timezone

router = APIRouter()

ALL_AGENTS = [
    {
        "id": "master",
        "name": "Master Detection Agent",
        "category": "orchestrator",
        "description": "Top-level agent that orchestrates all detection activity. Knows every payment standard — SWIFT MT/MX, ACH, ISO 20022 — and provides expert analysis and recommendations.",
        "focus": "All payment systems",
        "systemPrompt": MASTER_AGENT_SYSTEM_PROMPT,
        "isTrainable": False,
    },
    {
        "id": "text_to_sql",
        "name": "Text-to-SQL Agent",
        "category": "utility",
        "description": "Converts natural language questions into precise SQL queries against the payment database. Learns schema definitions from training sessions.",
        "focus": "Database querying",
        "systemPrompt": TEXT_TO_SQL_SYSTEM_PROMPT,
        "isTrainable": False,
    },
    {
        "id": "graph_chart",
        "name": "Graph & Chart Agent",
        "category": "utility",
        "description": "Generates chart specifications from natural language requests for data visualisation in the AI Graph Chat interface.",
        "focus": "Data visualisation",
        "systemPrompt": GRAPH_SYSTEM_PROMPT,
        "isTrainable": False,
    },
    {
        "id": "training",
        "name": "Training Agent",
        "category": "memory",
        "description": "Manages persistent agent memory. Accepts schema definitions and custom duplicate rules from analysts and stores them for use by other agents. Uses LangGraph ConversationBufferMemory for full conversation persistence.",
        "focus": "Schema & rule learning",
        "systemPrompt": TRAINING_AGENT_SYSTEM_PROMPT,
        "isTrainable": True,
    },
] + [
    {
        "id": f"detector_{agent['name'].lower()}",
        "name": agent["name"].replace("_", " "),
        "category": "detector",
        "description": agent["description"],
        "focus": agent["focus"],
        "systemPrompt": agent["system_prompt"],
        "isTrainable": False,
    }
    for agent in DETECTOR_AGENTS
]


@router.get("/list")
async def list_agents():
    return {"agents": ALL_AGENTS}


import re as _re

def _extract_distilled_rule(text: str) -> str:
    """
    Pull the clean rule out of a stored memory record.
    Handles both old format (verbose conversation log) and new format (clean rule string).
    Priority:
      1. "Rule: ..." prefix (new format)
      2. "I'll remember: ..." clause inside Agent response
      3. Raw content up to 300 chars
    """
    # New format: starts with "Rule: "
    m = _re.search(r"(?:^|\n)Rule:\s*(.+?)(?:\n|$)", text, _re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # Old format: extract from Agent response
    agent_resp = _re.search(r"Agent response: '(.*?)'", text, _re.DOTALL)
    if agent_resp:
        inner = agent_resp.group(1)
        remember = _re.search(r"I[''\u2019]ll remember:?\s*(.+?)(?:\n|$)", inner, _re.IGNORECASE)
        if remember:
            return remember.group(1).strip()
        return inner[:250]
    # Analyst said field only
    analyst = _re.search(r"Analyst said: '(.*?)'", text)
    if analyst:
        return analyst.group(1).strip()
    return text[:250]


def _format_analyst_rules(memories: list) -> str:
    """
    Format a list of AgentMemoryRecord objects as clear, prioritised rules
    suitable for injection into a system prompt.
    """
    if not memories:
        return ""
    lines = []
    for m in memories:
        rule = _extract_distilled_rule(m.content)
        # Add lightweight payment-system context parsed from the key
        ctx_match = _re.search(r"review_([A-Z_]+)_([a-z_]+)_", m.key)
        ctx = f"[{ctx_match.group(1)}/{ctx_match.group(2)}] " if ctx_match else ""
        lines.append(f"• {ctx}{rule}")
    return "\n".join(lines)


def get_memory_context(db: Session) -> str:
    memories = db.query(AgentMemoryRecord).order_by(AgentMemoryRecord.updated_at.desc()).limit(20).all()
    if not memories:
        return ""
    parts = []
    for m in memories:
        rule = _extract_distilled_rule(m.content)
        parts.append(f"[{m.category}] {rule}")
    return "\n".join(parts)


def get_conversation_history(conversation_id: str, db: Session) -> list:
    msgs = db.query(ConversationMessageRecord).filter(
        ConversationMessageRecord.conversation_id == conversation_id
    ).order_by(ConversationMessageRecord.timestamp).all()
    return [{"role": m.role, "content": m.content} for m in msgs]


@router.post("/chat")
async def chat_with_agent(body: dict, db: Session = Depends(get_db)):
    message = body.get("message", "")
    agent_type = body.get("agentType", "master")
    conversation_id = body.get("conversationId")
    
    if not conversation_id:
        conv = ConversationRecord(
            id=str(uuid.uuid4()),
            agent_type=agent_type,
            created_at=datetime.now(timezone.utc),
        )
        db.add(conv)
        db.commit()
        conversation_id = conv.id
    
    history = get_conversation_history(conversation_id, db)
    memory_context = get_memory_context(db)
    
    sql_generated = None
    data_returned = None
    
    if agent_type == "master":
        response = await run_master_agent(message, history, memory_context)
    elif agent_type == "text_to_sql":
        schema_memories = db.query(AgentMemoryRecord).filter(
            AgentMemoryRecord.category == "database_schema"
        ).all()
        schema_ctx = "\n".join(f"{m.key}: {m.content}" for m in schema_memories)
        sql_generated = await generate_sql(message, schema_ctx)
        response = f"Generated SQL query:\n```sql\n{sql_generated}\n```\n\nThis query would fetch the data you're looking for from the payment database."
    else:
        response = await run_master_agent(message, history, memory_context)
    
    user_msg = ConversationMessageRecord(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role="user",
        content=message,
        timestamp=datetime.now(timezone.utc),
    )
    asst_msg = ConversationMessageRecord(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role="assistant",
        content=response,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(user_msg)
    db.add(asst_msg)
    db.commit()
    
    return {
        "response": response,
        "conversationId": conversation_id,
        "agentType": agent_type,
        "sqlGenerated": sql_generated,
        "dataReturned": data_returned,
    }


def _safe_execute_sql(db: Session, sql: str) -> list:
    """Execute a read-only SQL query and return rows as list of dicts. Rejects non-SELECT statements."""
    sql_clean = sql.strip().rstrip(";")
    first_word = sql_clean.split()[0].upper() if sql_clean else ""
    if first_word != "SELECT":
        return []
    # Only allow queries against dup_ tables for safety
    lower = sql_clean.lower()
    forbidden = ["drop", "delete", "insert", "update", "truncate", "alter", "create"]
    if any(w in lower for w in forbidden):
        return []
    try:
        from sqlalchemy import text as sa_text
        result = db.execute(sa_text(sql_clean))
        keys = list(result.keys())
        rows = []
        for row in result.fetchall():
            row_dict = {}
            for i, key in enumerate(keys):
                val = row[i]
                # Serialise non-JSON-native types
                if hasattr(val, "isoformat"):
                    val = val.isoformat()
                elif val is not None:
                    try:
                        val = float(val) if isinstance(val, (int, float)) else str(val)
                    except Exception:
                        val = str(val)
                row_dict[key] = val
            rows.append(row_dict)
        return rows
    except Exception as e:
        print(f"SQL execution error: {e}")
        return []


@router.post("/graph-query")
async def graph_query(body: dict, db: Session = Depends(get_db)):
    query = body.get("query", "")
    conversation_id = body.get("conversationId")

    if not conversation_id:
        conv = ConversationRecord(
            id=str(uuid.uuid4()),
            agent_type="graph",
            created_at=datetime.now(timezone.utc),
        )
        db.add(conv)
        db.commit()
        conversation_id = conv.id

    memory_context = get_memory_context(db)

    # Step 1: load schema memory so Text-to-SQL knows user-defined tables
    schema_memories = db.query(AgentMemoryRecord).filter(
        AgentMemoryRecord.category == "database_schema"
    ).all()
    schema_ctx = "\n".join(f"{m.key}: {m.content}" for m in schema_memories)

    # Step 2: generate SQL from natural language
    sql_generated = await generate_sql(query, schema_ctx)

    # Step 3: execute against the real database
    real_data = _safe_execute_sql(db, sql_generated)

    # Step 4: build chart spec from real results
    spec = await generate_graph_spec(
        query=query,
        sql_used=sql_generated,
        real_data=real_data,
        memory_context=memory_context,
    )

    explanation = spec.pop("explanation", "Chart generated from live database query.")

    db.add(ConversationMessageRecord(
        id=str(uuid.uuid4()), conversation_id=conversation_id,
        role="user", content=query, timestamp=datetime.now(timezone.utc),
    ))
    db.add(ConversationMessageRecord(
        id=str(uuid.uuid4()), conversation_id=conversation_id,
        role="assistant", content=explanation, timestamp=datetime.now(timezone.utc),
    ))
    db.commit()

    return {
        "graphSpec": spec,
        "explanation": explanation,
        "sqlUsed": sql_generated,
        "rowCount": len(real_data),
        "conversationId": conversation_id,
    }


@router.post("/payment-review")
async def payment_review(body: dict, db: Session = Depends(get_db)):
    """
    Interactive review session for a specific duplicate payment pair.
    - First call (no message): loads the record, asks all 5 detector agents, synthesises analysis
    - Subsequent calls: continues dialogue, saves analyst feedback as memory
    """
    duplicate_id = body.get("duplicateId", "")
    message = body.get("message", "")  # empty on first call
    conversation_id = body.get("conversationId")

    record = db.query(DuplicatePaymentRecord).filter(DuplicatePaymentRecord.id == duplicate_id).first()
    if not record:
        return {"error": f"Record {duplicate_id} not found"}

    payment_data = {
        "id": record.id,
        "payment1Id": record.payment1_id,
        "payment2Id": record.payment2_id,
        "probability": record.probability,
        "duplicateType": record.duplicate_type,
        "paymentSystem": record.payment_system,
        "amount": record.amount,
        "currency": record.currency,
        "senderBIC": record.sender_bic,
        "receiverBIC": record.receiver_bic,
        "originatorCountry": record.originator_country,
        "beneficiaryCountry": record.beneficiary_country,
        "paymentDate1": record.payment_date1,
        "paymentDate2": record.payment_date2,
        "matchedFields": record.matched_fields or [],
        "status": record.status,
        "notes": record.notes,
    }

    # Load or create conversation
    if not conversation_id:
        conv = ConversationRecord(
            id=str(uuid.uuid4()),
            agent_type="payment_review",
            created_at=datetime.now(timezone.utc),
        )
        db.add(conv)
        db.commit()
        conversation_id = conv.id

    history = get_conversation_history(conversation_id, db)

    # Load memory — format as clear, prioritised analyst rules
    dup_def_memories = db.query(AgentMemoryRecord).filter(
        AgentMemoryRecord.category == "duplicate_definition"
    ).order_by(AgentMemoryRecord.updated_at.desc()).limit(20).all()
    analyst_rules = _format_analyst_rules(dup_def_memories)
    analyst_rules_section = (
        "ANALYST-CONFIRMED RULES (THESE OVERRIDE YOUR GENERAL KNOWLEDGE — apply them explicitly):\n"
        + analyst_rules
    ) if analyst_rules else ""

    # --- FIRST CALL: consult all 5 detector agents and synthesise ---
    detector_opinions = None
    if not message:
        opinions_result = await get_all_detector_opinions([payment_data], analyst_rules)
        detector_opinions = opinions_result.get("opinions", [])

        opinions_summary = ""
        for op in detector_opinions:
            agent_name = op.get("agentName", "Unknown")
            confidence = round(op.get("confidence", 0) * 100, 1)
            is_dup = op.get("isDuplicate", True)
            reasoning = op.get("reasoning", "")
            verdict = "IS duplicate" if is_dup else "NOT duplicate"
            opinions_summary += f"\n**{agent_name}** ({confidence}% confidence) — {verdict}\n{reasoning}\n"

        matched_fields_str = ", ".join(record.matched_fields or [])

        system_prompt = f"""You are a Payment Review Training Agent helping an analyst decide if a flagged payment pair is genuinely a duplicate.

Your job: present the detector agent findings clearly, apply any analyst-confirmed rules explicitly, give your synthesised assessment, then invite the analyst to agree or disagree.

RULE-CITATION GUARDRAIL (STRICTLY ENFORCED):
- You may ONLY cite a rule as "analyst-confirmed" if it appears verbatim in the ANALYST-CONFIRMED RULES list below.
- If the analyst mentions a factor not covered by any listed rule, do NOT invent a rule. Instead say: "I don't have a confirmed rule about [factor] yet. Are you saying [your interpretation]? Please confirm and I'll record it."
- Only say "I'll remember: [rule]" after the analyst EXPLICITLY confirms the new rule.
- NEVER say "According to analyst-confirmed rules..." for anything not in the list.

When you DO apply a listed rule, say: "Based on the confirmed rule that [rule], ..."
When the analyst confirms a new rule, say: "I'll remember: [one-sentence rule]"
When the analyst corrects you, say: "I understand — I'll remember: [corrected one-sentence rule]"

Payment Record:
- IDs: {record.payment1_id} <-> {record.payment2_id}
- System: {record.payment_system} | Type: {record.duplicate_type}
- Amount: {record.amount} {record.currency}
- Sender BIC: {record.sender_bic} | Receiver BIC: {record.receiver_bic}
- Payment Dates: {record.payment_date1} / {record.payment_date2}
- Matched Fields: {matched_fields_str}
- Probability Score: {round(record.probability * 100, 1)}%

Detector Agent Opinions:
{opinions_summary}

{analyst_rules_section}
"""
        initial_user_msg = "Please analyse this duplicate payment pair and summarise what each detector agent found."
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": initial_user_msg},
        ]
    else:
        # --- SUBSEQUENT CALLS: continue conversation ---
        system_prompt = f"""You are a Payment Review Training Agent in an ongoing review session.

Payment Record: {record.payment1_id} <-> {record.payment2_id} ({record.payment_system}, {record.amount} {record.currency}, {record.duplicate_type})

{analyst_rules_section}

RULE-CITATION GUARDRAIL (STRICTLY ENFORCED):
- You may ONLY cite a rule as "analyst-confirmed" if it appears verbatim in the ANALYST-CONFIRMED RULES list above.
- If the analyst mentions a factor NOT covered by any listed rule, do NOT invent or imply a rule. Instead say exactly: "I don't have a confirmed rule about [factor] yet. Are you saying [your interpretation]? Please confirm and I'll record it as a new rule."
- NEVER say "According to analyst-confirmed rules..." unless the specific fact is in the list above.
- Only say "I'll remember: [rule]" after the analyst EXPLICITLY confirms the new rule in this conversation.

When applying a listed rule: "Based on the confirmed rule that [rule], ..."
When the analyst confirms a new rule: "I'll remember: [one-sentence rule]"
When the analyst corrects you: "I understand — I'll remember: [corrected one-sentence rule]"
"""
        messages = [{"role": "system", "content": system_prompt}]
        for h in history[-20:]:
            messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": message})

    # Call OpenAI
    import os
    from openai import AsyncOpenAI
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    client = AsyncOpenAI(base_url=base_url, api_key=api_key) if base_url else AsyncOpenAI(api_key=api_key)

    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=1200,
        messages=messages,
    )
    response_text = completion.choices[0].message.content or ""

    # Save messages to conversation history
    user_content = message if message else "Please analyse this duplicate payment pair and summarise what each detector agent found."
    db.add(ConversationMessageRecord(
        id=str(uuid.uuid4()), conversation_id=conversation_id,
        role="user", content=user_content, timestamp=datetime.now(timezone.utc),
    ))
    db.add(ConversationMessageRecord(
        id=str(uuid.uuid4()), conversation_id=conversation_id,
        role="assistant", content=response_text, timestamp=datetime.now(timezone.utc),
    ))

    # Save to memory ONLY when the agent explicitly committed to a rule ("I'll remember: ...")
    # This prevents hallucinated responses from being saved as confirmed rules.
    memory_saved = False
    memory_key = None
    if message:
        remember_match = _re.search(
            r"I[''\u2019]ll remember:?\s*(.+?)(?:\n|$)",
            response_text,
            _re.IGNORECASE,
        )
        if remember_match:
            distilled_rule = remember_match.group(1).strip()
            words = message.split()[:6]
            memory_key = f"review_{record.payment_system}_{record.duplicate_type}_{'_'.join(w.lower() for w in words if len(w) > 2)[:40]}"

            # Save as clean "Rule: ..." format so _extract_distilled_rule() picks it up perfectly
            clean_content = (
                f"Rule: {distilled_rule}\n"
                f"Context: {record.payment_system}/{record.duplicate_type}, "
                f"analyst said: '{message[:200]}'"
            )

            # Upsert: update existing record with this key, or insert new
            existing = db.query(AgentMemoryRecord).filter(AgentMemoryRecord.key == memory_key).first()
            if existing:
                existing.content = clean_content
                existing.updated_at = datetime.now(timezone.utc)
            else:
                db.add(AgentMemoryRecord(
                    id=str(uuid.uuid4()),
                    category="duplicate_definition",
                    key=memory_key,
                    content=clean_content,
                    updated_at=datetime.now(timezone.utc),
                ))
            memory_saved = True

    db.commit()

    return {
        "response": response_text,
        "conversationId": conversation_id,
        "memorySaved": memory_saved,
        "memoryKey": memory_key,
        "detectorOpinions": detector_opinions,
        "paymentRecord": payment_data,
    }


@router.post("/detector-opinions")
async def get_detector_opinions(body: dict, db: Session = Depends(get_db)):
    payment_ids = body.get("paymentIds", [])
    max_items = body.get("maxItems", 100)
    
    records = db.query(DuplicatePaymentRecord).filter(
        DuplicatePaymentRecord.id.in_(payment_ids[:max_items])
    ).all()
    
    if not records:
        records = db.query(DuplicatePaymentRecord).order_by(
            DuplicatePaymentRecord.probability.desc()
        ).limit(min(max_items, 20)).all()
    
    payments_data = [{
        "id": r.id,
        "payment1Id": r.payment1_id,
        "payment2Id": r.payment2_id,
        "probability": r.probability,
        "duplicateType": r.duplicate_type,
        "paymentSystem": r.payment_system,
        "amount": r.amount,
        "currency": r.currency,
        "senderBIC": r.sender_bic,
        "receiverBIC": r.receiver_bic,
        "matchedFields": r.matched_fields or [],
    } for r in records]
    
    dup_def_memories = db.query(AgentMemoryRecord).filter(
        AgentMemoryRecord.category == "duplicate_definition"
    ).all()
    memory_context = "\n".join(f"{m.key}: {m.content}" for m in dup_def_memories)
    
    result = await get_all_detector_opinions(payments_data, memory_context)
    return result
