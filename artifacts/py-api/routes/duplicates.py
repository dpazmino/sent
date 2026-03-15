from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import math
from db import get_db, DuplicatePaymentRecord

router = APIRouter()


def to_dict(rec: DuplicatePaymentRecord) -> dict:
    return {
        "id": rec.id,
        "payment1Id": rec.payment1_id,
        "payment2Id": rec.payment2_id,
        "probability": rec.probability,
        "duplicateType": rec.duplicate_type,
        "paymentSystem": rec.payment_system,
        "amount": rec.amount,
        "currency": rec.currency,
        "senderBIC": rec.sender_bic,
        "receiverBIC": rec.receiver_bic,
        "originatorCountry": rec.originator_country,
        "beneficiaryCountry": rec.beneficiary_country,
        "paymentDate1": rec.payment_date1,
        "paymentDate2": rec.payment_date2,
        "status": rec.status,
        "matchedFields": rec.matched_fields or [],
        "detectedAt": rec.detected_at.isoformat() if rec.detected_at else None,
        "notes": rec.notes,
    }


@router.get("")
def get_duplicate_payments(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=500),
    minProbability: Optional[float] = None,
    paymentSystem: Optional[str] = None,
    status: Optional[str] = None,
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(DuplicatePaymentRecord)

    if minProbability is not None:
        query = query.filter(DuplicatePaymentRecord.probability >= minProbability)
    if paymentSystem:
        query = query.filter(DuplicatePaymentRecord.payment_system == paymentSystem)
    if status:
        query = query.filter(DuplicatePaymentRecord.status == status)

    query = query.order_by(DuplicatePaymentRecord.probability.desc(), DuplicatePaymentRecord.detected_at.desc())
    
    total = query.count()
    offset = (page - 1) * limit
    items = query.offset(offset).limit(limit).all()
    
    return {
        "items": [to_dict(r) for r in items],
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": math.ceil(total / limit) if total > 0 else 1,
    }


@router.get("/{dup_id}")
def get_duplicate_by_id(dup_id: str, db: Session = Depends(get_db)):
    rec = db.query(DuplicatePaymentRecord).filter(DuplicatePaymentRecord.id == dup_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Duplicate payment record not found")
    
    result = to_dict(rec)
    result["payment1Details"] = {
        "id": rec.payment1_id,
        "paymentSystem": rec.payment_system,
        "amount": rec.amount,
        "currency": rec.currency,
        "senderBIC": rec.sender_bic,
        "receiverBIC": rec.receiver_bic,
        "valueDate": rec.payment_date1,
        "originatorCountry": rec.originator_country,
    }
    result["payment2Details"] = {
        "id": rec.payment2_id,
        "paymentSystem": rec.payment_system,
        "amount": rec.amount,
        "currency": rec.currency,
        "senderBIC": rec.sender_bic,
        "receiverBIC": rec.receiver_bic,
        "valueDate": rec.payment_date2,
        "beneficiaryCountry": rec.beneficiary_country,
    }
    result["agentExplanations"] = []
    return result


@router.patch("/{dup_id}/status")
def update_duplicate_status(
    dup_id: str,
    body: dict,
    db: Session = Depends(get_db),
):
    rec = db.query(DuplicatePaymentRecord).filter(DuplicatePaymentRecord.id == dup_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    
    valid_statuses = ["pending", "confirmed_duplicate", "dismissed", "under_review"]
    new_status = body.get("status")
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    rec.status = new_status
    if "notes" in body:
        rec.notes = body["notes"]
    
    db.commit()
    db.refresh(rec)
    return to_dict(rec)
