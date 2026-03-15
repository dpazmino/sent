"""
Payment source database browse endpoints.
Lets the frontend (and future external apps) inspect the simulated payment ledger.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text

from db import get_db, PaymentRecord

router = APIRouter()


def _row_to_dict(r: PaymentRecord) -> dict:
    return {c.name: getattr(r, c.name) for c in r.__table__.columns}


@router.get("")
def list_payments(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    payment_system: str = Query(None),
    source_system: str = Query(None),
    currency: str = Query(None),
    status: str = Query(None),
    search: str = Query(None),
):
    q = db.query(PaymentRecord)
    if payment_system:
        q = q.filter(PaymentRecord.payment_system == payment_system)
    if source_system:
        q = q.filter(PaymentRecord.source_system == source_system)
    if currency:
        q = q.filter(PaymentRecord.currency == currency)
    if status:
        q = q.filter(PaymentRecord.status == status)
    if search:
        like = f"%{search}%"
        q = q.filter(
            PaymentRecord.id.ilike(like)
            | PaymentRecord.originator_name.ilike(like)
            | PaymentRecord.beneficiary_name.ilike(like)
            | PaymentRecord.uetr.ilike(like)
            | PaymentRecord.trace_number.ilike(like)
            | PaymentRecord.transaction_reference.ilike(like)
            | PaymentRecord.end_to_end_id.ilike(like)
        )

    total = q.count()
    rows = q.order_by(PaymentRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "pageSize": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
        "payments": [_row_to_dict(r) for r in rows],
    }


@router.get("/stats")
def payment_stats(db: Session = Depends(get_db)):
    total = db.query(PaymentRecord).count()

    by_system = db.execute(sa_text(
        "SELECT payment_system, COUNT(*) AS cnt FROM dup_payments "
        "GROUP BY payment_system ORDER BY cnt DESC"
    )).fetchall()

    by_source = db.execute(sa_text(
        "SELECT source_system, COUNT(*) AS cnt FROM dup_payments "
        "WHERE source_system IS NOT NULL GROUP BY source_system ORDER BY cnt DESC"
    )).fetchall()

    by_currency = db.execute(sa_text(
        "SELECT currency, COUNT(*) AS cnt, SUM(amount) AS total_amount "
        "FROM dup_payments GROUP BY currency ORDER BY cnt DESC LIMIT 10"
    )).fetchall()

    by_status = db.execute(sa_text(
        "SELECT status, COUNT(*) AS cnt FROM dup_payments GROUP BY status ORDER BY cnt DESC"
    )).fetchall()

    by_msg_type = db.execute(sa_text(
        "SELECT message_type, COUNT(*) AS cnt FROM dup_payments "
        "WHERE message_type IS NOT NULL GROUP BY message_type ORDER BY cnt DESC LIMIT 15"
    )).fetchall()

    return {
        "total": total,
        "byPaymentSystem": [{"system": r[0], "count": int(r[1])} for r in by_system],
        "bySourceSystem": [{"system": r[0], "count": int(r[1])} for r in by_source],
        "byCurrency": [{"currency": r[0], "count": int(r[1]), "totalAmount": float(r[2] or 0)} for r in by_currency],
        "byStatus": [{"status": r[0], "count": int(r[1])} for r in by_status],
        "byMessageType": [{"type": r[0], "count": int(r[1])} for r in by_msg_type],
    }


@router.get("/{payment_id}")
def get_payment(payment_id: str, db: Session = Depends(get_db)):
    r = db.query(PaymentRecord).filter(PaymentRecord.id == payment_id).first()
    if not r:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Payment not found")
    return _row_to_dict(r)
