"""
User Reviews API — per-analyst duplicate payment review workflow.

Flow:
1. GET  /py-api/user-reviews/users            → list all 10 analysts
2. POST /py-api/user-reviews/fetch            → Master+Text-to-SQL fetch → assign to user
3. GET  /py-api/user-reviews/{user_id}        → list this user's review queue
4. GET  /py-api/user-reviews/{user_id}/{review_id}/opinions → get detector opinions
5. POST /py-api/user-reviews/{user_id}/{review_id}/chat     → chat with Review Agent
6. PATCH /py-api/user-reviews/{user_id}/{review_id}/status  → direct status update
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from db import (
    get_db, PREDEFINED_USERS,
    UserRecord, UserReviewRecord, UserReviewMessageRecord,
    DuplicatePaymentRecord,
)
from agents.review_agent import run_review_agent
from agents.detector_agents import get_all_detector_opinions
from agents.master_agent import run_master_agent

router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────────────

def _sync_global_status(rev: UserReviewRecord, new_status: str, db: Session) -> None:
    """Mirror an analyst's review decision back to the duplicate payments DB.

    Last writer wins — whichever analyst acted most recently sets the global
    status.  The main payments table (PaymentRecord) is never touched.
    """
    dup = db.query(DuplicatePaymentRecord).filter(
        DuplicatePaymentRecord.id == rev.duplicate_payment_id
    ).first()
    if dup:
        dup.status = new_status


def _review_to_dict(rev: UserReviewRecord, dup: DuplicatePaymentRecord) -> dict:
    return {
        "id": rev.id,
        "userId": rev.user_id,
        "duplicatePaymentId": rev.duplicate_payment_id,
        "status": rev.status,
        "notes": rev.notes,
        "createdAt": rev.created_at.isoformat() if rev.created_at else None,
        "updatedAt": rev.updated_at.isoformat() if rev.updated_at else None,
        "payment": {
            "id": dup.id,
            "payment1Id": dup.payment1_id,
            "payment2Id": dup.payment2_id,
            "paymentDate1": dup.payment_date1,
            "paymentDate2": dup.payment_date2,
            "paymentSystem": dup.payment_system,
            "duplicateType": dup.duplicate_type,
            "amount": dup.amount,
            "currency": dup.currency,
            "probability": dup.probability,
            "senderBIC": dup.sender_bic,
            "receiverBIC": dup.receiver_bic,
            "originatorCountry": dup.originator_country,
            "beneficiaryCountry": dup.beneficiary_country,
            "matchedFields": dup.matched_fields or [],
            "status": dup.status,
            "notes": dup.notes,
        },
    }


# ── 1. List all analysts ──────────────────────────────────────────────────────

@router.get("/users")
def list_users():
    return {"users": PREDEFINED_USERS}


# ── 2. Fetch duplicate payments and assign to user ────────────────────────────

@router.post("/fetch")
async def fetch_duplicate_payments(body: dict, db: Session = Depends(get_db)):
    """
    Master Agent + Text-to-SQL query the DB for pending duplicate payments,
    then assign any unreviewed records to this user.
    """
    user_id = body.get("userId", "")
    user = db.query(UserRecord).filter(UserRecord.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    # Query all duplicate payments (limit to most recent 200 for performance)
    all_dups = (
        db.query(DuplicatePaymentRecord)
        .order_by(DuplicatePaymentRecord.detected_at.desc())
        .limit(200)
        .all()
    )

    # Find which ones this user already has a review for
    existing_ids = {
        r.duplicate_payment_id
        for r in db.query(UserReviewRecord)
        .filter(UserReviewRecord.user_id == user_id)
        .all()
    }

    # Create review records for any not yet assigned
    new_reviews = []
    for dup in all_dups:
        if dup.id not in existing_ids:
            rev = UserReviewRecord(
                id=str(uuid.uuid4()),
                user_id=user_id,
                duplicate_payment_id=dup.id,
                status="pending",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(rev)
            new_reviews.append(rev)
    db.commit()

    total_assigned = len(existing_ids) + len(new_reviews)

    # Master Agent generates a brief summary
    summary_prompt = (
        f"You have fetched {len(all_dups)} duplicate payment records from the database "
        f"for analyst {user.display_name}. Of these, {len(new_reviews)} are newly assigned "
        f"and {len(existing_ids)} were already in their review queue. "
        f"Please provide a brief 2-sentence summary of what the analyst should expect to review, "
        f"mentioning the total count and suggesting they start with the highest probability records."
    )
    try:
        summary = await run_master_agent(summary_prompt, [], "")
    except Exception:
        summary = (
            f"Fetched {len(all_dups)} duplicate payment records for your review queue. "
            f"{len(new_reviews)} new records have been assigned — start with the highest probability pairs."
        )

    return {
        "totalFetched": len(all_dups),
        "newlyAssigned": len(new_reviews),
        "totalAssigned": total_assigned,
        "summary": summary,
    }


# ── 3. List user's review queue ───────────────────────────────────────────────

@router.get("/{user_id}")
def get_user_reviews(
    user_id: str,
    status: str = "",
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
):
    user = db.query(UserRecord).filter(UserRecord.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    query = db.query(UserReviewRecord).filter(UserReviewRecord.user_id == user_id)
    if status:
        query = query.filter(UserReviewRecord.status == status)

    total = query.count()
    reviews = (
        query.order_by(UserReviewRecord.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    dup_ids = [r.duplicate_payment_id for r in reviews]
    dup_map = {
        d.id: d
        for d in db.query(DuplicatePaymentRecord)
        .filter(DuplicatePaymentRecord.id.in_(dup_ids))
        .all()
    }

    items = []
    for rev in reviews:
        dup = dup_map.get(rev.duplicate_payment_id)
        if dup:
            items.append(_review_to_dict(rev, dup))

    return {
        "reviews": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": max(1, (total + page_size - 1) // page_size),
        "user": {"id": user.id, "username": user.username, "displayName": user.display_name},
    }


# ── 4. Get detector opinions for a specific review ────────────────────────────

@router.get("/{user_id}/{review_id}/opinions")
async def get_review_opinions(user_id: str, review_id: str, db: Session = Depends(get_db)):
    rev = db.query(UserReviewRecord).filter(
        UserReviewRecord.id == review_id,
        UserReviewRecord.user_id == user_id,
    ).first()
    if not rev:
        raise HTTPException(404, "Review not found")

    dup = db.query(DuplicatePaymentRecord).filter(
        DuplicatePaymentRecord.id == rev.duplicate_payment_id
    ).first()
    if not dup:
        raise HTTPException(404, "Duplicate payment record not found")

    payment_data = {
        "id": dup.id,
        "payment_system": dup.payment_system,
        "amount": dup.amount,
        "currency": dup.currency,
        "sender_bic": dup.sender_bic,
        "receiver_bic": dup.receiver_bic,
        "payment_date1": dup.payment_date1,
        "payment_date2": dup.payment_date2,
        "matched_fields": dup.matched_fields or [],
        "probability": dup.probability,
        "duplicate_type": dup.duplicate_type,
    }

    result = await get_all_detector_opinions([payment_data])
    return {"opinions": result.get("opinions", []), "consensus": result.get("consensus", {})}


# ── 5. Chat with Review Agent ─────────────────────────────────────────────────

@router.post("/{user_id}/{review_id}/chat")
async def chat_with_review_agent(
    user_id: str, review_id: str, body: dict, db: Session = Depends(get_db)
):
    rev = db.query(UserReviewRecord).filter(
        UserReviewRecord.id == review_id,
        UserReviewRecord.user_id == user_id,
    ).first()
    if not rev:
        raise HTTPException(404, "Review not found")

    user = db.query(UserRecord).filter(UserRecord.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    dup = db.query(DuplicatePaymentRecord).filter(
        DuplicatePaymentRecord.id == rev.duplicate_payment_id
    ).first()
    if not dup:
        raise HTTPException(404, "Duplicate payment record not found")

    message = body.get("message", "")
    detector_opinions = body.get("detectorOpinions", [])

    payment_data = {
        "id": dup.id,
        "payment1Id": dup.payment1_id,
        "payment2Id": dup.payment2_id,
        "paymentSystem": dup.payment_system,
        "duplicateType": dup.duplicate_type,
        "amount": dup.amount,
        "currency": dup.currency,
        "probability": dup.probability,
        "senderBIC": dup.sender_bic,
        "receiverBIC": dup.receiver_bic,
        "paymentDate1": dup.payment_date1,
        "paymentDate2": dup.payment_date2,
        "matchedFields": dup.matched_fields or [],
        "status": rev.status,
        "_reviewer_name": user.display_name,
    }

    # Restart recovery: load the analyst's FULL message history across ALL their reviews.
    # The Training Agent memory is keyed by user_id, so we need the complete history.
    user_review_ids = [
        r.id
        for r in db.query(UserReviewRecord)
        .filter(UserReviewRecord.user_id == user_id)
        .all()
    ]
    history_records = (
        db.query(UserReviewMessageRecord)
        .filter(UserReviewMessageRecord.review_id.in_(user_review_ids))
        .order_by(UserReviewMessageRecord.timestamp)
        .all()
    )
    db_history = [{"role": m.role, "content": m.content} for m in history_records]

    result = await run_review_agent(
        user_message=message,
        user_id=user_id,
        reviewer_name=user.display_name,
        payment_data=payment_data,
        detector_opinions=detector_opinions,
        db_history=db_history,
    )

    # Persist messages
    db.add(UserReviewMessageRecord(
        id=str(uuid.uuid4()),
        review_id=review_id,
        role="user",
        content=message,
        timestamp=datetime.now(timezone.utc),
    ))
    db.add(UserReviewMessageRecord(
        id=str(uuid.uuid4()),
        review_id=review_id,
        role="assistant",
        content=result["response"],
        timestamp=datetime.now(timezone.utc),
    ))

    # Apply status update if agent triggered one
    if result.get("statusUpdate"):
        rev.status = result["statusUpdate"]
        rev.updated_at = datetime.now(timezone.utc)
        _sync_global_status(rev, result["statusUpdate"], db)

    db.commit()

    return {
        "response": result["response"],
        "statusUpdate": result.get("statusUpdate"),
        "currentStatus": rev.status,
    }


# ── 6. Get conversation history for a review ─────────────────────────────────

@router.get("/{user_id}/{review_id}/messages")
def get_review_messages(user_id: str, review_id: str, db: Session = Depends(get_db)):
    rev = db.query(UserReviewRecord).filter(
        UserReviewRecord.id == review_id,
        UserReviewRecord.user_id == user_id,
    ).first()
    if not rev:
        raise HTTPException(404, "Review not found")

    messages = (
        db.query(UserReviewMessageRecord)
        .filter(UserReviewMessageRecord.review_id == review_id)
        .order_by(UserReviewMessageRecord.timestamp)
        .all()
    )

    return {
        "messages": [
            {"role": m.role, "content": m.content,
             "timestamp": m.timestamp.isoformat() if m.timestamp else None}
            for m in messages
        ],
        "currentStatus": rev.status,
    }


# ── 7. Direct status update (without agent) ───────────────────────────────────

@router.patch("/{user_id}/{review_id}/status")
def update_review_status(
    user_id: str, review_id: str, body: dict, db: Session = Depends(get_db)
):
    rev = db.query(UserReviewRecord).filter(
        UserReviewRecord.id == review_id,
        UserReviewRecord.user_id == user_id,
    ).first()
    if not rev:
        raise HTTPException(404, "Review not found")

    new_status = body.get("status", "")
    valid = {"pending", "confirmed_duplicate", "dismissed", "under_review"}
    if new_status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid}")

    rev.status = new_status
    rev.notes = body.get("notes", rev.notes)
    rev.updated_at = datetime.now(timezone.utc)
    _sync_global_status(rev, new_status, db)
    db.commit()

    return {"success": True, "status": rev.status, "reviewId": rev.id}
