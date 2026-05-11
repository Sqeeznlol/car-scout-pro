
-- Vehicles parsed from mobile.de emails
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'mobile.de',
  source_message_id TEXT UNIQUE,
  listing_url TEXT,
  title TEXT NOT NULL,
  make TEXT,
  model TEXT,
  variant TEXT,
  year INTEGER,
  mileage_km INTEGER,
  price_eur NUMERIC,
  fuel TEXT,
  transmission TEXT,
  power_kw INTEGER,
  location TEXT,
  seller_name TEXT,
  seller_type TEXT,
  image_url TEXT,
  raw_text TEXT,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vehicles_created_at_idx ON public.vehicles(created_at DESC);
CREATE INDEX vehicles_received_at_idx ON public.vehicles(received_at DESC);

-- Analysis per vehicle
CREATE TABLE public.vehicle_analyses (
  vehicle_id UUID PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  price_chf NUMERIC,
  transport_chf NUMERIC,
  customs_chf NUMERIC,
  vat_chf NUMERIC,
  automobilsteuer_chf NUMERIC,
  mfk_chf NUMERIC,
  preparation_chf NUMERIC,
  total_cost_chf NUMERIC,
  market_value_chf NUMERIC,
  expected_margin_chf NUMERIC,
  deal_score INTEGER,
  margin_score INTEGER,
  liquidity_score INTEGER,
  risk_score INTEGER,
  learning_score INTEGER,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Decisions
CREATE TYPE public.decision_type AS ENUM ('interesting','maybe','skip');

CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  decision public.decision_type NOT NULL,
  notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id)
);

-- App config (single row)
CREATE TABLE public.app_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  eur_chf_rate NUMERIC NOT NULL DEFAULT 0.96,
  chf_per_km NUMERIC NOT NULL DEFAULT 0.85,
  customs_flat NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 0.081,
  automobilsteuer_rate NUMERIC NOT NULL DEFAULT 0.04,
  mfk_flat NUMERIC NOT NULL DEFAULT 600,
  preparation_flat NUMERIC NOT NULL DEFAULT 1200,
  target_margin_chf NUMERIC NOT NULL DEFAULT 3500,
  co2_threshold_gkm NUMERIC NOT NULL DEFAULT 160,
  weight_margin INTEGER NOT NULL DEFAULT 35,
  weight_liquidity INTEGER NOT NULL DEFAULT 25,
  weight_risk INTEGER NOT NULL DEFAULT 25,
  weight_learning INTEGER NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO public.app_config (id) VALUES (1);

-- Gmail sync state
CREATE TABLE public.email_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_history_id TEXT,
  last_synced_at TIMESTAMPTZ,
  last_message_internal_date BIGINT DEFAULT 0,
  CHECK (id = 1)
);

INSERT INTO public.email_sync_state (id) VALUES (1);

-- RLS: open to anyone (single-dealer tool, auth comes next)
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

-- Permissive policies for now (will be tightened when auth is added)
CREATE POLICY "anyone read vehicles" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "anyone write vehicles" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anyone read analyses" ON public.vehicle_analyses FOR SELECT USING (true);
CREATE POLICY "anyone write analyses" ON public.vehicle_analyses FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anyone read decisions" ON public.decisions FOR SELECT USING (true);
CREATE POLICY "anyone write decisions" ON public.decisions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anyone read config" ON public.app_config FOR SELECT USING (true);
CREATE POLICY "anyone write config" ON public.app_config FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anyone read sync state" ON public.email_sync_state FOR SELECT USING (true);
CREATE POLICY "anyone write sync state" ON public.email_sync_state FOR ALL USING (true) WITH CHECK (true);
