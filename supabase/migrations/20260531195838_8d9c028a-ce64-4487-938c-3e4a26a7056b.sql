-- notification_filters: enthält geheimes telegram_bot_token → komplett aus Public entfernen
DROP POLICY IF EXISTS "anyone read filters" ON public.notification_filters;
DROP POLICY IF EXISTS "anyone write filters" ON public.notification_filters;
REVOKE ALL ON public.notification_filters FROM anon, authenticated;
GRANT ALL ON public.notification_filters TO service_role;

-- user_sessions: IP + Geo nicht mehr öffentlich lesbar.
-- INSERT/UPDATE für anon bleibt für clientseitiges Tracking erlaubt.
DROP POLICY IF EXISTS "anyone read sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "anyone write sessions" ON public.user_sessions;

CREATE POLICY "anon insert sessions"
  ON public.user_sessions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon update sessions by session_id"
  ON public.user_sessions
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

REVOKE SELECT, DELETE ON public.user_sessions FROM anon, authenticated;
GRANT INSERT, UPDATE ON public.user_sessions TO anon, authenticated;
GRANT ALL ON public.user_sessions TO service_role;