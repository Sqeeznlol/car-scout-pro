ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS seller_phone TEXT,
  ADD COLUMN IF NOT EXISTS seller_address TEXT,
  ADD COLUMN IF NOT EXISTS seller_website TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS distance_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS distance_computed_at TIMESTAMPTZ;

UPDATE public.email_sync_state SET last_message_internal_date = 0, last_history_id = NULL WHERE id = 1;
DELETE FROM public.vehicle_analyses;
DELETE FROM public.decisions;
DELETE FROM public.vehicles;