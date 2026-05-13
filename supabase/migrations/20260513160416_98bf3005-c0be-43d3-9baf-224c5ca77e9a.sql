
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS seller_has_mwst boolean DEFAULT NULL;

ALTER TABLE public.vehicle_analyses
  ADD COLUMN IF NOT EXISTS seller_has_mwst boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS de_mwst_erstattung_chf numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS netto_kaufpreis_chf numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zoll_chf numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ch_mwst_chf numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_with_mwst_chf numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_with_mwst_chf numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_buy_with_mwst_eur numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_without_mwst_chf numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_without_mwst_chf numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_buy_without_mwst_eur numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mwst_saving_chf numeric DEFAULT 0;

-- Korrekte Default-Werte gemäss Schweizer Recht
UPDATE public.app_config
SET vat_rate = 0.077,
    customs_flat = 160,
    co2_threshold_gkm = 130,
    chf_per_km = 1.5,
    mfk_flat = 220,
    preparation_flat = 100
WHERE id = 1;
