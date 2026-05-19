import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { estimateChMarketValue } from "@/lib/ch-market.server";
import { computeAnalysis, recomputeWithMarket, type ConfigInput } from "@/lib/analysis";

export const refreshAutoScoutAll = createServerFn({ method: "POST" }).handler(async () => {
  const { data: cfg } = await supabaseAdmin
    .from("app_config").select("*").eq("id", 1).single();

  const config: ConfigInput = {
    eur_chf_rate:         Number(cfg?.eur_chf_rate)         || 0.96,
    chf_per_km:           Number(cfg?.chf_per_km)           || 1.50,
    customs_flat:         Number(cfg?.customs_flat)         || 160,
    vat_rate:             Number(cfg?.vat_rate)             || 0.077,
    automobilsteuer_rate: Number(cfg?.automobilsteuer_rate) || 0.04,
    mfk_flat:             Number(cfg?.mfk_flat)             || 220,
    preparation_flat:     Number(cfg?.preparation_flat)     || 100,
    target_margin_chf:    Number(cfg?.target_margin_chf)    || 3500,
    weight_margin:        cfg?.weight_margin                ?? 35,
    weight_liquidity:     cfg?.weight_liquidity             ?? 25,
    weight_risk:          cfg?.weight_risk                  ?? 25,
    weight_learning:      cfg?.weight_learning              ?? 15,
  };

  const { data: vehicles, error } = await supabaseAdmin
    .from("vehicles")
    .select(`
      id, make, model, year, mileage_km, price_eur,
      fuel, seller_type, location, distance_km,
      analysis:vehicle_analyses(autoscout_ch_scraped_at, autoscout_ch_price_avg)
    `)
    .is("skip_reason", null)
    .not("price_eur", "is", null)
    .not("make", "is", null);

  if (error) throw new Error(error.message);
  if (!vehicles?.length) return { ok: true, updated: 0, skipped: 0, total: 0, errors: [] as string[] };

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const v of vehicles) {
    try {
      const a = Array.isArray(v.analysis) ? v.analysis[0] : (v.analysis as { autoscout_ch_scraped_at?: string | null; autoscout_ch_price_avg?: number | null } | null);
      const scraped = a?.autoscout_ch_scraped_at;
      const avg = a?.autoscout_ch_price_avg ?? 0;
      if (scraped && avg > 0) {
        const age = Date.now() - new Date(scraped).getTime();
        if (age < 7 * 24 * 60 * 60 * 1000) { skipped++; continue; }
      }

      const ch = await estimateChMarketValue({
        make: v.make, model: v.model, year: v.year, mileage_km: v.mileage_km, fuel: v.fuel,
      });

      if (!ch) {
        errors.push(`${v.make} ${v.model}: no result`);
        continue;
      }

      let freshAnalysis = computeAnalysis(
        {
          price_eur: Number(v.price_eur),
          mileage_km: v.mileage_km,
          year: v.year,
          location: v.location,
          fuel: v.fuel,
          seller_type: v.seller_type,
          distance_km: v.distance_km,
        },
        config,
      );

      if (ch.avg > 0) {
        freshAnalysis = recomputeWithMarket(
          {
            price_eur: Number(v.price_eur),
            mileage_km: v.mileage_km,
            year: v.year,
            location: v.location,
            fuel: v.fuel,
            seller_type: v.seller_type,
            distance_km: v.distance_km,
          },
          config,
          freshAnalysis,
          ch.avg,
        );
      }

      const { error: uErr } = await supabaseAdmin
        .from("vehicle_analyses")
        .upsert({
          vehicle_id: v.id,
          ...freshAnalysis,
          autoscout_ch_url: ch.url,
          autoscout_ch_comparable_count: ch.count,
          autoscout_ch_price_avg: ch.avg > 0 ? ch.avg : null,
          autoscout_ch_price_min: ch.min || null,
          autoscout_ch_price_max: ch.max || null,
          autoscout_ch_scraped_at: new Date().toISOString(),
          computed_at: new Date().toISOString(),
        }, { onConflict: "vehicle_id" });

      if (uErr) errors.push(`${v.make} ${v.model}: ${uErr.message}`);
      else updated++;

      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      errors.push(`${v.make} ${v.model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: true, updated, skipped, total: vehicles.length, errors: errors.slice(0, 20) };
});
