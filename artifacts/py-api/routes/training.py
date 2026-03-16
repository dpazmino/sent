import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from db import get_db, TrainingSessionRecord, TrainingMessageRecord, AgentMemoryRecord
from agents.training_agent import run_training_agent

router = APIRouter()


@router.get("/sessions")
def get_training_sessions(db: Session = Depends(get_db)):
    sessions = db.query(TrainingSessionRecord).order_by(TrainingSessionRecord.created_at.desc()).all()
    return {
        "sessions": [{
            "id": s.id,
            "trainingType": s.training_type,
            "title": s.title,
            "createdAt": s.created_at.isoformat() if s.created_at else None,
            "messageCount": s.message_count,
            "lastMessageAt": s.last_message_at.isoformat() if s.last_message_at else None,
        } for s in sessions]
    }


@router.post("/sessions")
def create_training_session(body: dict, db: Session = Depends(get_db)):
    training_type = body.get("trainingType", "general")
    title = body.get("title", "Training Session")
    
    valid_types = ["database_schema", "duplicate_definition", "general"]
    if training_type not in valid_types:
        raise HTTPException(400, f"Invalid trainingType. Must be one of: {valid_types}")
    
    session = TrainingSessionRecord(
        id=str(uuid.uuid4()),
        training_type=training_type,
        title=title,
        created_at=datetime.now(timezone.utc),
        message_count=0,
    )
    db.add(session)
    db.commit()
    
    return {
        "id": session.id,
        "trainingType": session.training_type,
        "title": session.title,
        "createdAt": session.created_at.isoformat(),
        "messageCount": 0,
        "lastMessageAt": None,
    }


@router.post("/sessions/{session_id}/messages")
async def send_training_message(session_id: str, body: dict, db: Session = Depends(get_db)):
    session = db.query(TrainingSessionRecord).filter(TrainingSessionRecord.id == session_id).first()
    if not session:
        raise HTTPException(404, "Training session not found")
    
    user_message = body.get("message", "")
    
    # Load DB history for restart-recovery: if LangGraph MemorySaver is empty
    # (e.g., after a server restart), run_training_agent will re-sync from this list.
    history_records = db.query(TrainingMessageRecord).filter(
        TrainingMessageRecord.session_id == session_id
    ).order_by(TrainingMessageRecord.timestamp).all()
    db_history = [{"role": m.role, "content": m.content} for m in history_records]

    result = await run_training_agent(user_message, session.training_type, session_id, db_history)
    
    user_msg = TrainingMessageRecord(
        id=str(uuid.uuid4()),
        session_id=session_id,
        role="user",
        content=user_message,
        timestamp=datetime.now(timezone.utc),
    )
    asst_msg = TrainingMessageRecord(
        id=str(uuid.uuid4()),
        session_id=session_id,
        role="assistant",
        content=result["response"],
        timestamp=datetime.now(timezone.utc),
    )
    db.add(user_msg)
    db.add(asst_msg)
    
    session.message_count = (session.message_count or 0) + 2
    session.last_message_at = datetime.now(timezone.utc)
    
    if result.get("memorySaved") and result.get("memoryKey"):
        existing = db.query(AgentMemoryRecord).filter(
            AgentMemoryRecord.key == result["memoryKey"]
        ).first()
        if existing:
            existing.content = result.get("memoryContent", "")
            existing.updated_at = datetime.now(timezone.utc)
        else:
            memory = AgentMemoryRecord(
                id=str(uuid.uuid4()),
                category=session.training_type,
                key=result["memoryKey"],
                content=result.get("memoryContent", ""),
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(memory)
    
    db.commit()
    
    return {
        "response": result["response"],
        "memorySaved": result.get("memorySaved", False),
        "memoryKey": result.get("memoryKey"),
    }


@router.get("/memory")
def get_agent_memory(db: Session = Depends(get_db)):
    memories = db.query(AgentMemoryRecord).order_by(AgentMemoryRecord.updated_at.desc()).all()
    return {
        "memories": [{
            "id": m.id,
            "category": m.category,
            "key": m.key,
            "content": m.content,
            "createdAt": m.created_at.isoformat() if m.created_at else None,
            "updatedAt": m.updated_at.isoformat() if m.updated_at else None,
        } for m in memories],
        "totalEntries": len(memories),
    }


@router.delete("/memory")
def clear_agent_memory(db: Session = Depends(get_db)):
    deleted = db.query(AgentMemoryRecord).delete()
    db.commit()
    return {"success": True, "message": f"Cleared {deleted} memory entries"}
