import uuid
import asyncio
import random
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from db import get_db, DuplicatePaymentRecord, ScanRecord

router = APIRouter()

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


@router.post("/scan")
async def run_master_scan(body: dict, db: Session = Depends(get_db)):
    global _current_scan
    
    max_payments = min(body.get("maxPayments", 1000000), 1000000)
    payment_systems = body.get("paymentSystems", [])
    use_all_detectors = body.get("useAllDetectors", False)
    
    scan_id = str(uuid.uuid4())
    scan_record = ScanRecord(
        id=scan_id,
        status="running",
        payments_scanned=0,
        duplicates_found=0,
        progress=0.0,
        current_phase="Initializing scan",
        started_at=datetime.now(timezone.utc),
    )
    db.add(scan_record)
    db.commit()
    
    _current_scan.update({
        "scanId": scan_id,
        "status": "running",
        "progress": 0.0,
        "paymentsScanned": 0,
        "duplicatesFound": 0,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "completedAt": None,
        "currentPhase": "Running duplicate detection",
    })
    
    query = db.query(DuplicatePaymentRecord)
    if payment_systems:
        query = query.filter(DuplicatePaymentRecord.payment_system.in_(payment_systems))
    
    existing_count = query.count()
    simulated_scanned = min(max_payments, max(existing_count * 10, 50000))
    
    phases = [
        (0.15, "Fetching payment records from database"),
        (0.30, "Building duplicate candidate pairs"),
        (0.50, "Running exact match detection (UETR, Trace Numbers)"),
        (0.65, "Running fuzzy match detection"),
        (0.80, "Analyzing multi-source payment consolidations"),
        (0.90, "Computing probability scores"),
        (1.0, "Finalizing results"),
    ]
    
    for progress, phase in phases:
        await asyncio.sleep(0.5)
        _current_scan.update({
            "progress": progress,
            "currentPhase": phase,
            "paymentsScanned": int(simulated_scanned * progress),
            "duplicatesFound": int(existing_count * min(progress, 1.0)),
        })
    
    new_records = []
    bics = ["DEUTDEFF", "BOFAUS3N", "CHASUS33", "BNPAFRPP", "UBSWCHZH"]
    countries = ["US", "GB", "DE", "FR", "CH", "SG", "JP"]
    systems = payment_systems if payment_systems else ["SWIFT_MT", "SWIFT_MX", "ACH", "INTERNAL"]
    dup_types = ["exact_match", "fuzzy_amount_date", "network_retry", "multi_source_consolidation"]
    
    for _ in range(random.randint(10, 30)):
        prob = random.uniform(0.5, 0.99)
        rec = DuplicatePaymentRecord(
            id=str(uuid.uuid4()),
            payment1_id=f"PMT{random.randint(100000, 999999)}",
            payment2_id=f"PMT{random.randint(100000, 999999)}",
            probability=round(prob, 4),
            duplicate_type=random.choice(dup_types),
            payment_system=random.choice(systems),
            amount=round(random.uniform(5000, 2000000), 2),
            currency=random.choice(["USD", "EUR", "GBP"]),
            sender_bic=random.choice(bics),
            receiver_bic=random.choice(bics),
            originator_country=random.choice(countries),
            beneficiary_country=random.choice(countries),
            payment_date1=(datetime.now(timezone.utc) - timedelta(days=random.randint(1, 30))).isoformat(),
            payment_date2=(datetime.now(timezone.utc) - timedelta(days=random.randint(1, 30))).isoformat(),
            status="pending",
            matched_fields=["amount", "currency"] if prob < 0.8 else ["amount", "currency", "sender_bic", "value_date"],
            detected_at=datetime.now(timezone.utc),
            scan_id=scan_id,
        )
        new_records.append(rec)
    
    if new_records:
        db.bulk_save_objects(new_records)
        db.commit()
    
    total_found = existing_count + len(new_records)
    
    scan_record.status = "completed"
    scan_record.payments_scanned = simulated_scanned
    scan_record.duplicates_found = total_found
    scan_record.progress = 1.0
    scan_record.current_phase = "Scan completed"
    scan_record.completed_at = datetime.now(timezone.utc)
    scan_record.message = f"Scanned {simulated_scanned:,} payments. Found {total_found} potential duplicates."
    db.commit()
    
    _current_scan.update({
        "status": "completed",
        "progress": 1.0,
        "paymentsScanned": simulated_scanned,
        "duplicatesFound": total_found,
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "currentPhase": "Scan completed",
    })
    
    return {
        "scanId": scan_id,
        "status": "completed",
        "paymentsScanned": simulated_scanned,
        "duplicatesFound": total_found,
        "startedAt": scan_record.started_at.isoformat(),
        "completedAt": scan_record.completed_at.isoformat(),
        "message": scan_record.message,
    }


@router.get("/scan/status")
def get_scan_status():
    return _current_scan
