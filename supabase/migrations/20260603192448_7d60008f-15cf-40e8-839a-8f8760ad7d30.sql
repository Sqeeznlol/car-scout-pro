
-- 1) Stale "seller_has_mwst=true" ohne echten Netto-Betrag zurücksetzen
UPDATE public.vehicles
SET seller_has_mwst = NULL
WHERE listing_url ILIKE '%mobile.de%'
  AND seller_has_mwst IS TRUE
  AND price_eur_netto IS NULL;

-- 2) Alle mobile.de-Inserate, die gescraped wurden aber keinen Netto haben,
--    für einen erneuten Scrape-Versuch zurücksetzen (max. 3 Versuche bleiben aktiv).
UPDATE public.vehicles
SET extension_scraped_at = NULL,
    extension_attempts = 0,
    last_extension_attempt_at = NULL,
    extension_archived = false,
    skip_reason = NULL,
    pending_review = false,
    review_reason = NULL,
    confirmed_no_netto = false
WHERE listing_url ILIKE '%mobile.de%'
  AND price_eur_netto IS NULL
  AND (
    skip_reason IS NULL
    OR skip_reason IN ('no_explicit_netto_price', 'no_netto_price', 'mwst_without_explicit_netto')
  )
  AND COALESCE(country_code, 'DE') = 'DE';
