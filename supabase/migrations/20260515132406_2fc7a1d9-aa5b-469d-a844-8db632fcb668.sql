CREATE OR REPLACE VIEW public.admin_activity_log
WITH (security_invoker = true) AS
SELECT
  de.id,
  de.decided_at,
  de.decision,
  de.time_on_card_ms,
  de.tapped_autoscout,
  de.tapped_listing,
  de.vehicle_make,
  de.vehicle_model,
  de.vehicle_year,
  de.vehicle_mileage,
  de.vehicle_price_eur,
  de.vehicle_fuel_type,
  de.margin_chf,
  de.seller_type,
  v.listing_url,
  v.image_url,
  de.session_id,
  us.ip_address,
  us.city,
  us.country,
  us.device_type,
  us.browser,
  us.os,
  us.screen_width,
  us.screen_height
FROM public.decision_events de
LEFT JOIN public.vehicles v ON v.id = de.vehicle_id
LEFT JOIN public.user_sessions us ON us.session_id = de.session_id
ORDER BY de.decided_at DESC;

GRANT SELECT ON public.admin_activity_log TO anon, authenticated;