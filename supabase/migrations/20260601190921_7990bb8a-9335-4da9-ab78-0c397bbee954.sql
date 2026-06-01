CREATE OR REPLACE FUNCTION public.claim_extension_queue(limit_count integer DEFAULT 5, lease_minutes integer DEFAULT 10)
RETURNS TABLE(id uuid, listing_url text, source_message_id text, extension_attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT v.id
    FROM public.vehicles v
    WHERE v.extension_scraped_at IS NULL
      AND v.skip_reason IS NULL
      AND v.extension_archived = false
      AND v.listing_url IS NOT NULL
      AND v.listing_url ILIKE '%mobile.de%'
      AND COALESCE(v.extension_attempts, 0) < 3
      AND (
        v.last_extension_attempt_at IS NULL
        OR v.last_extension_attempt_at < now() - (lease_minutes || ' minutes')::interval
      )
    ORDER BY
      v.price_eur DESC NULLS LAST,
      CASE lower(trim(COALESCE(v.make, '')))
        WHEN 'ferrari'      THEN 1
        WHEN 'lamborghini'  THEN 1
        WHEN 'rolls-royce'  THEN 1
        WHEN 'rolls royce'  THEN 1
        WHEN 'bentley'      THEN 1
        WHEN 'mclaren'      THEN 1
        WHEN 'aston martin' THEN 1
        WHEN 'maserati'     THEN 1
        WHEN 'bugatti'      THEN 1
        WHEN 'porsche'        THEN 2
        WHEN 'mercedes-benz'  THEN 2
        WHEN 'mercedes'       THEN 2
        WHEN 'bmw'            THEN 2
        WHEN 'audi'           THEN 2
        WHEN 'land rover'     THEN 2
        WHEN 'jaguar'         THEN 2
        WHEN 'volvo'   THEN 3
        WHEN 'volkswagen' THEN 4
        WHEN 'skoda'      THEN 4
        WHEN 'seat'       THEN 4
        ELSE 5
      END ASC,
      v.last_extension_attempt_at ASC NULLS FIRST,
      COALESCE(v.extension_attempts, 0) ASC,
      v.created_at DESC
    LIMIT limit_count
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.vehicles v
  SET extension_attempts = COALESCE(v.extension_attempts, 0) + 1,
      last_extension_attempt_at = now()
  FROM picked p
  WHERE v.id = p.id
  RETURNING v.id, v.listing_url, v.source_message_id, v.extension_attempts;
END;
$function$;

UPDATE public.vehicles
SET extension_scraped_at = NULL,
    extension_attempts = 0,
    last_extension_attempt_at = NULL,
    pending_review = false,
    review_reason = NULL
WHERE price_eur >= 100000
  AND listing_url IS NOT NULL
  AND listing_url ILIKE '%mobile.de%'
  AND skip_reason IS NULL
  AND extension_archived = false;