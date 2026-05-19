UPDATE vehicle_analyses va
SET
  netto_kaufpreis_chf    = ROUND(va.price_chf / 1.19),
  de_mwst_erstattung_chf = ROUND(va.price_chf - va.price_chf / 1.19),
  automobilsteuer_chf    = ROUND(va.price_chf / 1.19 * 0.04),
  zoll_chf               = 160,
  ch_mwst_chf            = ROUND((va.price_chf / 1.19 + 160) * 0.077),
  total_with_mwst_chf = ROUND(
    va.price_chf / 1.19
    + va.price_chf / 1.19 * 0.04
    + 160
    + (va.price_chf / 1.19 + 160) * 0.077
    + COALESCE(va.transport_chf, 0)
    + COALESCE(va.mfk_chf, 220)
    + COALESCE(va.preparation_chf, 100)
  ),
  margin_with_mwst_chf = va.market_value_chf - ROUND(
    va.price_chf / 1.19
    + va.price_chf / 1.19 * 0.04
    + 160
    + (va.price_chf / 1.19 + 160) * 0.077
    + COALESCE(va.transport_chf, 0)
    + COALESCE(va.mfk_chf, 220)
    + COALESCE(va.preparation_chf, 100)
  ),
  total_without_mwst_chf = ROUND(
    va.price_chf
    + va.price_chf * 0.04
    + 160
    + (va.price_chf + 160) * 0.077
    + COALESCE(va.transport_chf, 0)
    + COALESCE(va.mfk_chf, 220)
    + COALESCE(va.preparation_chf, 100)
  ),
  margin_without_mwst_chf = va.market_value_chf - ROUND(
    va.price_chf
    + va.price_chf * 0.04
    + 160
    + (va.price_chf + 160) * 0.077
    + COALESCE(va.transport_chf, 0)
    + COALESCE(va.mfk_chf, 220)
    + COALESCE(va.preparation_chf, 100)
  ),
  mwst_saving_chf = ROUND(
    (va.price_chf + va.price_chf * 0.04 + 160 + (va.price_chf + 160) * 0.077)
    -
    (va.price_chf / 1.19 + va.price_chf / 1.19 * 0.04 + 160 + (va.price_chf / 1.19 + 160) * 0.077)
  ),
  total_cost_chf = ROUND(
    va.price_chf
    + va.price_chf * 0.04
    + 160
    + (va.price_chf + 160) * 0.077
    + COALESCE(va.transport_chf, 0)
    + COALESCE(va.mfk_chf, 220)
    + COALESCE(va.preparation_chf, 100)
  ),
  vat_chf            = ROUND((va.price_chf + 160) * 0.077),
  customs_chf        = 160
WHERE va.price_chf IS NOT NULL
  AND va.price_chf > 0;