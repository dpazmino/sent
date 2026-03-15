import uuid
import csv
import json
import io
import os
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from db import get_db, DuplicatePaymentRecord

router = APIRouter()


@router.post("/duplicates")
def export_duplicates(body: dict, db: Session = Depends(get_db)):
    fmt = body.get("format", "csv")
    filters = body.get("filters", {})
    
    query = db.query(DuplicatePaymentRecord)
    
    min_prob = filters.get("minProbability")
    if min_prob is not None:
        query = query.filter(DuplicatePaymentRecord.probability >= float(min_prob))
    
    payment_system = filters.get("paymentSystem")
    if payment_system:
        query = query.filter(DuplicatePaymentRecord.payment_system == payment_system)
    
    status = filters.get("status")
    if status:
        query = query.filter(DuplicatePaymentRecord.status == status)
    
    query = query.order_by(DuplicatePaymentRecord.probability.desc())
    records = query.limit(100000).all()
    
    export_id = str(uuid.uuid4())[:8]
    filename = f"duplicate_payments_{export_id}.{fmt}"
    
    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Payment1_ID", "Payment2_ID", "Probability", "Duplicate_Type",
            "Payment_System", "Amount", "Currency", "Sender_BIC", "Receiver_BIC",
            "Originator_Country", "Beneficiary_Country", "Payment_Date1", "Payment_Date2",
            "Status", "Matched_Fields", "Detected_At", "Notes"
        ])
        for r in records:
            writer.writerow([
                r.id, r.payment1_id, r.payment2_id, r.probability, r.duplicate_type,
                r.payment_system, r.amount, r.currency, r.sender_bic, r.receiver_bic,
                r.originator_country, r.beneficiary_country, r.payment_date1, r.payment_date2,
                r.status, json.dumps(r.matched_fields or []), 
                r.detected_at.isoformat() if r.detected_at else "", r.notes or ""
            ])
        content = output.getvalue()
        media_type = "text/csv"
    else:
        data = [{
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
            "originatorCountry": r.originator_country,
            "beneficiaryCountry": r.beneficiary_country,
            "paymentDate1": r.payment_date1,
            "paymentDate2": r.payment_date2,
            "status": r.status,
            "matchedFields": r.matched_fields or [],
            "detectedAt": r.detected_at.isoformat() if r.detected_at else None,
            "notes": r.notes,
        } for r in records]
        content = json.dumps(data, indent=2)
        media_type = "application/json"
    
    return {
        "downloadUrl": f"/py-api/exports/download/{export_id}?format={fmt}",
        "filename": filename,
        "recordCount": len(records),
        "format": fmt,
        "data": content,
    }


@router.get("/download/{export_id}")
def download_export(export_id: str, fmt: str = "csv", db: Session = Depends(get_db)):
    records = db.query(DuplicatePaymentRecord).order_by(
        DuplicatePaymentRecord.probability.desc()
    ).limit(100000).all()
    
    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Payment1_ID", "Payment2_ID", "Probability", "Duplicate_Type",
            "Payment_System", "Amount", "Currency", "Sender_BIC", "Receiver_BIC",
            "Originator_Country", "Beneficiary_Country", "Status", "Detected_At"
        ])
        for r in records:
            writer.writerow([
                r.id, r.payment1_id, r.payment2_id, r.probability, r.duplicate_type,
                r.payment_system, r.amount, r.currency, r.sender_bic, r.receiver_bic,
                r.originator_country, r.beneficiary_country, r.status,
                r.detected_at.isoformat() if r.detected_at else ""
            ])
        
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=duplicates_{export_id}.csv"}
        )
    else:
        data = [{"id": r.id, "probability": r.probability, "paymentSystem": r.payment_system} for r in records]
        return StreamingResponse(
            io.BytesIO(json.dumps(data, indent=2).encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=duplicates_{export_id}.json"}
        )
