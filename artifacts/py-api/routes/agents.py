import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db import get_db, ConversationRecord, ConversationMessageRecord, DuplicatePaymentRecord, AgentMemoryRecord
from agents.master_agent import run_master_agent
from agents.text_to_sql_agent import generate_sql, generate_graph_spec
from agents.detector_agents import get_all_detector_opinions
from datetime import datetime, timezone

router = APIRouter()


def get_memory_context(db: Session) -> str:
    memories = db.query(AgentMemoryRecord).order_by(AgentMemoryRecord.updated_at.desc()).limit(20).all()
    if not memories:
        return ""
    parts = []
    for m in memories:
        parts.append(f"[{m.category}] {m.key}: {m.content[:300]}")
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
    
    stats = db.query(DuplicatePaymentRecord).count()
    db_context = f"Database has {stats} duplicate payment records."
    
    spec = await generate_graph_spec(query, db_context, memory_context)
    
    explanation = spec.pop("explanation", "Chart generated based on your query.")
    sql_used = spec.pop("sql", "")
    
    user_msg = ConversationMessageRecord(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role="user",
        content=query,
        timestamp=datetime.now(timezone.utc),
    )
    asst_msg = ConversationMessageRecord(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role="assistant",
        content=explanation,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(user_msg)
    db.add(asst_msg)
    db.commit()
    
    return {
        "graphSpec": spec,
        "explanation": explanation,
        "sqlUsed": sql_used,
        "conversationId": conversation_id,
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
