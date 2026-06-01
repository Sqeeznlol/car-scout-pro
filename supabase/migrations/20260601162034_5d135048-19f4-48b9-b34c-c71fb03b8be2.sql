CREATE TABLE IF NOT EXISTS public.exchange_rates (
  currency_code text NOT NULL,
  rate_chf      numeric NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  valid_date    date NOT NULL,
  source        text NOT NULL DEFAULT 'BAZG',
  PRIMARY KEY (currency_code, valid_date)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_latest
  ON public.exchange_rates (currency_code, valid_date DESC);

GRANT SELECT ON public.exchange_rates TO anon, authenticated;
GRANT ALL ON public.exchange_rates TO service_role;

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone read rates" ON public.exchange_rates FOR SELECT USING (true);
CREATE POLICY "service writes rates" ON public.exchange_rates FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.exchange_rates (currency_code, rate_chf, valid_date, source)
VALUES ('EUR', 0.96, CURRENT_DATE, 'fallback')
ON CONFLICT DO NOTHING;