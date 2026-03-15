"""
Comprehensive bank payment database seeder.
Creates ~2,500 realistic payments across SWIFT MT, SWIFT MX, ACH, and INTERNAL
systems — including ~350 intentional duplicate pairs covering every duplication pattern
the detector agents are trained to catch.
"""
import uuid
import random
from datetime import datetime, timezone, timedelta
from db import SessionLocal, PaymentRecord

random.seed(42)

# ── Reference data ────────────────────────────────────────────────────────────
BANKS = [
    ("DEUTDEFF", "Deutsche Bank", "DE"),
    ("BOFAUS3N", "Bank of America", "US"),
    ("CHASUS33", "JPMorgan Chase", "US"),
    ("BNPAFRPP", "BNP Paribas", "FR"),
    ("UBSWCHZH", "UBS", "CH"),
    ("HSBCHKHH", "HSBC Hong Kong", "HK"),
    ("CITISGSG", "Citibank Singapore", "SG"),
    ("ANZBNZ22", "ANZ Bank", "NZ"),
    ("ROYCCAT2", "Royal Bank of Canada", "CA"),
    ("NATAAU33", "NAB", "AU"),
    ("BARCLGB22", "Barclays", "GB"),
    ("INGSTBICSXXX", "ING Bank", "NL"),
    ("SCBLSGSG", "Standard Chartered", "SG"),
    ("MUFGJPJT", "MUFG", "JP"),
    ("BSCHESMM", "Santander", "ES"),
    ("CHASDEFX", "JPMorgan Frankfurt", "DE"),
    ("SOCGFRPP", "Societe Generale", "FR"),
    ("CRBAATWW", "Raiffeisen Bank", "AT"),
    ("RBOSGB2L", "Royal Bank of Scotland", "GB"),
    ("ABNAAMST", "ABN AMRO", "NL"),
]

CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD", "SGD", "HKD", "NZD"]
CURRENCY_WEIGHTS = [35, 30, 10, 8, 5, 4, 3, 2, 2, 1]

PURPOSE_CODES = ["SUPP", "SALA", "TRAD", "LOAN", "DIVI", "INVS", "PENS", "TAXS", "OTHR", "GDDS"]

SOURCE_SYSTEMS = ["CORE_BANKING", "TREASURY", "TRADE_FINANCE", "CORRESPONDENT", "RTGS", "SWIFT_GPI"]
CHANNELS = ["SWIFT_NET", "API", "FILE", "FED_WIRE", "CHIPS", "MANUAL"]

COMPANY_NAMES = [
    "Acme Corporation", "Global Trade Ltd", "Pacific Exports Inc", "Atlantic Logistics",
    "Euro Finance SA", "Asia Capital Group", "Northern Industries", "Southern Holdings",
    "Western Trading Co", "Eastern Commodities", "Prime Solutions GmbH", "Alpha Services AG",
    "Beta Investments Ltd", "Gamma Resources PLC", "Delta Manufacturing", "Omega Consulting",
    "Sigma Technology", "Lambda Partners", "Kappa Financial", "Theta Holdings",
]

MT_MESSAGE_TYPES = ["MT103", "MT103", "MT103", "MT202", "MT202COV", "MT101"]
MX_MESSAGE_TYPES = ["pacs.008", "pacs.008", "pacs.009", "pain.001", "camt.054"]
ACH_SEC_CODES = ["CCD", "CCD", "PPD", "CTX", "WEB"]
INTERNAL_TYPES = ["WIRE", "BOOK", "BOOK", "INTERCO"]

ROUTING_NUMBERS = [
    "021000021", "021000089", "026009593", "021001208", "021200339",
    "021202337", "122100024", "325070760", "121042882", "267084131",
]

GL_CODES = ["4100-001", "4200-003", "5000-010", "5100-007", "6000-002", "7100-005"]
DEPARTMENTS = ["Treasury", "Trade Finance", "Corporate Banking", "Retail Banking", "Operations"]


def _bic():
    b = random.choice(BANKS)
    return b[0], b[1], b[2]


def _currency():
    return random.choices(CURRENCIES, weights=CURRENCY_WEIGHTS)[0]


def _amount(lo=1000, hi=5_000_000):
    return round(random.uniform(lo, hi), 2)


def _iban(country: str) -> str:
    account = "".join([str(random.randint(0, 9)) for _ in range(16)])
    return f"{country}{random.randint(10, 99)}{account}"


def _date_str(base: datetime, delta_days: int = 0) -> str:
    d = base + timedelta(days=delta_days)
    return d.strftime("%Y-%m-%d")


def _ts(base: datetime, delta_minutes: int = 0) -> datetime:
    return base + timedelta(minutes=delta_minutes)


def _uetr() -> str:
    return str(uuid.uuid4())


def _ref(prefix: str) -> str:
    return f"{prefix}{random.randint(100000, 999999)}"


def _trace() -> str:
    routing = random.choice(ROUTING_NUMBERS)
    seq = str(random.randint(1000000, 9999999))
    return routing[:8] + seq


def _end_to_end() -> str:
    return f"E2E-{uuid.uuid4().hex[:16].upper()}"


# ── Payment factory functions ─────────────────────────────────────────────────

def make_swift_mt(base_dt: datetime, **overrides) -> dict:
    sender_bic, sender_name, sender_country = _bic()
    receiver_bic, receiver_name, receiver_country = _bic()
    while receiver_bic == sender_bic:
        receiver_bic, receiver_name, receiver_country = _bic()
    ccy = _currency()
    amt = _amount()
    msg_type = random.choice(MT_MESSAGE_TYPES)
    company = random.choice(COMPANY_NAMES)
    p = dict(
        id=f"PAY-{uuid.uuid4().hex[:12].upper()}",
        payment_system="SWIFT_MT",
        message_type=msg_type,
        source_system=random.choice(["CORE_BANKING", "TREASURY", "CORRESPONDENT", "SWIFT_GPI"]),
        channel="SWIFT_NET",
        amount=amt,
        currency=ccy,
        value_date=_date_str(base_dt),
        status=random.choices(["settled", "settled", "processing", "failed"], weights=[75, 75, 10, 5])[0],
        priority=random.choices(["NORMAL", "URGENT", "LOW"], weights=[70, 20, 10])[0],
        created_at=base_dt,
        processed_at=_ts(base_dt, random.randint(2, 60)),
        originator_name=company,
        originator_account=_iban(sender_country),
        originator_country=sender_country,
        sender_bic=sender_bic,
        sender_bank_name=sender_name,
        beneficiary_name=random.choice(COMPANY_NAMES),
        beneficiary_account=_iban(receiver_country),
        beneficiary_country=receiver_country,
        receiver_bic=receiver_bic,
        receiver_bank_name=receiver_name,
        uetr=_uetr(),
        transaction_reference=_ref("TXN"),
        related_reference=_ref("REL") if msg_type == "MT202" else None,
        end_to_end_id=_end_to_end(),
        correspondent_bank=random.choice(BANKS)[0] if random.random() > 0.7 else None,
        remittance_info=f"Invoice {_ref('INV')} - {random.choice(PURPOSE_CODES)}",
        purpose_code=random.choice(PURPOSE_CODES),
        invoice_reference=_ref("INV") if random.random() > 0.5 else None,
        is_scanned=False,
    )
    p.update(overrides)
    return p


def make_swift_mx(base_dt: datetime, **overrides) -> dict:
    sender_bic, sender_name, sender_country = _bic()
    receiver_bic, receiver_name, receiver_country = _bic()
    while receiver_bic == sender_bic:
        receiver_bic, receiver_name, receiver_country = _bic()
    ccy = _currency()
    amt = _amount()
    msg_type = random.choice(MX_MESSAGE_TYPES)
    company = random.choice(COMPANY_NAMES)
    p = dict(
        id=f"PAY-{uuid.uuid4().hex[:12].upper()}",
        payment_system="SWIFT_MX",
        message_type=msg_type,
        source_system=random.choice(["CORE_BANKING", "SWIFT_GPI", "RTGS"]),
        channel="SWIFT_NET",
        amount=amt,
        currency=ccy,
        value_date=_date_str(base_dt),
        status=random.choices(["settled", "settled", "processing", "failed"], weights=[75, 75, 10, 5])[0],
        priority=random.choices(["NORMAL", "URGENT", "LOW"], weights=[65, 25, 10])[0],
        created_at=base_dt,
        processed_at=_ts(base_dt, random.randint(1, 30)),
        originator_name=company,
        originator_account=_iban(sender_country),
        originator_country=sender_country,
        sender_bic=sender_bic,
        sender_bank_name=sender_name,
        beneficiary_name=random.choice(COMPANY_NAMES),
        beneficiary_account=_iban(receiver_country),
        beneficiary_country=receiver_country,
        receiver_bic=receiver_bic,
        receiver_bank_name=receiver_name,
        uetr=_uetr(),
        transaction_reference=_ref("INSTR"),
        end_to_end_id=_end_to_end(),
        correspondent_bank=random.choice(BANKS)[0] if random.random() > 0.65 else None,
        remittance_info=f"{random.choice(PURPOSE_CODES)} payment ref {_ref('REF')}",
        purpose_code=random.choice(PURPOSE_CODES),
        invoice_reference=_ref("INV") if random.random() > 0.5 else None,
        is_scanned=False,
    )
    p.update(overrides)
    return p


def make_ach(base_dt: datetime, **overrides) -> dict:
    sec = random.choice(ACH_SEC_CODES)
    company = random.choice(COMPANY_NAMES)
    individual = f"{random.choice(['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda'])} " \
                 f"{random.choice(['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis'])}"
    routing = random.choice(ROUTING_NUMBERS)
    p = dict(
        id=f"PAY-{uuid.uuid4().hex[:12].upper()}",
        payment_system="ACH",
        message_type=sec,
        source_system=random.choice(["CORE_BANKING", "TREASURY"]),
        channel="FILE",
        amount=_amount(100, 500_000),
        currency="USD",
        value_date=_date_str(base_dt),
        status=random.choices(["settled", "settled", "processing", "returned"], weights=[75, 75, 10, 5])[0],
        priority="NORMAL",
        created_at=base_dt,
        processed_at=_ts(base_dt, random.randint(60, 480)),
        originator_name=company,
        originator_account=f"{random.randint(1000000000, 9999999999)}",
        originator_country="US",
        sender_bic=None,
        sender_bank_name=None,
        beneficiary_name=individual if sec == "PPD" else company,
        beneficiary_account=f"{random.randint(1000000000, 9999999999)}",
        beneficiary_country="US",
        receiver_bic=None,
        receiver_bank_name=None,
        trace_number=_trace(),
        routing_number=routing,
        sec_code=sec,
        company_name=company,
        individual_name=individual if sec == "PPD" else None,
        batch_number=str(random.randint(1000000, 9999999)),
        effective_date=_date_str(base_dt),
        remittance_info=f"{sec} PAYMENT {_ref('BATCH')}",
        purpose_code="SALA" if sec == "PPD" else "SUPP",
        is_scanned=False,
    )
    p.update(overrides)
    return p


def make_internal(base_dt: datetime, **overrides) -> dict:
    from_dept = random.choice(DEPARTMENTS)
    to_dept = random.choice(DEPARTMENTS)
    company = random.choice(COMPANY_NAMES)
    p = dict(
        id=f"PAY-{uuid.uuid4().hex[:12].upper()}",
        payment_system="INTERNAL",
        message_type=random.choice(INTERNAL_TYPES),
        source_system=random.choice(SOURCE_SYSTEMS),
        channel=random.choice(["API", "MANUAL", "FILE"]),
        amount=_amount(500, 10_000_000),
        currency=_currency(),
        value_date=_date_str(base_dt),
        status=random.choices(["settled", "settled", "processing"], weights=[80, 80, 10])[0],
        priority=random.choices(["NORMAL", "URGENT", "LOW"], weights=[60, 30, 10])[0],
        created_at=base_dt,
        processed_at=_ts(base_dt, random.randint(1, 15)),
        originator_name=company,
        originator_account=f"ACC-{random.randint(10000, 99999)}",
        originator_country=random.choice(BANKS)[2],
        beneficiary_name=random.choice(COMPANY_NAMES),
        beneficiary_account=f"ACC-{random.randint(10000, 99999)}",
        beneficiary_country=random.choice(BANKS)[2],
        internal_ref=_ref("INT"),
        from_account=f"GL-{random.randint(1000, 9999)}",
        to_account=f"GL-{random.randint(1000, 9999)}",
        gl_code=random.choice(GL_CODES),
        department=from_dept,
        cost_centre=f"CC-{random.randint(100, 999)}",
        remittance_info=f"Interco transfer: {from_dept} -> {to_dept}",
        purpose_code=random.choice(PURPOSE_CODES),
        is_scanned=False,
    )
    p.update(overrides)
    return p


MAKERS = {
    "SWIFT_MT": make_swift_mt,
    "SWIFT_MX": make_swift_mx,
    "ACH": make_ach,
    "INTERNAL": make_internal,
}


# ── Duplicate pair generators ─────────────────────────────────────────────────

def dup_uetr_exact(base_dt):
    """Two payments with identical UETR — network retry / resubmission."""
    shared_uetr = _uetr()
    maker = random.choice([make_swift_mt, make_swift_mx])
    p1 = maker(base_dt, uetr=shared_uetr)
    # Second arrives a few minutes later — slightly different timestamp, same UETR
    p2 = maker(_ts(base_dt, random.randint(3, 45)), uetr=shared_uetr,
               amount=p1["amount"], currency=p1["currency"],
               value_date=p1["value_date"], sender_bic=p1["sender_bic"],
               receiver_bic=p1["receiver_bic"])
    return [p1, p2]


def dup_ach_trace(base_dt):
    """Two ACH entries with the same trace number — file resubmission."""
    shared_trace = _trace()
    p1 = make_ach(base_dt, trace_number=shared_trace)
    p2 = make_ach(_ts(base_dt, random.randint(30, 240)), trace_number=shared_trace,
                  amount=p1["amount"], currency="USD",
                  routing_number=p1["routing_number"],
                  beneficiary_account=p1["beneficiary_account"],
                  company_name=p1["company_name"],
                  batch_number=str(random.randint(1000000, 9999999)))
    return [p1, p2]


def dup_mx_e2e(base_dt):
    """Two ISO 20022 payments with the same EndToEndId."""
    shared_e2e = _end_to_end()
    p1 = make_swift_mx(base_dt, end_to_end_id=shared_e2e)
    p2 = make_swift_mx(_ts(base_dt, random.randint(5, 60)), end_to_end_id=shared_e2e,
                       amount=p1["amount"], currency=p1["currency"],
                       sender_bic=p1["sender_bic"], receiver_bic=p1["receiver_bic"])
    return [p1, p2]


def dup_fuzzy_amount(base_dt):
    """Near-duplicate: amount differs by < 0.5%, dates differ by 1-3 days."""
    maker = random.choice([make_swift_mt, make_swift_mx, make_ach, make_internal])
    p1 = maker(base_dt)
    delta = p1["amount"] * random.uniform(0.0001, 0.004)
    fuzzy_amount = round(p1["amount"] + random.choice([-1, 1]) * delta, 2)
    day_shift = random.randint(1, 3)
    p2 = maker(_ts(base_dt, random.randint(60, 1440)), amount=fuzzy_amount,
               currency=p1["currency"],
               value_date=_date_str(base_dt, day_shift),
               originator_country=p1.get("originator_country"),
               beneficiary_country=p1.get("beneficiary_country"),
               beneficiary_account=p1.get("beneficiary_account"),
               sender_bic=p1.get("sender_bic"),
               receiver_bic=p1.get("receiver_bic"))
    return [p1, p2]


def dup_cross_system(base_dt):
    """Same payment submitted from two different source systems (e.g. CORE_BANKING + TREASURY)."""
    systems = random.sample(["CORE_BANKING", "TREASURY", "TRADE_FINANCE", "CORRESPONDENT"], 2)
    maker = random.choice([make_swift_mt, make_swift_mx, make_internal])
    p1 = maker(base_dt, source_system=systems[0])
    p2 = maker(_ts(base_dt, random.randint(1, 120)), source_system=systems[1],
               amount=p1["amount"], currency=p1["currency"],
               value_date=p1["value_date"],
               beneficiary_account=p1.get("beneficiary_account"),
               beneficiary_name=p1.get("beneficiary_name"),
               sender_bic=p1.get("sender_bic"))
    return [p1, p2]


def dup_mt_to_mx_migration(base_dt):
    """Same payment sent in both MT and MX format during SWIFT migration."""
    sender_bic, sender_name, sender_country = _bic()
    receiver_bic, receiver_name, receiver_country = _bic()
    amt = _amount()
    ccy = _currency()
    val_date = _date_str(base_dt)
    shared_uetr = _uetr()
    company = random.choice(COMPANY_NAMES)
    beneficiary_acct = _iban(receiver_country)
    p1 = make_swift_mt(base_dt, amount=amt, currency=ccy, value_date=val_date,
                       uetr=shared_uetr, sender_bic=sender_bic, receiver_bic=receiver_bic,
                       originator_name=company, beneficiary_account=beneficiary_acct)
    p2 = make_swift_mx(_ts(base_dt, random.randint(2, 30)), amount=amt, currency=ccy,
                       value_date=val_date, uetr=shared_uetr,
                       sender_bic=sender_bic, receiver_bic=receiver_bic,
                       originator_name=company, beneficiary_account=beneficiary_acct)
    return [p1, p2]


def dup_manual_resubmission(base_dt):
    """Operator manually re-keyed same payment — slight reference variation."""
    maker = random.choice([make_swift_mt, make_internal])
    p1 = maker(base_dt)
    # Resubmitted same day or next morning — reference differs, everything else same
    new_ref = p1.get("transaction_reference", _ref("TXN")) + "-RESUB"
    p2 = maker(_ts(base_dt, random.randint(120, 1440)),
               amount=p1["amount"], currency=p1["currency"],
               value_date=p1["value_date"],
               originator_name=p1.get("originator_name"),
               beneficiary_name=p1.get("beneficiary_name"),
               beneficiary_account=p1.get("beneficiary_account"),
               transaction_reference=new_ref,
               sender_bic=p1.get("sender_bic"),
               receiver_bic=p1.get("receiver_bic"))
    return [p1, p2]


def dup_network_timeout(base_dt):
    """Payment re-sent after a network timeout — new UETR, identical payload."""
    maker = random.choice([make_swift_mt, make_swift_mx])
    p1 = maker(base_dt)
    # Re-sent minutes later with fresh UETR but same payload
    p2 = maker(_ts(base_dt, random.randint(5, 30)), uetr=_uetr(),
               amount=p1["amount"], currency=p1["currency"],
               value_date=p1["value_date"], sender_bic=p1["sender_bic"],
               receiver_bic=p1["receiver_bic"],
               beneficiary_account=p1.get("beneficiary_account"),
               originator_account=p1.get("originator_account"))
    return [p1, p2]


DUP_GENERATORS = [
    (dup_uetr_exact,          70),
    (dup_ach_trace,           50),
    (dup_mx_e2e,              40),
    (dup_fuzzy_amount,        60),
    (dup_cross_system,        50),
    (dup_mt_to_mx_migration,  40),
    (dup_manual_resubmission, 30),
    (dup_network_timeout,     40),
]


# ── Main seeder ───────────────────────────────────────────────────────────────

def seed_payment_database():
    db = SessionLocal()
    try:
        existing = db.query(PaymentRecord).count()
        if existing > 0:
            print(f"Payment database already seeded ({existing} records). Skipping.")
            return

        print("Seeding comprehensive payment database…")
        base = datetime.now(timezone.utc) - timedelta(days=180)
        records = []

        # ── 1. Clean payments (no intentional duplicates) ─────────────────────
        clean_counts = {
            "SWIFT_MT": 700,
            "SWIFT_MX": 500,
            "ACH": 600,
            "INTERNAL": 400,
        }
        for system, count in clean_counts.items():
            maker = MAKERS[system]
            for _ in range(count):
                offset_minutes = random.randint(0, 180 * 24 * 60)
                dt = _ts(base, offset_minutes)
                p = maker(dt)
                records.append(PaymentRecord(**p))

        # ── 2. Intentional duplicate pairs ────────────────────────────────────
        for gen_fn, count in DUP_GENERATORS:
            for _ in range(count):
                offset_minutes = random.randint(0, 170 * 24 * 60)
                dt = _ts(base, offset_minutes)
                try:
                    pair = gen_fn(dt)
                    for p in pair:
                        records.append(PaymentRecord(**{
                            k: v for k, v in p.items()
                            if hasattr(PaymentRecord, k)
                        }))
                except Exception as e:
                    print(f"Pair generation error ({gen_fn.__name__}): {e}")

        random.shuffle(records)

        # Bulk insert in batches to avoid hitting parameter limits
        batch_size = 200
        for i in range(0, len(records), batch_size):
            db.bulk_save_objects(records[i:i + batch_size])
            db.commit()

        total = db.query(PaymentRecord).count()
        print(f"Payment database seeded: {total} records ({len(records)} inserted).")

    except Exception as e:
        db.rollback()
        print(f"Payment seeder error: {e}")
        raise
    finally:
        db.close()
