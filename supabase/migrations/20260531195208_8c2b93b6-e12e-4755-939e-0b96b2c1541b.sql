ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS review_resolve_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_review_resolve_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS review_reason text;