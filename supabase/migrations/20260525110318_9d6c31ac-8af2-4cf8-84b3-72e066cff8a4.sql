ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS price_eur_netto NUMERIC;
CREATE INDEX IF NOT EXISTS idx_vehicles_country_code ON vehicles(country_code);