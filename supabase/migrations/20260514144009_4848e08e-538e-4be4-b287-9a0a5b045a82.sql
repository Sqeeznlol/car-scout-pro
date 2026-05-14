
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  ip_address text,
  country text,
  city text,
  region text,
  latitude numeric,
  longitude numeric,
  device_type text,
  browser text,
  os text,
  screen_width integer,
  screen_height integer,
  user_agent text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  total_decisions integer NOT NULL DEFAULT 0,
  total_interesting integer NOT NULL DEFAULT 0
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read sessions" ON public.user_sessions FOR SELECT USING (true);
CREATE POLICY "anyone write sessions" ON public.user_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.decision_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  decision text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  time_on_card_ms integer,
  scrolled_to_market boolean DEFAULT false,
  scrolled_to_autoscout boolean DEFAULT false,
  tapped_autoscout boolean DEFAULT false,
  tapped_listing boolean DEFAULT false,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  vehicle_mileage integer,
  vehicle_price_eur numeric,
  vehicle_fuel_type text,
  margin_chf numeric,
  market_price_ch numeric,
  distance_km numeric,
  price_vs_market_percent numeric,
  seller_type text
);

ALTER TABLE public.decision_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read decision events" ON public.decision_events FOR SELECT USING (true);
CREATE POLICY "anyone write decision events" ON public.decision_events FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.algorithm_insights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  total_decisions integer,
  total_interesting integer,
  conversion_rate numeric,
  preferred_makes jsonb,
  preferred_fuel_types jsonb,
  preferred_year_min integer,
  preferred_year_max integer,
  preferred_mileage_max integer,
  preferred_price_min_eur numeric,
  preferred_price_max_eur numeric,
  preferred_margin_min_chf numeric,
  margin_correlation numeric,
  market_price_correlation numeric,
  mileage_correlation numeric,
  avg_time_on_interesting_ms integer,
  avg_time_on_skip_ms integer,
  autoscout_check_rate numeric,
  raw_insights jsonb
);

ALTER TABLE public.algorithm_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read insights" ON public.algorithm_insights FOR SELECT USING (true);
CREATE POLICY "anyone write insights" ON public.algorithm_insights FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.increment_session_decisions(p_session_id text, p_interesting integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_sessions
  SET total_decisions = total_decisions + 1,
      total_interesting = total_interesting + COALESCE(p_interesting, 0),
      last_seen = now()
  WHERE session_id = p_session_id;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON public.user_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON public.user_sessions (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_decision_events_session ON public.decision_events (session_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_events_decided ON public.decision_events (decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_vehicle ON public.decisions (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_analyses_margin ON public.vehicle_analyses (expected_margin_chf DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_vehicles_received ON public.vehicles (received_at DESC NULLS LAST);
