BEGIN;
-- Keep privileged access to Auth tables outside the exposed Data API schema.
CREATE SCHEMA access_audit_private;
REVOKE ALL ON SCHEMA access_audit_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA access_audit_private TO authenticated;
ALTER FUNCTION public.list_user_access_log(timestamptz,timestamptz,uuid,integer,integer) SET SCHEMA access_audit_private;
ALTER FUNCTION access_audit_private.list_user_access_log(timestamptz,timestamptz,uuid,integer,integer) RENAME TO read_log;
REVOKE ALL ON FUNCTION access_audit_private.read_log(timestamptz,timestamptz,uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION access_audit_private.read_log(timestamptz,timestamptz,uuid,integer,integer) TO authenticated;

CREATE FUNCTION public.list_user_access_log(
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now() + interval '1 day',
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  event_id text, user_id uuid, login_identifier text, full_name text,
  occurred_at timestamptz, renewed_at timestamptz, event_kind text,
  ip_address text, ip_source text, user_agent text
) LANGUAGE sql SECURITY INVOKER STABLE
SET search_path = pg_catalog
AS $$ SELECT * FROM access_audit_private.read_log(p_from,p_to,p_user_id,p_limit,p_offset); $$;
REVOKE ALL ON FUNCTION public.list_user_access_log(timestamptz,timestamptz,uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_user_access_log(timestamptz,timestamptz,uuid,integer,integer) TO authenticated;
COMMENT ON FUNCTION public.list_user_access_log IS 'Read-only invoker wrapper. The private helper verifies active platform administrator authorization.';
COMMIT;
