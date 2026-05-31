-- Add tracking columns for extension queue rotation
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS extension_attempts        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extension_scraped_at      timestamptz,
  ADD COLUMN IF NOT EXISTS extension_archived        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_extension_attempt_at timestamptz;

-- Backfill: existing synced rows are considered scraped
UPDATE public.vehicles
SET extension_scraped_at = extension_synced_at
WHERE extension_scraped_at IS NULL AND extension_synced_at IS NOT NULL;

-- Backfill: archived = already has a skip_reason
UPDATE public.vehicles
SET extension_archived = true
WHERE skip_reason IS NOT NULL AND extension_archived = false;

-- Atomic increment RPC
DROP FUNCTION IF EXISTS public.increment_extension_attempts(uuid[]);
CREATE OR REPLACE FUNCTION public.increment_extension_attempts(vehicle_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.vehicles
  SET extension_attempts = COALESCE(extension_attempts, 0) + 1,
      last_extension_attempt_at = now()
  WHERE id = ANY(vehicle_ids);
$$;
GRANT EXECUTE ON FUNCTION public.increment_extension_attempts(uuid[]) TO anon, authenticated, service_role;

-- Index for queue rotation
CREATE INDEX IF NOT EXISTS idx_vehicles_extension_queue_rotation
  ON public.vehicles (last_extension_attempt_at ASC NULLS FIRST, extension_attempts ASC, created_at DESC)
  WHERE extension_scraped_at IS NULL
    AND extension_archived = false
    AND skip_reason IS NULL
    AND listing_url IS NOT NULL;

-- Backfill: previously-archived "no_netto_price" → back into review
UPDATE public.vehicles
SET extension_archived = false,
    pending_review     = true,
    skip_reason        = NULL,
    seller_has_mwst    = false
WHERE skip_reason = 'no_netto_price'
  AND confirmed_no_netto = false;