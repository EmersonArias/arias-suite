BEGIN;

-- Additive audit store. Only the authentication service can insert events.
CREATE TABLE public.user_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id uuid UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  login_identifier text NOT NULL CHECK (length(login_identifier) <= 254),
  ip_address inet,
  ip_source text NOT NULL DEFAULT 'forwarded_header' CHECK (ip_source IN ('forwarded_header', 'unavailable')),
  user_agent text CHECK (length(user_agent) <= 512)
);
CREATE INDEX user_access_events_time_idx ON public.user_access_events (occurred_at DESC, id);
CREATE INDEX user_access_events_user_time_idx ON public.user_access_events (user_id, occurred_at DESC);
ALTER TABLE public.user_access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_access_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_access_events TO authenticated;
GRANT SELECT, INSERT ON public.user_access_events TO service_role;
CREATE POLICY user_access_events_admin_select ON public.user_access_events FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND public.is_platform_admin() AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active AND p.account_status = 'ACTIVE'
));

-- Auth tables remain private. This bounded read-only API checks the caller in the database.
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
) LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active AND p.account_status = 'ACTIVE'
  ) THEN RAISE EXCEPTION 'Esta sección está reservada al administrador de la plataforma.' USING ERRCODE = '42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RAISE EXCEPTION 'El intervalo de fechas no es válido.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH available AS (
    SELECT 'event:' || e.id::text AS event_id, e.user_id, e.login_identifier,
      p.full_name, e.occurred_at,
      CASE WHEN greatest(es.updated_at, es.refreshed_at::timestamptz) > es.created_at + interval '1 second'
        THEN greatest(es.updated_at, es.refreshed_at::timestamptz) ELSE NULL END AS renewed_at, 'LOGIN'::text AS event_kind,
      host(e.ip_address) AS ip_address, e.ip_source, e.user_agent
    FROM public.user_access_events e LEFT JOIN public.profiles p ON p.id = e.user_id LEFT JOIN auth.sessions es ON es.id = e.session_id
    UNION ALL
    SELECT 'session:' || s.id::text, s.user_id, COALESCE(p.login_identifier, 'Cuenta sin identificador'), p.full_name,
      s.created_at,
      CASE WHEN greatest(s.updated_at, s.refreshed_at::timestamptz) > s.created_at + interval '1 second'
        THEN greatest(s.updated_at, s.refreshed_at::timestamptz) ELSE NULL END,
      'SESSION'::text, host(s.ip),
      CASE WHEN COALESCE(s.user_agent, '') ILIKE '%SupabaseEdgeRuntime%' THEN 'auth_server' ELSE 'auth_session' END,
      s.user_agent
    FROM auth.sessions s LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE NOT EXISTS (SELECT 1 FROM public.user_access_events e WHERE e.session_id = s.id)
    UNION ALL
    SELECT 'account:' || u.id::text, u.id, COALESCE(p.login_identifier, 'Cuenta sin identificador'), p.full_name,
      u.last_sign_in_at, NULL::timestamptz, 'LAST_SIGN_IN'::text, NULL::text, 'unavailable'::text, NULL::text
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.last_sign_in_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = u.id AND abs(extract(epoch FROM s.created_at - u.last_sign_in_at)) < 5)
      AND NOT EXISTS (SELECT 1 FROM public.user_access_events e WHERE e.user_id = u.id AND abs(extract(epoch FROM e.occurred_at - u.last_sign_in_at)) < 5)
  )
  SELECT a.* FROM available a
  WHERE a.occurred_at >= p_from AND a.occurred_at < p_to AND (p_user_id IS NULL OR a.user_id = p_user_id)
  ORDER BY a.occurred_at DESC, a.event_id
  LIMIT least(greatest(COALESCE(p_limit, 100), 1), 200)
  OFFSET least(greatest(COALESCE(p_offset, 0), 0), 10000);
END;
$$;
REVOKE ALL ON FUNCTION public.list_user_access_log(timestamptz,timestamptz,uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_user_access_log(timestamptz,timestamptz,uuid,integer,integer) TO authenticated;
COMMENT ON TABLE public.user_access_events IS 'Successful sign-ins recorded by the authentication service; no passwords or access/refresh tokens.';
COMMENT ON FUNCTION public.list_user_access_log IS 'Platform-admin-only access history; renewals are not proof of human activity. IP headers can be affected by proxies.';
COMMIT;
