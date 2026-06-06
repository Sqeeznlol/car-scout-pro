-- Explicit deny-SELECT policies for sensitive tables to make restrictions unambiguous.
-- notification_filters contains telegram_bot_token (secret). user_sessions contains visitor PII.
-- Both already have RLS enabled with no SELECT policy (default deny), but explicit restrictive
-- policies guarantee no future permissive SELECT policy can accidentally expose data.

CREATE POLICY "deny anon select on notification_filters"
  ON public.notification_filters AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "deny anon select on user_sessions"
  ON public.user_sessions AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (false);

REVOKE SELECT ON public.notification_filters FROM anon, authenticated;
REVOKE SELECT ON public.user_sessions FROM anon, authenticated;