-- Atomarer Claim für die Extension-Queue.
-- Garantiert, dass mehrere Worker (mehrere PCs/Laptops) nie dasselbe Inserat bekommen.
-- Nutzt FOR UPDATE SKIP LOCKED + Lease über last_extension_attempt_at.
CREATE OR REPLACE FUNCTION public.claim_extension_queue(
  limit_count integer DEFAULT 5,
  lease_minutes integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  listing_url text,
  source_message_id text,
  extension_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.claim_extension_queue(integer, integer) TO anon, authenticated, service_role;