import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, JSON, Date
from datetime import datetime, timezone
import uuid

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class DuplicatePaymentRecord(Base):
    __tablename__ = "dup_duplicate_payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    payment1_id = Column(String, nullable=False)
    payment2_id = Column(String, nullable=False)
    probability = Column(Float, nullable=False)
    duplicate_type = Column(String, nullable=False)
    payment_system = Column(String, nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    currency = Column(String, nullable=False, default="USD")
    sender_bic = Column(String)
    receiver_bic = Column(String)
    originator_country = Column(String)
    beneficiary_country = Column(String)
    payment_date1 = Column(String)
    payment_date2 = Column(String)
    status = Column(String, nullable=False, default="pending")
    matched_fields = Column(JSON, default=list)
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    notes = Column(Text)
    scan_id = Column(String)


class AgentMemoryRecord(Base):
    __tablename__ = "dup_agent_memory"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    category = Column(String, nullable=False)
    key = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TrainingSessionRecord(Base):
    __tablename__ = "dup_training_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    training_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_message_at = Column(DateTime)
    message_count = Column(Integer, default=0)


class TrainingMessageRecord(Base):
    __tablename__ = "dup_training_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ConversationRecord(Base):
    __tablename__ = "dup_conversations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ConversationMessageRecord(Base):
    __tablename__ = "dup_conversation_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String, nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DataSourceSchemaRecord(Base):
    __tablename__ = "dup_data_source_schemas"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text)
    tables = Column(JSON, default=list)
    connection_hint = Column(Text)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ScanRecord(Base):
    __tablename__ = "dup_scan_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(String, nullable=False, default="running")
    payments_scanned = Column(Integer, default=0)
    duplicates_found = Column(Integer, default=0)
    progress = Column(Float, default=0.0)
    current_phase = Column(String)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime)
    message = Column(Text)


class PaymentRecord(Base):
    """Simulated bank payment database — feeds into duplicate detection."""
    __tablename__ = "dup_payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # --- Payment system / routing ---
    payment_system = Column(String, nullable=False)  # SWIFT_MT, SWIFT_MX, ACH, INTERNAL
    message_type = Column(String)   # MT103, MT202, MT202COV, pacs.008, pacs.009, pain.001, CCD, PPD, CTX, WIRE, BOOK
    source_system = Column(String)  # CORE_BANKING, TREASURY, TRADE_FINANCE, CORRESPONDENT, RTGS, SWIFT_GPI
    channel = Column(String)        # API, FILE, MANUAL, SWIFT_NET, FED_WIRE, CHIPS

    # --- Core financial fields ---
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=False)       # ISO 4217
    value_date = Column(String)                     # YYYY-MM-DD
    status = Column(String, default="settled")      # received, processing, settled, failed, returned, cancelled
    priority = Column(String, default="NORMAL")     # URGENT, NORMAL, LOW

    # --- Timestamps ---
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    processed_at = Column(DateTime(timezone=True))

    # --- Originator / Sender ---
    originator_name = Column(String)
    originator_account = Column(String)     # IBAN or account number
    originator_country = Column(String)     # ISO 3166-1 alpha-2
    sender_bic = Column(String)             # BIC8 or BIC11
    sender_bank_name = Column(String)

    # --- Beneficiary / Receiver ---
    beneficiary_name = Column(String)
    beneficiary_account = Column(String)    # IBAN or account number
    beneficiary_country = Column(String)
    receiver_bic = Column(String)
    receiver_bank_name = Column(String)

    # --- SWIFT-specific fields ---
    uetr = Column(String)                   # UUID — Unique End-to-end Transaction Reference (SWIFT GPI)
    transaction_reference = Column(String)  # MT field :20: / ISO InstrId
    related_reference = Column(String)      # MT field :21:
    end_to_end_id = Column(String)          # ISO 20022 EndToEndId
    correspondent_bank = Column(String)     # Intermediary BIC

    # --- ACH-specific fields ---
    trace_number = Column(String)           # 15-digit ACH trace number
    routing_number = Column(String)         # 9-digit ABA routing number
    sec_code = Column(String)               # CCD, PPD, CTX, WEB, TEL
    company_name = Column(String)           # ACH company name
    individual_name = Column(String)        # ACH individual name / receiver name
    batch_number = Column(String)           # ACH batch number
    effective_date = Column(String)         # ACH effective entry date YYMMDD

    # --- INTERNAL / book transfer fields ---
    internal_ref = Column(String)
    from_account = Column(String)
    to_account = Column(String)
    gl_code = Column(String)
    department = Column(String)
    cost_centre = Column(String)

    # --- Narrative / purpose ---
    remittance_info = Column(Text)
    purpose_code = Column(String)           # ISO 20022 purpose code e.g. SUPP, SALA
    invoice_reference = Column(String)

    # --- Scan tracking ---
    is_scanned = Column(Boolean, default=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    _seed_sample_data()
    # Import here to avoid circular imports
    from seed_payments import seed_payment_database
    seed_payment_database()


def _seed_sample_data():
    """Seed sample duplicate payment data for demonstration."""
    db = SessionLocal()
    try:
        count = db.query(DuplicatePaymentRecord).count()
        if count > 0:
            return

        import random
        from datetime import timedelta

        payment_systems = ["SWIFT_MT", "SWIFT_MX", "ACH", "INTERNAL"]
        duplicate_types = [
            "exact_match", "fuzzy_amount_date", "multi_source_consolidation",
            "network_retry", "manual_resubmission", "system_reprocessing"
        ]
        currencies = ["USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD"]
        countries = ["US", "GB", "DE", "FR", "CH", "SG", "JP", "AU", "CA", "NL", "HK"]
        statuses = ["pending", "confirmed_duplicate", "dismissed", "under_review"]
        bics = ["DEUTDEFF", "BOFAUS3N", "CHASUS33", "BNPAFRPP", "UBSWCHZH", 
                "HSBCHKHH", "CITISGSG", "ANZBNZ22", "ROYCCAT2", "NATAAU33"]

        base_date = datetime.now(timezone.utc) - timedelta(days=90)
        
        records = []
        for i in range(500):
            system = random.choice(payment_systems)
            dt1 = base_date + timedelta(days=random.randint(0, 85), hours=random.randint(0, 23))
            dt2 = dt1 + timedelta(minutes=random.randint(1, 120))
            orig_country = random.choice(countries)
            dest_country = random.choice(countries)
            prob = random.uniform(0.3, 0.99)
            
            matched = []
            if prob > 0.8:
                matched = ["amount", "currency", "sender_bic", "receiver_bic", "value_date"]
            elif prob > 0.6:
                matched = ["amount", "currency", random.choice(["sender_bic", "receiver_bic"])]
            else:
                matched = ["amount", random.choice(["currency", "sender_bic"])]

            rec = DuplicatePaymentRecord(
                id=str(uuid.uuid4()),
                payment1_id=f"PMT{random.randint(100000, 999999)}",
                payment2_id=f"PMT{random.randint(100000, 999999)}",
                probability=round(prob, 4),
                duplicate_type=random.choice(duplicate_types),
                payment_system=system,
                amount=round(random.uniform(1000, 5000000), 2),
                currency=random.choice(currencies),
                sender_bic=random.choice(bics),
                receiver_bic=random.choice(bics),
                originator_country=orig_country,
                beneficiary_country=dest_country,
                payment_date1=dt1.isoformat(),
                payment_date2=dt2.isoformat(),
                status=random.choices(statuses, weights=[0.5, 0.2, 0.2, 0.1])[0],
                matched_fields=matched,
                detected_at=dt2 + timedelta(minutes=random.randint(5, 60)),
                scan_id="initial_seed",
            )
            records.append(rec)

        db.bulk_save_objects(records)
        db.commit()

        schema = DataSourceSchemaRecord(
            id=str(uuid.uuid4()),
            name="Banking Payment System",
            description="Core payment tables for duplicate detection. Define your payment data source structure here so the AI agents can understand and query your data.",
            tables=[
                {
                    "tableName": "payments",
                    "description": "Core payment transactions table supporting SWIFT MT/MX, ACH, and internal transfers",
                    "columns": [
                        {"columnName": "id", "dataType": "VARCHAR(50)", "description": "Unique payment identifier", "isPrimaryKey": True, "isForeignKey": False, "isNullable": False, "exampleValues": ["PMT001", "PMT002"]},
                        {"columnName": "payment_system", "dataType": "VARCHAR(20)", "description": "Payment system type: SWIFT_MT, SWIFT_MX, ACH, INTERNAL", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["SWIFT_MT", "ACH"]},
                        {"columnName": "amount", "dataType": "DECIMAL(18,2)", "description": "Payment amount", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["10000.00", "250000.50"]},
                        {"columnName": "currency", "dataType": "CHAR(3)", "description": "ISO 4217 currency code", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["USD", "EUR"]},
                        {"columnName": "value_date", "dataType": "DATE", "description": "Payment value date", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["2025-01-15", "2025-03-01"]},
                        {"columnName": "sender_bic", "dataType": "VARCHAR(11)", "description": "Sender bank BIC code", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True, "exampleValues": ["DEUTDEFF", "CHASUS33"]},
                        {"columnName": "receiver_bic", "dataType": "VARCHAR(11)", "description": "Receiver bank BIC code", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True, "exampleValues": ["BNPAFRPP", "HSBCHKHH"]},
                        {"columnName": "originator_account", "dataType": "VARCHAR(34)", "description": "Originator IBAN/account number", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True, "exampleValues": ["DE89370400440532013000"]},
                        {"columnName": "beneficiary_account", "dataType": "VARCHAR(34)", "description": "Beneficiary IBAN/account number", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True, "exampleValues": ["GB29NWBK60161331926819"]},
                        {"columnName": "reference", "dataType": "VARCHAR(35)", "description": "Payment reference/end-to-end ID", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True, "exampleValues": ["INV-2025-001", "REF123456"]},
                        {"columnName": "status", "dataType": "VARCHAR(20)", "description": "Payment status", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["completed", "pending", "failed"]},
                        {"columnName": "source_system", "dataType": "VARCHAR(50)", "description": "Originating system (for multi-source payments)", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True, "exampleValues": ["CORE_BANKING", "TREASURY", "TRADE_FINANCE"]},
                        {"columnName": "created_at", "dataType": "TIMESTAMP", "description": "Record creation timestamp", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["2025-01-15 10:30:00"]},
                    ]
                },
                {
                    "tableName": "swift_mt_messages",
                    "description": "SWIFT MT format message details (MT103, MT202, MT101)",
                    "columns": [
                        {"columnName": "id", "dataType": "VARCHAR(50)", "description": "Message ID", "isPrimaryKey": True, "isForeignKey": False, "isNullable": False},
                        {"columnName": "payment_id", "dataType": "VARCHAR(50)", "description": "FK to payments.id", "isPrimaryKey": False, "isForeignKey": True, "isNullable": False},
                        {"columnName": "mt_type", "dataType": "VARCHAR(6)", "description": "MT message type e.g. MT103", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["MT103", "MT202"]},
                        {"columnName": "field_20", "dataType": "VARCHAR(16)", "description": "Transaction reference number", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                        {"columnName": "field_32a_date", "dataType": "DATE", "description": "Value date from field 32A", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                        {"columnName": "field_32a_amount", "dataType": "DECIMAL(18,3)", "description": "Amount from field 32A", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                    ]
                },
                {
                    "tableName": "swift_mx_messages",
                    "description": "SWIFT MX / ISO 20022 message details (pacs.008, pacs.009, pain.001)",
                    "columns": [
                        {"columnName": "id", "dataType": "VARCHAR(50)", "description": "Message ID", "isPrimaryKey": True, "isForeignKey": False, "isNullable": False},
                        {"columnName": "payment_id", "dataType": "VARCHAR(50)", "description": "FK to payments.id", "isPrimaryKey": False, "isForeignKey": True, "isNullable": False},
                        {"columnName": "msg_type", "dataType": "VARCHAR(20)", "description": "MX message type e.g. pacs.008", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["pacs.008", "pacs.009"]},
                        {"columnName": "end_to_end_id", "dataType": "VARCHAR(35)", "description": "End-to-end identification", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                        {"columnName": "uetr", "dataType": "CHAR(36)", "description": "Unique End-to-end Transaction Reference (UUID)", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                    ]
                },
                {
                    "tableName": "ach_transactions",
                    "description": "ACH network transactions",
                    "columns": [
                        {"columnName": "id", "dataType": "VARCHAR(50)", "description": "Transaction ID", "isPrimaryKey": True, "isForeignKey": False, "isNullable": False},
                        {"columnName": "payment_id", "dataType": "VARCHAR(50)", "description": "FK to payments.id", "isPrimaryKey": False, "isForeignKey": True, "isNullable": False},
                        {"columnName": "sec_code", "dataType": "CHAR(3)", "description": "ACH Standard Entry Class code", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True, "exampleValues": ["CCD", "PPD", "CTX"]},
                        {"columnName": "trace_number", "dataType": "VARCHAR(15)", "description": "ACH trace number", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                        {"columnName": "batch_number", "dataType": "VARCHAR(7)", "description": "ACH batch number", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                        {"columnName": "routing_number", "dataType": "CHAR(9)", "description": "Receiving bank routing number", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                    ]
                },
                {
                    "tableName": "payment_sources",
                    "description": "Multi-source payment tracking - different systems that can originate the same payment",
                    "columns": [
                        {"columnName": "id", "dataType": "VARCHAR(50)", "description": "Source record ID", "isPrimaryKey": True, "isForeignKey": False, "isNullable": False},
                        {"columnName": "payment_id", "dataType": "VARCHAR(50)", "description": "FK to payments.id", "isPrimaryKey": False, "isForeignKey": True, "isNullable": False},
                        {"columnName": "source_system", "dataType": "VARCHAR(50)", "description": "Source system name", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False, "exampleValues": ["CORE_BANKING", "TREASURY", "CORRESPONDENT"]},
                        {"columnName": "source_reference", "dataType": "VARCHAR(50)", "description": "Reference in source system", "isPrimaryKey": False, "isForeignKey": False, "isNullable": True},
                        {"columnName": "received_at", "dataType": "TIMESTAMP", "description": "When payment was received from this source", "isPrimaryKey": False, "isForeignKey": False, "isNullable": False},
                    ]
                }
            ],
            connection_hint="Connect to the payments database using DATABASE_URL environment variable. Tables are prefixed with their payment system context.",
        )
        db.add(schema)
        db.commit()

    except Exception as e:
        db.rollback()
        print(f"Warning: Could not seed sample data: {e}")
    finally:
        db.close()
