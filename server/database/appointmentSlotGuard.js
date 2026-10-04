// Database validation protects every ordinary Appointment CRUD writer.
// A volatile trigger gets a fresh read after the per-resource transaction lock.
export const appointmentSlotGuardSql = `
  CREATE OR REPLACE FUNCTION enforce_appointment_slot_availability()
  RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
  BEGIN
    IF NEW.status IN ('CANCELLED','NO_SHOW') THEN RETURN NEW; END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Appointment writes require read committed isolation'
        USING ERRCODE='40001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('appointment-slot:' || NEW.company_id::text || ':' || NEW.resource_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM appointments existing
       WHERE existing.company_id=NEW.company_id AND existing.resource_id=NEW.resource_id
         AND existing.id IS DISTINCT FROM NEW.id
         AND existing.status NOT IN ('CANCELLED','NO_SHOW')
         AND existing.starts_at < NEW.ends_at AND existing.ends_at > NEW.starts_at
    ) THEN
      RAISE EXCEPTION 'The selected appointment slot is no longer available'
        USING ERRCODE='23P01', CONSTRAINT='appointment_slot_available';
    END IF;
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS appointment_slot_available ON appointments;
  CREATE TRIGGER appointment_slot_available
    BEFORE INSERT OR UPDATE OF company_id,resource_id,starts_at,ends_at,status ON appointments
    FOR EACH ROW EXECUTE FUNCTION enforce_appointment_slot_availability();
`;
