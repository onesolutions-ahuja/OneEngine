CREATE TABLE IF NOT EXISTS appointment_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
    price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
    payment_policy VARCHAR(30) NOT NULL DEFAULT 'NO_ADVANCE'
      CHECK (payment_policy IN ('NO_ADVANCE','FIXED_DEPOSIT','PERCENT_DEPOSIT','FULL_PAYMENT')),
    deposit_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deposit_value >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_appointment_services_company ON appointment_services(company_id, active, name);

  CREATE TABLE IF NOT EXISTS appointment_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    resource_type VARCHAR(40) NOT NULL DEFAULT 'STAFF',
    timezone VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_appointment_resources_company ON appointment_resources(company_id, active, name);

  CREATE TABLE IF NOT EXISTS appointment_resource_services (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES appointment_resources(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (resource_id, service_id)
  );

  CREATE TABLE IF NOT EXISTS appointment_availability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES appointment_resources(id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (slot_interval_minutes > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (end_time > start_time)
  );
  CREATE INDEX IF NOT EXISTS idx_appointment_availability_rules_resource
    ON appointment_availability_rules(company_id, resource_id, weekday, active);

  CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES appointment_services(id) ON DELETE RESTRICT,
    resource_id UUID NOT NULL REFERENCES appointment_resources(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(200),
    customer_phone VARCHAR(80),
    customer_email VARCHAR(255),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED'
      CHECK (status IN ('TENTATIVE','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW')),
    source_channel VARCHAR(30) NOT NULL DEFAULT 'UI',
    notes TEXT,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED'
      CHECK (payment_status IN ('NOT_REQUIRED','PENDING','PARTIAL','PAID','FAILED','REFUNDED')),
    amount_due NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
  );
  CREATE INDEX IF NOT EXISTS idx_appointments_company_start ON appointments(company_id, starts_at);
  CREATE INDEX IF NOT EXISTS idx_appointments_resource_time ON appointments(company_id, resource_id, starts_at, ends_at);

  CREATE TABLE IF NOT EXISTS appointment_slot_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES appointment_resources(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    conversation_id VARCHAR(200),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CONSUMED','RELEASED','EXPIRED')),
    idempotency_key VARCHAR(200),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
  );
  CREATE INDEX IF NOT EXISTS idx_appointment_holds_resource_time
    ON appointment_slot_holds(company_id, resource_id, starts_at, ends_at, status);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_hold_idempotency
    ON appointment_slot_holds(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

  CREATE TABLE IF NOT EXISTS appointment_payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    hold_id UUID REFERENCES appointment_slot_holds(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    provider_package_key VARCHAR(100),
    provider_reference VARCHAR(255),
    payment_url TEXT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING','SUCCEEDED','FAILED','CANCELLED','EXPIRED','REFUNDED')),
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_appointment_payment_company_status
    ON appointment_payment_requests(company_id, status, created_at DESC);

  CREATE TABLE IF NOT EXISTS assistant_conversation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL,
    external_conversation_id VARCHAR(200) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    current_workflow_key VARCHAR(150),
    current_step_key VARCHAR(150),
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    human_handoff BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, channel, external_conversation_id)
  );

  CREATE TABLE IF NOT EXISTS appointment_booking_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP','WEB')),
    source_message_id VARCHAR(255),
    sender VARCHAR(255),
    recipient VARCHAR(255),
    subject TEXT,
    body TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'NEW'
      CHECK (status IN ('NEW','LINK_SENT','SLOT_SELECTED','AWAITING_PAYMENT','CONFIRMED','CANCELLED','EXPIRED')),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    service_id UUID REFERENCES appointment_services(id) ON DELETE SET NULL,
    hold_id UUID REFERENCES appointment_slot_holds(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    payment_request_id UUID REFERENCES appointment_payment_requests(id) ON DELETE SET NULL,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_appointment_booking_cases_company
    ON appointment_booking_cases(company_id,status,created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_booking_case_source
    ON appointment_booking_cases(company_id,channel,source_message_id)
    WHERE source_message_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS appointment_public_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    booking_case_id UUID NOT NULL REFERENCES appointment_booking_cases(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('BOOK_SLOT','PAYMENT','MANAGE')),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_appointment_public_links_case
    ON appointment_public_links(company_id,booking_case_id,purpose,expires_at);

  INSERT INTO permissions(code,name,description) VALUES
    ('appointments.view','View Appointments','View OneAssistant appointment records and calendar'),
    ('appointments.manage','Manage Appointments','Create, edit, reschedule and cancel appointments'),
    ('appointments.configure','Configure Appointments','Configure services, resources and availability'),
    ('appointments.payment','Manage Appointment Payments','Create and reconcile appointment deposits and payment requests')
  ON CONFLICT (code) DO NOTHING;
