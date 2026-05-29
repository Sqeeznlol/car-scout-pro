CREATE TABLE IF NOT EXISTS public.sync_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL DEFAULT 'extension',
  url text,
  mobile_de_id text,
  error_message text NOT NULL,
  context jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_errors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_errors TO authenticated;
GRANT ALL ON public.sync_errors TO service_role;

ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone read sync errors" ON public.sync_errors FOR SELECT USING (true);
CREATE POLICY "anyone write sync errors" ON public.sync_errors FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sync_errors_created ON public.sync_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_errors_resolved ON public.sync_errors (resolved, created_at DESC);