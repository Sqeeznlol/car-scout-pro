ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS skip_reason text;
ALTER TABLE public.vehicle_analyses ADD COLUMN IF NOT EXISTS autoscout_ch_url text;
ALTER TABLE public.vehicle_analyses ADD COLUMN IF NOT EXISTS autoscout_ch_comparable_count integer;
ALTER TABLE public.vehicle_analyses ADD COLUMN IF NOT EXISTS autoscout_ch_price_min numeric;
ALTER TABLE public.vehicle_analyses ADD COLUMN IF NOT EXISTS autoscout_ch_price_max numeric;
ALTER TABLE public.vehicle_analyses ADD COLUMN IF NOT EXISTS autoscout_ch_price_avg numeric;
ALTER TABLE public.vehicle_analyses ADD COLUMN IF NOT EXISTS autoscout_ch_scraped_at timestamptz;