-- Narrow fixed lock capability: application roles need INSERT/SELECT audit,
-- not UPDATE/DELETE/TRUNCATE rights merely to serialize the chain append.
CREATE FUNCTION public.capstone_patient_lock_audit() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog
AS $$ LOCK TABLE public.audit_logs IN SHARE ROW EXCLUSIVE MODE $$;
REVOKE ALL ON FUNCTION public.capstone_patient_lock_audit() FROM PUBLIC;
-- Explicit activation must grant EXECUTE only to the separate patient writer.
