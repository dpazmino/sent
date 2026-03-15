"""
Master Console — runs real agent-based duplicate detection against dup_payments.
"""
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from db import get_db, DuplicatePaymentRecord, ScanRecord, PaymentRecord, AgentMemoryRecord, SessionLocal
from agents.detector_agents import analyze_payment_pair

router = APIRouter()

# ── In-memory live scan state (polled by the frontend) ───────────────────────
_current_scan: dict = {
    "scanId": None,
    "status": "idle",
    "progress": 0.0,
    "paymentsScanned": 0,
    "duplicatesFound": 0,
    "startedAt": None,
    "completedAt": None,
    "currentPhase": None,
}

# ── Candidate pair SQL queries ────────────────────────────────────────────────
# Each returns rows: (id1, id2, match_type)

_CANDIDATE_QUERIES = [
    # 1. Identical UETR — definitive SWIFT duplicate
    ("""
        SELECT a.id AS id1, b.id AS id2, 'uetr_exact' AS match_type
        FROM dup_payments a
        JOIN dup_payments b ON a.uetr = b.uetr AND a.id < b.id
        WHERE a.uetr IS NOT NULL
        LIMIT :lim
    """, 60),

    # 2. Identical ACH trace number
    ("""
        SELECT a.id AS id1, b.id AS id2, 'trace_exact' AS match_type
        FROM dup_payments a
        JOIN dup_payments b ON a.trace_number = b.trace_number AND a.id < b.id
        WHERE a.trace_number IS NOT NULL
          AND a.payment_system = 'ACH' AND b.payment_system = 'ACH'
        LIMIT :lim
    """, 60),

    # 3. Identical ISO 20022 EndToEndId
    ("""
        SELECT a.id AS id1, b.id AS id2, 'e2e_exact' AS match_type
        FROM dup_payments a
        JOIN dup_payments b ON a.end_to_end_id = b.end_to_end_id AND a.id < b.id
        WHERE a.end_to_end_id IS NOT NULL
        LIMIT :lim
    """, 50),

    # 4. Cross-system same beneficiary account + amount (±0.1%)
    ("""
        SELECT a.id AS id1, b.id AS id2, 'cross_system' AS match_type
        FROM dup_payments a
        JOIN dup_payments b ON
            a.id < b.id
            AND a.payment_system <> b.payment_system
            AND a.currency = b.currency
            AND a.beneficiary_account = b.beneficiary_account
            AND a.beneficiary_account IS NOT NULL
            AND ABS(a.amount - b.amount) / GREATEST(a.amount, 0.01) < 0.001
            AND a.value_date IS NOT NULL AND b.value_date IS NOT NULL
            AND ABS(CAST(a.value_date AS DATE) - CAST(b.value_date AS DATE)) <= 5
        LIMIT :lim
    """, 60),

    # 5. Same BIC corridor + amount within 0.5% + date within 3 days (fuzzy)
    ("""
        SELECT a.id AS id1, b.id AS id2, 'fuzzy_corridor' AS match_type
        FROM dup_payments a
        JOIN dup_payments b ON
            a.id < b.id
            AND a.sender_bic = b.sender_bic
            AND a.receiver_bic = b.receiver_bic
            AND a.sender_bic IS NOT NULL
            AND a.currency = b.currency
            AND ABS(a.amount - b.amount) / GREATEST(a.amount, 0.01) < 0.005
            AND a.value_date IS NOT NULL AND b.value_date IS NOT NULL
            AND ABS(CAST(a.value_date AS DATE) - CAST(b.value_date AS DATE)) <= 3
        LIMIT :lim
    """, 60),

    # 6. Same beneficiary account + amount within 1% + date within 7 days (any system)
    ("""
        SELECT a.id AS id1, b.id AS id2, 'fuzzy_beneficiary' AS match_type
        FROM dup_payments a
        JOIN dup_payments b ON
            a.id < b.id
            AND a.beneficiary_account = b.beneficiary_account
            AND a.beneficiary_account IS NOT NULL
            AND a.currency = b.currency
            AND ABS(a.amount - b.amount) / GREATEST(a.amount, 0.01) < 0.01
            AND a.value_date IS NOT NULL AND b.value_date IS NOT NULL
            AND ABS(CAST(a.value_date AS DATE) - CAST(b.value_date AS DATE)) <= 7
        LIMIT :lim
    """, 60),
]

_MAX_PAIRS_PER_SCAN = 150   # max agent calls per scan
_MIN_CONFIDENCE = 0.40       # minimum confidence to save as duplicate
_CONCURRENCY = 5             # parallel agent calls


def _record_to_dict(r: PaymentRecord) -> dict:
    return {c.name: getattr(r, c.name) for c in r.__table__.columns
            if getattr(r, c.name) is not None}


def _get_memory_context(db: Session) -> str:
    rows = db.query(AgentMemoryRecord).filter(
        AgentMemoryRecord.category == "duplicate_definition"
    ).order_by(AgentMemoryRecord.created_at.desc()).limit(5).all()
    return "\n".join(f"- {r.content}" for r in rows)


def _update_scan(scan_id: Optional[str], db: Session, **kwargs):
    """Update in-memory status and persist ScanRecord."""
    _current_scan.update(kwargs)
    if scan_id:
        rec = db.query(ScanRecord).filter(ScanRecord.id == scan_id).first()
        if rec:
            for k, v in kwargs.items():
                db_field_map = {
                    "paymentsScanned": "payments_scanned",
                    "duplicatesFound": "duplicates_found",
                    "currentPhase": "current_phase",
                    "progress": "progress",
                    "status": "status",
                    "message": "message",
                }
                db_k = db_field_map.get(k, k)
                if hasattr(rec, db_k):
                    setattr(rec, db_k, v)
            db.commit()


# ── Background scan task ──────────────────────────────────────────────────────

async def _run_scan(scan_id: str, payment_systems: list, max_pairs: int):
    db = SessionLocal()
    try:
        _current_scan.update({
            "scanId": scan_id,
            "status": "running",
            "progress": 0.0,
            "paymentsScanned": 0,
            "duplicatesFound": 0,
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "completedAt": None,
            "currentPhase": "Building candidate pairs",
        })

        # ── Phase 1: gather candidate pairs from SQL ──────────────────────────
        candidate_pairs = []
        seen_pairs = set()

        # Also load already-saved pairs to avoid re-flagging
        existing = db.execute(sa_text(
            "SELECT payment1_id || '|' || payment2_id FROM dup_duplicate_payments"
        )).fetchall()
        already_saved = {row[0] for row in existing}

        for sql_template, limit in _CANDIDATE_QUERIES:
            try:
                rows = db.execute(sa_text(sql_template), {"lim": limit}).fetchall()
                for row in rows:
                    id1, id2, match_type = row[0], row[1], row[2]
                    key = f"{id1}|{id2}"
                    rev_key = f"{id2}|{id1}"
                    if key in seen_pairs or rev_key in seen_pairs:
                        continue
                    if key in already_saved or rev_key in already_saved:
                        continue
                    seen_pairs.add(key)
                    candidate_pairs.append((id1, id2, match_type))
            except Exception as e:
                print(f"Candidate query error: {e}")

        # Apply payment system filter if requested
        if payment_systems:
            filtered = []
            ids_needed = {id1 for id1, _, _ in candidate_pairs} | {id2 for _, id2, _ in candidate_pairs}
            id_system_map = {}
            if ids_needed:
                rows = db.execute(
                    sa_text("SELECT id, payment_system FROM dup_payments WHERE id = ANY(:ids)"),
                    {"ids": list(ids_needed)}
                ).fetchall()
                id_system_map = {r[0]: r[1] for r in rows}
            for id1, id2, mt in candidate_pairs:
                sys1 = id_system_map.get(id1, "")
                sys2 = id_system_map.get(id2, "")
                if sys1 in payment_systems or sys2 in payment_systems:
                    filtered.append((id1, id2, mt))
            candidate_pairs = filtered

        # Cap total pairs
        candidate_pairs = candidate_pairs[:max_pairs]
        total_pairs = len(candidate_pairs)

        total_payments = db.query(PaymentRecord).count()
        _update_scan(scan_id, db,
                     paymentsScanned=total_payments,
                     currentPhase=f"Found {total_pairs} candidate pairs — running agent analysis",
                     progress=0.1)

        if total_pairs == 0:
            _update_scan(scan_id, db,
                         status="completed", progress=1.0,
                         currentPhase="No new candidates found",
                         duplicatesFound=db.query(DuplicatePaymentRecord).count(),
                         completedAt=datetime.now(timezone.utc).isoformat(),
                         message="Scan complete — no new duplicate candidates.")

            rec = db.query(ScanRecord).filter(ScanRecord.id == scan_id).first()
            if rec:
                rec.completed_at = datetime.now(timezone.utc)
                db.commit()
            return

        # ── Phase 2: agent analysis in parallel batches ───────────────────────
        memory_ctx = _get_memory_context(db)
        saved = 0
        processed = 0

        # Load payment records in bulk (avoid N+1)
        all_ids = list({id1 for id1, _, _ in candidate_pairs} | {id2 for _, id2, _ in candidate_pairs})
        records_raw = db.query(PaymentRecord).filter(PaymentRecord.id.in_(all_ids)).all()
        payment_map = {r.id: _record_to_dict(r) for r in records_raw}

        semaphore = asyncio.Semaphore(_CONCURRENCY)

        async def analyse_one(id1, id2, match_type):
            async with semaphore:
                p1 = payment_map.get(id1)
                p2 = payment_map.get(id2)
                if not p1 or not p2:
                    return None
                try:
                    result = await analyze_payment_pair(p1, p2, match_type, memory_ctx)
                    return (id1, id2, match_type, p1, p2, result)
                except Exception as e:
                    print(f"Agent error on pair ({id1}, {id2}): {e}")
                    return None

        tasks = [analyse_one(id1, id2, mt) for id1, id2, mt in candidate_pairs]

        for future in asyncio.as_completed(tasks):
            result_tuple = await future
            processed += 1
            progress = 0.1 + 0.85 * (processed / total_pairs)

            if result_tuple is None:
                continue

            id1, id2, match_type, p1, p2, verdict = result_tuple

            if verdict.get("isDuplicate") and verdict.get("confidence", 0) >= _MIN_CONFIDENCE:
                # Determine the "primary" payment system
                sys1 = p1.get("payment_system", "UNKNOWN")
                sys2 = p2.get("payment_system", "UNKNOWN")
                pay_system = sys1 if sys1 == sys2 else f"{sys1}/{sys2}"

                dup = DuplicatePaymentRecord(
                    id=str(uuid.uuid4()),
                    payment1_id=id1,
                    payment2_id=id2,
                    probability=round(verdict["confidence"], 4),
                    duplicate_type=verdict.get("duplicateType", match_type),
                    payment_system=pay_system,
                    amount=p1.get("amount", 0.0),
                    currency=p1.get("currency", "USD"),
                    sender_bic=p1.get("sender_bic"),
                    receiver_bic=p1.get("receiver_bic"),
                    originator_country=p1.get("originator_country"),
                    beneficiary_country=p1.get("beneficiary_country"),
                    payment_date1=p1.get("value_date"),
                    payment_date2=p2.get("value_date"),
                    status="pending",
                    matched_fields=verdict.get("matchedFields", []),
                    notes=f"[{verdict.get('agentName','Agent')}] {verdict.get('reasoning','')}",
                    scan_id=scan_id,
                )
                db.add(dup)
                db.commit()
                saved += 1

            if processed % 5 == 0 or processed == total_pairs:
                _update_scan(scan_id, db,
                             progress=round(progress, 3),
                             paymentsScanned=total_payments,
                             duplicatesFound=db.query(DuplicatePaymentRecord).count(),
                             currentPhase=f"Analysed {processed}/{total_pairs} pairs — {saved} duplicates saved")

        # ── Phase 3: finalise ─────────────────────────────────────────────────
        final_count = db.query(DuplicatePaymentRecord).count()
        msg = (f"Scanned {total_payments:,} payments. "
               f"Analysed {total_pairs} candidate pairs. "
               f"Saved {saved} new duplicates ({final_count} total).")

        _update_scan(scan_id, db,
                     status="completed", progress=1.0,
                     duplicatesFound=final_count,
                     currentPhase="Scan completed",
                     completedAt=datetime.now(timezone.utc).isoformat(),
                     message=msg)

        rec = db.query(ScanRecord).filter(ScanRecord.id == scan_id).first()
        if rec:
            rec.completed_at = datetime.now(timezone.utc)
            rec.message = msg
            db.commit()

        print(f"Scan {scan_id} complete: {msg}")

    except Exception as e:
        print(f"Scan error: {e}")
        _update_scan(scan_id, db,
                     status="error", progress=1.0,
                     currentPhase=f"Scan failed: {e}")
    finally:
        db.close()


# ── HTTP endpoints ────────────────────────────────────────────────────────────

@router.post("/scan")
async def run_master_scan(body: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    global _current_scan

    if _current_scan.get("status") == "running":
        return {"error": "A scan is already in progress.", "scanId": _current_scan.get("scanId")}

    max_payments = min(body.get("maxPayments", 1000000), 1000000)
    payment_systems = body.get("paymentSystems", [])
    max_pairs = min(body.get("maxPairs", _MAX_PAIRS_PER_SCAN), _MAX_PAIRS_PER_SCAN)

    scan_id = str(uuid.uuid4())
    scan_record = ScanRecord(
        id=scan_id,
        status="running",
        payments_scanned=0,
        duplicates_found=0,
        progress=0.0,
        current_phase="Initialising scan",
        started_at=datetime.now(timezone.utc),
    )
    db.add(scan_record)
    db.commit()

    background_tasks.add_task(_run_scan, scan_id, payment_systems, max_pairs)

    return {
        "scanId": scan_id,
        "status": "running",
        "message": "Scan started. Poll /scan/status for progress.",
        "startedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/scan/status")
def get_scan_status():
    return _current_scan


@router.get("/scan/history")
def get_scan_history(db: Session = Depends(get_db)):
    scans = db.query(ScanRecord).order_by(ScanRecord.started_at.desc()).limit(20).all()
    return [
        {
            "id": s.id,
            "status": s.status,
            "paymentsScanned": s.payments_scanned,
            "duplicatesFound": s.duplicates_found,
            "progress": s.progress,
            "currentPhase": s.current_phase,
            "startedAt": s.started_at.isoformat() if s.started_at else None,
            "completedAt": s.completed_at.isoformat() if s.completed_at else None,
            "message": s.message,
        }
        for s in scans
    ]


@router.get("/payment-db/stats")
def get_payment_db_stats(db: Session = Depends(get_db)):
    """Quick stats about the simulated payment database."""
    total = db.query(PaymentRecord).count()
    by_system = db.execute(sa_text(
        "SELECT payment_system, COUNT(*) FROM dup_payments GROUP BY payment_system ORDER BY COUNT(*) DESC"
    )).fetchall()
    by_source = db.execute(sa_text(
        "SELECT source_system, COUNT(*) FROM dup_payments WHERE source_system IS NOT NULL GROUP BY source_system ORDER BY COUNT(*) DESC"
    )).fetchall()
    return {
        "total": total,
        "byPaymentSystem": [{"system": r[0], "count": r[1]} for r in by_system],
        "bySourceSystem": [{"system": r[0], "count": r[1]} for r in by_source],
    }
