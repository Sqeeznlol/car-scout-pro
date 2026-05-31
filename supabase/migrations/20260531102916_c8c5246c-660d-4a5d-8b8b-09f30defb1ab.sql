ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS netto_manually_set boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_no_netto boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vehicles_pending_review
  ON public.vehicles (pending_review, created_at DESC)
  WHERE pending_review = true;

-- Backfill: previously archived "no_netto_price" → back to pending_review
UPDATE public.vehicles
SET pending_review = true,
    skip_reason    = NULL
WHERE skip_reason = 'no_netto_price'
  AND confirmed_no_netto = false;