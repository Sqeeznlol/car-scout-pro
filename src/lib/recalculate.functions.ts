import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeAnalysis, type ConfigInput } from "@/lib/analysis";

export const recalculateAllVehicles = createServerFn({ method: "POST" }).handler(
  async () => {
    const { data: cfg, error: cfgErr } = await supabaseAdmin
      .from("app_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (cfgErr) throw new Error(cfgErr.message);

    const config: ConfigInput = {
      eur_chf_rate: Number(cfg.eur_chf_rate) || 0.96,
      chf_per_km: Number(cfg.chf_per_km) || 1.5,
      customs_flat: Number(cfg.customs_flat) || 160,
      vat_rate: Number(cfg.vat_rate) || 0.077,
      automobilsteuer_rate: Number(cfg.automobilsteuer_rate) || 0.04,
      mfk_flat: Number(cfg.mfk_flat) || 220,
      preparation_flat: Number(cfg.preparation_flat) || 100,
      target_margin_chf: Number(cfg.target_margin_chf) || 3500,
      weight_margin: cfg.weight_margin ?? 35,
      weight_liquidity: cfg.weight_liquidity ?? 25,
      weight_risk: cfg.weight_risk ?? 25,
      weight_learning: cfg.weight_learning ?? 15,
    };

    const { data: vehicles, error: vErr } = await supabaseAdmin
      .from("vehicles")
      .select("id, price_eur, mileage_km, year, location, fuel, seller_type, distance_km")
      .is("skip_reason", null)
      .not("price_eur", "is", null);

    if (vErr) throw new Error(vErr.message);
    if (!vehicles?.length) return { ok: true, updated: 0, total: 0, errors: [] as string[] };

    let updated = 0;
    const errors: string[] = [];

    for (const v of vehicles) {
      try {
        const analysis = computeAnalysis(
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

        const { error: uErr } = await supabaseAdmin
          .from("vehicle_analyses")
          .upsert(
            { vehicle_id: v.id, ...analysis, computed_at: new Date().toISOString() },
            { onConflict: "vehicle_id" },
          );

        if (uErr) errors.push(`${v.id}: ${uErr.message}`);
        else updated++;
      } catch (e) {
        errors.push(`${v.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { ok: true, updated, total: vehicles.length, errors };
  },
);
