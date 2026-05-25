
-- 1) Drop the hardcoded Telegram bot token default
ALTER TABLE public.notification_filters
  ALTER COLUMN telegram_bot_token DROP DEFAULT;

-- 2) Lock email_sync_state (server-only via service role)
DROP POLICY IF EXISTS "anyone read sync state" ON public.email_sync_state;
DROP POLICY IF EXISTS "anyone write sync state" ON public.email_sync_state;

-- 3) algorithm_insights: keep public read, restrict writes to service role only
DROP POLICY IF EXISTS "anyone write insights" ON public.algorithm_insights;

-- 4) vehicle_analyses: keep public read, restrict writes to service role only
DROP POLICY IF EXISTS "anyone write analyses" ON public.vehicle_analyses;
