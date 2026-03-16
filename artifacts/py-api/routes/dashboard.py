from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import Optional
from datetime import datetime, timedelta
from db import get_db, DuplicatePaymentRecord

router = APIRouter()


@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    # Dismissed = confirmed false positives; exclude them from risk metrics
    active = db.query(DuplicatePaymentRecord).filter(
        DuplicatePaymentRecord.status != "dismissed"
    )

    total = active.count()
    high = active.filter(DuplicatePaymentRecord.probability >= 0.8).count()
    medium = active.filter(
        DuplicatePaymentRecord.probability >= 0.5,
        DuplicatePaymentRecord.probability < 0.8
    ).count()
    low = active.filter(DuplicatePaymentRecord.probability < 0.5).count()

    amount_result = db.query(func.sum(DuplicatePaymentRecord.amount)).filter(
        DuplicatePaymentRecord.status != "dismissed"
    ).scalar() or 0

    confirmed = db.query(DuplicatePaymentRecord).filter(DuplicatePaymentRecord.status == "confirmed_duplicate").count()
    pending = db.query(DuplicatePaymentRecord).filter(DuplicatePaymentRecord.status == "pending").count()
    under_review = db.query(DuplicatePaymentRecord).filter(DuplicatePaymentRecord.status == "under_review").count()
    dismissed = db.query(DuplicatePaymentRecord).filter(DuplicatePaymentRecord.status == "dismissed").count()

    by_system_rows = db.query(
        DuplicatePaymentRecord.payment_system,
        func.count(DuplicatePaymentRecord.id)
    ).filter(
        DuplicatePaymentRecord.status != "dismissed"
    ).group_by(DuplicatePaymentRecord.payment_system).all()
    by_system = {row[0]: row[1] for row in by_system_rows}

    last_rec = db.query(DuplicatePaymentRecord).order_by(DuplicatePaymentRecord.detected_at.desc()).first()

    return {
        "totalDuplicatesFound": total,
        "highProbabilityCount": high,
        "mediumProbabilityCount": medium,
        "lowProbabilityCount": low,
        "totalAmountAtRisk": round(float(amount_result), 2),
        "confirmedDuplicates": confirmed,
        "pendingReview": pending,
        "underReviewCount": under_review,
        "dismissedCount": dismissed,
        "byPaymentSystem": by_system,
        "lastScanAt": last_rec.detected_at.isoformat() if last_rec and last_rec.detected_at else None,
        "scanCoverage": min(total, 1000000),
    }


@router.get("/corridor-analysis")
def get_corridor_analysis(
    topN: int = Query(default=20, ge=1, le=100),
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(
        DuplicatePaymentRecord.originator_country,
        DuplicatePaymentRecord.beneficiary_country,
        func.count(DuplicatePaymentRecord.id).label("duplicate_count"),
        func.sum(DuplicatePaymentRecord.amount).label("total_amount"),
        func.avg(DuplicatePaymentRecord.probability).label("avg_probability"),
    ).filter(
        DuplicatePaymentRecord.originator_country.isnot(None),
        DuplicatePaymentRecord.beneficiary_country.isnot(None),
    ).group_by(
        DuplicatePaymentRecord.originator_country,
        DuplicatePaymentRecord.beneficiary_country,
    ).order_by(
        func.count(DuplicatePaymentRecord.id).desc()
    ).limit(topN)
    
    rows = query.all()
    corridors = []
    for row in rows:
        corridors.append({
            "originCountry": row[0],
            "destCountry": row[1],
            "corridor": f"{row[0]} → {row[1]}",
            "duplicateCount": row[2],
            "totalAmount": round(float(row[3] or 0), 2),
            "avgProbability": round(float(row[4] or 0), 4),
        })
    
    return {"corridors": corridors, "totalCorridors": len(corridors)}


@router.get("/trend")
def get_trend_data(
    period: str = Query(default="daily", regex="^(daily|weekly|monthly)$"),
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if period == "daily":
        trunc = func.date_trunc("day", DuplicatePaymentRecord.detected_at)
    elif period == "weekly":
        trunc = func.date_trunc("week", DuplicatePaymentRecord.detected_at)
    else:
        trunc = func.date_trunc("month", DuplicatePaymentRecord.detected_at)
    
    rows = db.query(
        trunc.label("date_bucket"),
        func.count(DuplicatePaymentRecord.id).label("cnt"),
        func.sum(DuplicatePaymentRecord.amount).label("total"),
        func.avg(DuplicatePaymentRecord.probability).label("avg_prob"),
    ).group_by("date_bucket").order_by("date_bucket").all()
    
    data = []
    for row in rows:
        data.append({
            "date": row[0].isoformat() if row[0] else "",
            "count": row[1],
            "amount": round(float(row[2] or 0), 2),
            "avgProbability": round(float(row[3] or 0), 4),
        })
    
    return {"data": data, "period": period}


@router.get("/by-system")
def get_by_system(db: Session = Depends(get_db)):
    total = db.query(DuplicatePaymentRecord).count() or 1
    
    rows = db.query(
        DuplicatePaymentRecord.payment_system,
        func.count(DuplicatePaymentRecord.id).label("cnt"),
        func.sum(DuplicatePaymentRecord.amount).label("amt"),
    ).group_by(DuplicatePaymentRecord.payment_system).all()
    
    data = []
    for row in rows:
        data.append({
            "system": row[0],
            "count": row[1],
            "amount": round(float(row[2] or 0), 2),
            "percentage": round(row[1] / total * 100, 2),
        })
    
    return {"data": data}
