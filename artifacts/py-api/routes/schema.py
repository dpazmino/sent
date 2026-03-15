import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from db import get_db, DataSourceSchemaRecord

router = APIRouter()


@router.get("/datasource")
def get_data_source_schema(db: Session = Depends(get_db)):
    schema = db.query(DataSourceSchemaRecord).first()
    if not schema:
        return {
            "id": "default",
            "name": "Payment Data Source",
            "description": "Define your payment data source schema here. The AI agents will use this to understand your database structure and generate accurate SQL queries.",
            "tables": [],
            "connectionHint": "",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
    
    return {
        "id": schema.id,
        "name": schema.name,
        "description": schema.description,
        "tables": schema.tables or [],
        "connectionHint": schema.connection_hint,
        "updatedAt": schema.updated_at.isoformat() if schema.updated_at else None,
    }


@router.put("/datasource")
def update_data_source_schema(body: dict, db: Session = Depends(get_db)):
    schema = db.query(DataSourceSchemaRecord).first()
    
    if not schema:
        schema = DataSourceSchemaRecord(
            id=str(uuid.uuid4()),
            name=body.get("name", "Payment Data Source"),
            description=body.get("description", ""),
            tables=body.get("tables", []),
            connection_hint=body.get("connectionHint", ""),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(schema)
    else:
        schema.name = body.get("name", schema.name)
        schema.description = body.get("description", schema.description)
        schema.tables = body.get("tables", schema.tables)
        schema.connection_hint = body.get("connectionHint", schema.connection_hint)
        schema.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return {
        "id": schema.id,
        "name": schema.name,
        "description": schema.description,
        "tables": schema.tables or [],
        "connectionHint": schema.connection_hint,
        "updatedAt": schema.updated_at.isoformat() if schema.updated_at else None,
    }
