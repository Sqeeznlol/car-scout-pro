-- Sofort-Auflösung der pending_review-Queue:
-- Für DE-Inserate mit Brutto-Preis und ohne §25a-Verdacht wird der Netto-Betrag
-- aus dem Brutto abgeleitet (DE-MwSt 19%). Diese Inserate sind dann in der Swipe-Queue
-- sichtbar. Bekannte §25a-Fälle (review_reason='differenzbesteuerung_25a') bleiben aus.

WITH derived AS (
  SELECT
    id,
    ROUND(price_eur / 1.19) AS netto
  FROM public.vehicles
  WHERE pending_review = true
    AND confirmed_no_netto = false
    AND skip_reason IS NULL
    AND extension_archived = false
    AND price_eur IS NOT NULL
    AND price_eur > 0
    AND (country_code IS NULL OR country_code = 'DE')
    AND COALESCE(review_reason, '') <> 'differenzbesteuerung_25a'
)
UPDATE public.vehicles v
SET price_eur_netto = d.netto,
    seller_has_mwst = true,
    pending_review = false,
    review_reason = COALESCE(v.review_reason, '') || CASE WHEN COALESCE(v.review_reason,'')='' THEN '' ELSE '; ' END || 'auto_derived_netto_19pct',
    reviewed_at = now()
FROM derived d
WHERE v.id = d.id;

-- Für vorhandene Analysen den Netto-Pfad nachziehen (vereinfacht):
-- Wenn vehicle_analyses Zeile existiert, seller_has_mwst-Flag setzen, damit fetchVehicles
-- die Karte korrekt rendert. Vollwert-Recompute passiert über Recalculate-Knopf im Admin.
UPDATE public.vehicle_analyses va
SET seller_has_mwst = true
FROM public.vehicles v
WHERE va.vehicle_id = v.id
  AND v.seller_has_mwst = true
  AND v.pending_review = false
  AND COALESCE(va.seller_has_mwst, false) = false;