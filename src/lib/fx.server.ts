// EUR→CHF rate from BAZG (Swiss customs authority) via Supabase-cached daily rate.
// All existing call sites use this helper; it now returns the official BAZG rate.
import { getEurChfRate } from "@/lib/exchange-rates.server";

export async function getLiveEurChfRate(): Promise<number> {
  const r = await getEurChfRate();
  return r.rate;
}
