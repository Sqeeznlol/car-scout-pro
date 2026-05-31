CREATE UNIQUE INDEX IF NOT EXISTS vehicles_mobile_de_listing_id_unique
  ON public.vehicles (mobile_de_listing_id)
  WHERE mobile_de_listing_id IS NOT NULL;