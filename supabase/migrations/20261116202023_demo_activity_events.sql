BEGIN;
CREATE TABLE public.demo_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_event_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN ('PAGE_OPEN','PAGE_REFRESH','MODULE_OPEN','APP_RESUME','PDF_REQUEST','WRITE_BLOCKED')),
  route text NOT NULL CHECK (length(route) <= 180 AND route ~ '^/[a-zA-Z0-9/_-]*$'),
  ip_address inet,
  user_agent text CHECK (length(user_agent) <= 512),
  UNIQUE (user_id, client_event_id)
);
CREATE INDEX demo_activity_events_time_idx ON public.demo_activity_events (occurred_at DESC,id);
CREATE INDEX demo_activity_events_user_time_idx ON public.demo_activity_events (user_id,occurred_at DESC);
ALTER TABLE public.demo_activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_activity_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.demo_activity_events TO authenticated;
GRANT SELECT, INSERT ON public.demo_activity_events TO service_role;
CREATE POLICY demo_activity_admin_read ON public.demo_activity_events FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND public.is_platform_admin() AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active AND p.account_status='ACTIVE'
));
COMMENT ON TABLE public.demo_activity_events IS 'Service-recorded browser signals for the read-only PRUEBA account. No business writes or form contents. Signals do not establish personal identity or prove human activity.';
COMMIT;
