import { createHash } from "node:crypto";
import { publishPlatformEvent } from "./platformEvents.js";

const HOLD_MINUTES_DEFAULT = 10;
const MAX_SLOT_RESULTS = 20;

function asDate(value, field) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw new Error(`${field} must be a valid date/time`);
  return d;
}

function minutes(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function iso(d) { return new Date(d).toISOString(); }

export const oneAssistantSchema = `
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
`;

export async function listPaymentRequestProviders(db, companyId) {
  const result = await db(
    `SELECT pr.package_key, pr.name, pr.manifest
       FROM company_package_installations cpi
       JOIN package_registry pr ON pr.id=cpi.package_id
      WHERE cpi.company_id=$1 AND cpi.status='active'
        AND pr.active=true
        AND COALESCE(pr.manifest->'connectorApp'->>'type','')='payment'
      ORDER BY pr.display_order, pr.name`,
    [companyId]
  );
  return result.rows
    .filter((row) => {
      const caps = row.manifest?.connectorApp?.capabilities || [];
      return caps.some((cap) => String(cap?.key || cap) === 'payment.request');
    })
    .map((row) => ({
      packageKey: row.package_key,
      name: row.name,
      capability: 'payment.request',
      paymentMethodCode: row.manifest?.connectorApp?.paymentMethodCode || row.package_key,
      paymentMethodLabel: row.manifest?.connectorApp?.paymentMethodLabel || row.name,
    }));
}

export async function findAvailableAppointmentSlots(db, {
  companyId, serviceId, from, to, resourceId = null, limit = 4,
} = {}) {
  if (!companyId || !serviceId) throw new Error('companyId and serviceId are required');
  const start = asDate(from || new Date(), 'from');
  const end = asDate(to || new Date(start.getTime() + 14 * 86400000), 'to');
  if (end <= start) throw new Error('to must be after from');

  const serviceResult = await db(
    `SELECT id,duration_minutes,active FROM appointment_services WHERE id=$1 AND company_id=$2 LIMIT 1`,
    [serviceId, companyId]
  );
  const service = serviceResult.rows[0];
  if (!service || service.active !== true) return [];

  const resourceResult = await db(
    `SELECT r.id, r.store_id, r.timezone, COALESCE(ars.duration_minutes,s.duration_minutes) AS duration_minutes
       FROM appointment_resources r
       JOIN appointment_resource_services ars ON ars.resource_id=r.id AND ars.service_id=$1 AND ars.company_id=$2 AND ars.active=true
       JOIN appointment_services s ON s.id=ars.service_id AND s.company_id=$2
      WHERE r.company_id=$2 AND r.active=true
        AND ($3::uuid IS NULL OR r.id=$3::uuid)
      ORDER BY r.name`,
    [serviceId, companyId, resourceId]
  );
  const resources = resourceResult.rows;
  if (!resources.length) return [];

  const resourceIds = resources.map((r) => r.id);
  const [rulesResult, busyResult] = await Promise.all([
    db(
      `SELECT resource_id,weekday,start_time::text,end_time::text,slot_interval_minutes
         FROM appointment_availability_rules
        WHERE company_id=$1 AND resource_id=ANY($2::uuid[]) AND active=true`,
      [companyId, resourceIds]
    ),
    db(
      `SELECT resource_id,starts_at,ends_at FROM appointments
        WHERE company_id=$1 AND resource_id=ANY($2::uuid[])
          AND status NOT IN ('CANCELLED','NO_SHOW')
          AND starts_at < $4 AND ends_at > $3
       UNION ALL
       SELECT resource_id,starts_at,ends_at FROM appointment_slot_holds
        WHERE company_id=$1 AND resource_id=ANY($2::uuid[])
          AND status='ACTIVE' AND expires_at>NOW()
          AND starts_at < $4 AND ends_at > $3`,
      [companyId, resourceIds, start.toISOString(), end.toISOString()]
    ),
  ]);

  const busyByResource = new Map();
  for (const row of busyResult.rows) {
    const list = busyByResource.get(row.resource_id) || [];
    list.push([new Date(row.starts_at), new Date(row.ends_at)]);
    busyByResource.set(row.resource_id, list);
  }

  const rulesByResource = new Map();
  for (const row of rulesResult.rows) {
    const list = rulesByResource.get(row.resource_id) || [];
    list.push(row);
    rulesByResource.set(row.resource_id, list);
  }

  const output = [];
  const capped = Math.min(MAX_SLOT_RESULTS, Math.max(1, Number(limit) || 4));
  for (const resource of resources) {
    const duration = minutes(resource.duration_minutes, service.duration_minutes);
    const rules = rulesByResource.get(resource.id) || [];
    for (let day = new Date(start); day < end && output.length < capped; day = new Date(day.getTime() + 86400000)) {
      const weekday = day.getUTCDay();
      for (const rule of rules.filter((r) => Number(r.weekday) === weekday)) {
        const [sh, sm] = String(rule.start_time).split(':').map(Number);
        const [eh, em] = String(rule.end_time).split(':').map(Number);
        const windowStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), sh, sm || 0));
        const windowEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), eh, em || 0));
        const interval = minutes(rule.slot_interval_minutes, 15);
        for (let slotStart = windowStart; slotStart.getTime() + duration * 60000 <= windowEnd.getTime(); slotStart = new Date(slotStart.getTime() + interval * 60000)) {
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);
          if (slotStart < start || slotEnd > end) continue;
          const overlaps = (busyByResource.get(resource.id) || []).some(([bStart,bEnd]) => slotStart < bEnd && slotEnd > bStart);
          if (!overlaps) {
            output.push({ resourceId: resource.id, storeId: resource.store_id, serviceId, startsAt: iso(slotStart), endsAt: iso(slotEnd) });
            if (output.length >= capped) break;
          }
        }
      }
    }
  }
  return output.sort((a,b) => a.startsAt.localeCompare(b.startsAt)).slice(0,capped);
}

export async function holdAppointmentSlot(client, {
  companyId, storeId = null, serviceId, resourceId, customerId = null, conversationId = null,
  startsAt, endsAt, holdMinutes = HOLD_MINUTES_DEFAULT, idempotencyKey = null, metadata = {},
} = {}) {
  const start = asDate(startsAt, 'startsAt');
  const end = asDate(endsAt, 'endsAt');
  if (end <= start) throw new Error('endsAt must be after startsAt');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${companyId}:${resourceId}:${start.toISOString().slice(0,10)}`]);

  if (idempotencyKey) {
    const existing = await client.query(
      `SELECT * FROM appointment_slot_holds WHERE company_id=$1 AND idempotency_key=$2 LIMIT 1`,
      [companyId,idempotencyKey]
    );
    if (existing.rows[0]) return existing.rows[0];
  }

  const conflict = await client.query(
    `SELECT 1 FROM appointments
      WHERE company_id=$1 AND resource_id=$2 AND status NOT IN ('CANCELLED','NO_SHOW')
        AND starts_at < $4 AND ends_at > $3
      UNION ALL
      SELECT 1 FROM appointment_slot_holds
      WHERE company_id=$1 AND resource_id=$2 AND status='ACTIVE' AND expires_at>NOW()
        AND starts_at < $4 AND ends_at > $3
      LIMIT 1`,
    [companyId,resourceId,start.toISOString(),end.toISOString()]
  );
  if (conflict.rows.length) {
    const error = new Error('Appointment slot is no longer available');
    error.code = 'SLOT_UNAVAILABLE';
    throw error;
  }

  const expiresAt = new Date(Date.now() + minutes(holdMinutes,HOLD_MINUTES_DEFAULT) * 60000);
  const result = await client.query(
    `INSERT INTO appointment_slot_holds
      (company_id,store_id,service_id,resource_id,customer_id,conversation_id,starts_at,ends_at,expires_at,idempotency_key,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING *`,
    [companyId,storeId,serviceId,resourceId,customerId,conversationId,start.toISOString(),end.toISOString(),expiresAt.toISOString(),idempotencyKey,JSON.stringify(metadata||{})]
  );
  return result.rows[0];
}

export async function releaseAppointmentHold(db, { companyId, holdId, reason = null } = {}) {
  const result = await db(
    `UPDATE appointment_slot_holds
        SET status=CASE WHEN expires_at<=NOW() THEN 'EXPIRED' ELSE 'RELEASED' END,
            metadata=metadata||jsonb_build_object('releaseReason',$3::text),updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND status='ACTIVE'
      RETURNING *`,
    [holdId,companyId,reason]
  );
  return result.rows[0] || null;
}

export async function confirmAppointmentFromHold(client, {
  companyId, holdId, customerId = null, customerName = null, customerPhone = null, customerEmail = null,
  sourceChannel = 'UI', notes = null, paymentStatus = 'NOT_REQUIRED', amountDue = 0, amountPaid = 0,
  createdBy = null, metadata = {},
} = {}) {
  const holdResult = await client.query(
    `SELECT h.*,s.payment_policy,s.price,s.currency
       FROM appointment_slot_holds h
       JOIN appointment_services s ON s.id=h.service_id AND s.company_id=h.company_id
      WHERE h.id=$1 AND h.company_id=$2 FOR UPDATE`,
    [holdId,companyId]
  );
  const hold = holdResult.rows[0];
  if (!hold) throw new Error('Appointment hold not found');
  if (hold.status !== 'ACTIVE' || new Date(hold.expires_at) <= new Date()) {
    const error = new Error('Appointment hold has expired');
    error.code = 'HOLD_EXPIRED';
    throw error;
  }

  const conflict = await client.query(
    `SELECT 1 FROM appointments
      WHERE company_id=$1 AND resource_id=$2 AND status NOT IN ('CANCELLED','NO_SHOW')
        AND starts_at < $4 AND ends_at > $3 LIMIT 1`,
    [companyId,hold.resource_id,hold.starts_at,hold.ends_at]
  );
  if (conflict.rows.length) throw Object.assign(new Error('Appointment slot is no longer available'),{code:'SLOT_UNAVAILABLE'});

  const inserted = await client.query(
    `INSERT INTO appointments
      (company_id,store_id,service_id,resource_id,customer_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source_channel,notes,payment_status,amount_due,amount_paid,metadata,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CONFIRMED',$11,$12,$13,$14,$15,$16::jsonb,$17)
     RETURNING *`,
    [companyId,hold.store_id,hold.service_id,hold.resource_id,customerId||hold.customer_id,customerName,customerPhone,customerEmail,hold.starts_at,hold.ends_at,sourceChannel,notes,paymentStatus,Number(amountDue)||0,Number(amountPaid)||0,JSON.stringify(metadata||{}),createdBy]
  );
  await client.query(`UPDATE appointment_slot_holds SET status='CONSUMED',updated_at=NOW() WHERE id=$1 AND company_id=$2`,[holdId,companyId]);
  return inserted.rows[0];
}

export async function createAppointmentPaymentRequest(db, {
  companyId, holdId = null, appointmentId = null, providerPackageKey = null,
  amount, currency = "GBP", expiresAt = null, metadata = {},
} = {}) {
  if (!companyId) throw new Error("companyId is required");
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) throw new Error("amount must be zero or greater");
  if (providerPackageKey) {
    const providers = await listPaymentRequestProviders(db, companyId);
    if (!providers.some((provider) => provider.packageKey === providerPackageKey)) {
      const error = new Error("Selected payment provider is not installed, active, and payment-request capable");
      error.code = "PAYMENT_PROVIDER_UNAVAILABLE";
      throw error;
    }
  }
  const result = await db(
    `INSERT INTO appointment_payment_requests
      (company_id,hold_id,appointment_id,provider_package_key,amount,currency,expires_at,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING *`,
    [companyId,holdId,appointmentId,providerPackageKey,numericAmount,String(currency||"GBP").toUpperCase(),expiresAt,JSON.stringify(metadata||{})]
  );
  return result.rows[0];
}

export function calculateAppointmentPayment(service) {
  const price = Math.max(0, Number(service?.price || 0));
  const deposit = Math.max(0, Number(service?.deposit_value || 0));
  switch (String(service?.payment_policy || 'NO_ADVANCE')) {
    case 'FULL_PAYMENT': return price;
    case 'FIXED_DEPOSIT': return Math.min(price, deposit);
    case 'PERCENT_DEPOSIT': return Math.min(price, Math.round((price * deposit / 100) * 100) / 100);
    default: return 0;
  }
}


function hashBookingToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export async function resolveAppointmentPublicLink(db, token, { purpose = null } = {}) {
  const result = await db(
    `SELECT l.*,c.channel,c.sender,c.recipient,c.subject,c.body,c.status AS case_status,
            c.customer_id,c.service_id,c.hold_id,c.appointment_id,c.payment_request_id,c.state
       FROM appointment_public_links l
       JOIN appointment_booking_cases c ON c.id=l.booking_case_id AND c.company_id=l.company_id
      WHERE l.token_hash=$1
        AND l.consumed_at IS NULL
        AND l.expires_at>NOW()
        AND ($2::text IS NULL OR l.purpose=$2)
      LIMIT 1`,
    [hashBookingToken(token), purpose]
  );
  return result.rows[0] || null;
}

export async function resolveAssistantSubflow(db, {
  companyId, capability, channel = null, providerPackageKey = null,
} = {}) {
  if (!companyId || !capability) return null;
  const normalizedChannel = channel ? String(channel).toUpperCase() : null;
  const values = [companyId, capability, normalizedChannel, providerPackageKey || null];
  const result = await db(
    `SELECT r.id,r.name,r.action,r.updated_at
       FROM platform_rules r
      WHERE r.company_id=$1
        AND r.active=true
        AND r.action->>'type'='workflow'
        AND r.action->>'subflowCapability'=$2
        AND ($3::text IS NULL OR COALESCE(UPPER(r.action->>'channel'),'') IN ('', $3))
        AND ($4::text IS NULL OR COALESCE(r.action->>'providerPackageKey','') IN ('', $4))
      ORDER BY COALESCE((r.action->>'priority')::int,100),r.updated_at DESC
      LIMIT 20`,
    values
  );
  for (const row of result.rows || []) {
    const action = row.action || {};
    const requiredPackage = action.requiredPackageKey || action.providerPackageKey || null;
    if (requiredPackage) {
      const installed = await db(
        `SELECT 1
           FROM company_package_installations i
           JOIN package_registry p ON p.id=i.package_id
          WHERE i.company_id=$1 AND p.package_key=$2 AND i.status='active'
            AND COALESCE(i.suspended_by_entitlement,false)=false
          LIMIT 1`,
        [companyId, requiredPackage]
      );
      if (!installed.rows.length) continue;
    }
    return row;
  }
  return null;
}

export async function selectPublicAppointmentSlot(client, {
  publicLink, serviceId, resourceId, startsAt, endsAt, holdMinutes = 10,
} = {}) {
  if (!publicLink) throw new Error("Booking link is required");
  const companyId = publicLink.company_id;
  const bookingCaseId = publicLink.booking_case_id;
  if (!["NEW","LINK_SENT"].includes(String(publicLink.case_status || ""))) {
    const error = new Error("This booking request has already progressed");
    error.code = "BOOKING_ALREADY_USED";
    throw error;
  }
  const allowedSlots = await findAvailableAppointmentSlots(client.query.bind(client), {
    companyId,
    serviceId,
    resourceId,
    from: startsAt,
    to: endsAt,
    limit: 20,
  });
  const selectedAllowed = allowedSlots.some((slot) =>
    String(slot.resourceId) === String(resourceId)
      && new Date(slot.startsAt).toISOString() === new Date(startsAt).toISOString()
      && new Date(slot.endsAt).toISOString() === new Date(endsAt).toISOString()
  );
  if (!selectedAllowed) {
    const error = new Error("Selected time is not available for this service/resource");
    error.code = "SLOT_UNAVAILABLE";
    throw error;
  }
  const hold = await holdAppointmentSlot(client, {
    companyId,
    serviceId,
    resourceId,
    startsAt,
    endsAt,
    holdMinutes,
    conversationId: `booking-case:${bookingCaseId}`,
    idempotencyKey: `public-booking:${bookingCaseId}:${resourceId}:${startsAt}`,
    metadata: { bookingCaseId, channel: publicLink.channel },
  });
  const serviceResult = await client.query(
    `SELECT id,name,price,currency,payment_policy,deposit_value
       FROM appointment_services WHERE id=$1 AND company_id=$2 LIMIT 1`,
    [serviceId, companyId]
  );
  const service = serviceResult.rows[0];
  if (!service) throw new Error("Appointment service not found");
  const amount = calculateAppointmentPayment(service);
  let paymentRequest = null;
  if (amount > 0) {
    const providers = await listPaymentRequestProviders(client.query.bind(client), companyId);
    paymentRequest = await createAppointmentPaymentRequest(client.query.bind(client), {
      companyId,
      holdId: hold.id,
      providerPackageKey: providers[0]?.packageKey || null,
      amount,
      currency: service.currency,
      expiresAt: hold.expires_at,
      metadata: { bookingCaseId, channel: publicLink.channel },
    });
  }
  await client.query(
    `UPDATE appointment_booking_cases
        SET service_id=$3,hold_id=$4,payment_request_id=$5,
            status=CASE WHEN $6::numeric>0 THEN 'AWAITING_PAYMENT' ELSE 'SLOT_SELECTED' END,
            state=state||jsonb_build_object('selectedStartsAt',$7::text,'selectedEndsAt',$8::text),
            updated_at=NOW()
      WHERE id=$1 AND company_id=$2`,
    [bookingCaseId, companyId, serviceId, hold.id, paymentRequest?.id || null, amount, startsAt, endsAt]
  );
  let appointment=null;
  if(amount<=0){
    appointment=await confirmAppointmentFromHold(client,{
      companyId,
      holdId:hold.id,
      customerPhone:["SMS","WHATSAPP"].includes(String(publicLink.channel || "").toUpperCase()) ? publicLink.sender : null,
      customerEmail:String(publicLink.channel || "").toUpperCase()==="EMAIL" ? publicLink.sender : null,
      sourceChannel:publicLink.channel||"WEB",
      paymentStatus:"NOT_REQUIRED",
      amountDue:0,
      amountPaid:0,
      metadata:{bookingCaseId},
    });
    await client.query(
      `UPDATE appointment_booking_cases
          SET appointment_id=$3,status='CONFIRMED',updated_at=NOW()
        WHERE id=$1 AND company_id=$2`,
      [bookingCaseId,companyId,appointment.id]
    );
  }
  await client.query(
    "UPDATE appointment_public_links SET consumed_at=NOW() WHERE id=$1 AND company_id=$2 AND consumed_at IS NULL",
    [publicLink.id,companyId]
  );
  await publishPlatformEvent({
    db: client.query.bind(client),
    companyId,
    eventType: amount > 0 ? "appointment.payment_required" : "appointment.confirmed",
    payload: {
      bookingCaseId,
      appointmentId:appointment?.id||null,
      channel: publicLink.channel,
      holdId: hold.id,
      serviceId,
      paymentRequestId: paymentRequest?.id || null,
      amount,
      currency: service.currency,
      sender: publicLink.sender || null,
      recipient: publicLink.recipient || null,
      serviceName: service.name || null,
      startsAt,
      endsAt,
      customerPhone: ["SMS","WHATSAPP"].includes(String(publicLink.channel || "").toUpperCase()) ? publicLink.sender : null,
    },
    idempotencyKey: `appointment-public-slot:${bookingCaseId}:${hold.id}`,
  });
  return { hold, service, amount, paymentRequest, appointment };
}


export async function completeAppointmentPayment(client, {
  companyId, paymentRequestId, providerReference = null, paymentUrl = null, amountPaid = null,
} = {}) {
  if (!companyId || !paymentRequestId) throw new Error("companyId and paymentRequestId are required");
  const requestResult = await client.query(
    `SELECT pr.*,c.id AS booking_case_id,c.channel,c.sender,c.recipient,c.subject,c.body,c.customer_id,c.state
       FROM appointment_payment_requests pr
       LEFT JOIN appointment_booking_cases c ON c.payment_request_id=pr.id AND c.company_id=pr.company_id
      WHERE pr.id=$1 AND pr.company_id=$2
      FOR UPDATE OF pr`,
    [paymentRequestId, companyId]
  );
  const payment = requestResult.rows[0];
  if (!payment) throw new Error("Appointment payment request not found");
  if (payment.status === "SUCCEEDED") {
    const existing = payment.appointment_id
      ? await client.query("SELECT * FROM appointments WHERE id=$1 AND company_id=$2 LIMIT 1",[payment.appointment_id,companyId])
      : null;
    return { payment, appointment: existing?.rows?.[0] || null, bookingCaseId: payment.booking_case_id || null };
  }
  if (!payment.hold_id) throw new Error("Appointment payment request is not linked to a slot hold");

  const bookingCase = payment.booking_case_id
    ? await client.query("SELECT * FROM appointment_booking_cases WHERE id=$1 AND company_id=$2 LIMIT 1",[payment.booking_case_id,companyId])
    : null;
  const booking = bookingCase?.rows?.[0] || null;
  const paid = amountPaid == null ? Number(payment.amount || 0) : Number(amountPaid);
  const appointment = await confirmAppointmentFromHold(client,{
    companyId,
    holdId:payment.hold_id,
    customerId:booking?.customer_id || null,
    customerPhone:["SMS","WHATSAPP"].includes(String(booking?.channel || "").toUpperCase()) ? booking.sender : null,
    customerEmail:String(booking?.channel || "").toUpperCase() === "EMAIL" ? booking.sender : null,
    sourceChannel:booking?.channel || "PAYMENT",
    paymentStatus:"PAID",
    amountDue:Number(payment.amount || 0),
    amountPaid:paid,
    metadata:{bookingCaseId:booking?.id || null,paymentRequestId},
  });
  await client.query(
    `UPDATE appointment_payment_requests
        SET status='SUCCEEDED',appointment_id=$3,provider_reference=COALESCE($4,provider_reference),
            payment_url=COALESCE($5,payment_url),updated_at=NOW()
      WHERE id=$1 AND company_id=$2`,
    [paymentRequestId,companyId,appointment.id,providerReference,paymentUrl]
  );
  if (booking?.id) {
    await client.query(
      `UPDATE appointment_booking_cases
          SET appointment_id=$3,status='CONFIRMED',updated_at=NOW()
        WHERE id=$1 AND company_id=$2`,
      [booking.id,companyId,appointment.id]
    );
  }
  await publishPlatformEvent({
    db:client.query.bind(client),
    companyId,
    eventType:"appointment.confirmed",
    payload:{
      appointmentId:appointment.id,
      bookingCaseId:booking?.id || null,
      channel:booking?.channel || null,
      paymentRequestId,
      providerReference,
    },
    idempotencyKey:`appointment-payment-confirmed:${paymentRequestId}`,
  });
  return {paymentRequestId,appointment,bookingCaseId:booking?.id || null};
}
