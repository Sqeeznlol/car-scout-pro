
CREATE TABLE IF NOT EXISTS public.notification_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Meine Suche',
  is_active boolean NOT NULL DEFAULT true,
  makes text[] NOT NULL DEFAULT '{}',
  models text[] NOT NULL DEFAULT '{}',
  max_mileage integer,
  max_price_eur integer,
  min_margin_chf integer,
  min_deal_score integer,
  fuel_types text[] NOT NULL DEFAULT '{}',
  telegram_bot_token text NOT NULL DEFAULT '8591751475:AAG_TZ3hYdHymqELGo4EsTcQKC8s8CJNy7c',
  telegram_chat_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone read filters" ON public.notification_filters FOR SELECT USING (true);
CREATE POLICY "anyone write filters" ON public.notification_filters FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS telegram_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_sent_at timestamptz;
