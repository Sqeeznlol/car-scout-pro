ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS registration_month integer,
  ADD COLUMN IF NOT EXISTS power_ps integer,
  ADD COLUMN IF NOT EXISTS consumption text,
  ADD COLUMN IF NOT EXISTS co2_gkm integer,
  ADD COLUMN IF NOT EXISTS emission_class text;

DELETE FROM public.vehicle_analyses;
DELETE FROM public.decisions;
DELETE FROM public.vehicles;
UPDATE public.email_sync_state SET last_message_internal_date = 0 WHERE id = 1;