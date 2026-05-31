import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeAnalysis, type ConfigInput } from "@/lib/analysis";
import { z } from "zod";

const ApplyNettoInput = z.object({
  vehicle_id: z.string().uuid(),
  price_eur_netto: z.number().int().positive(),
});

export const applyManualNetto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ApplyNettoInput.parse(d))
  .handler(async ({ data }) => {
    const { data: vehicle, error: vErr } = await supabaseAdmin
      .from("vehicles")
      .update({
        price_eur_netto: data.price_eur_netto,
        seller_has_mwst: true,
        netto_manually_set: true,
        pending_review: false,
        extension_archived: false,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.vehicle_id)
      .select("id, price_eur, mileage_km, year, location, fuel, seller_type, distance_km")
      .single();

    if (vErr || !vehicle) throw new Error(vErr?.message ?? "vehicle not found");

    const { data: cfg } = await supabaseAdmin.from("app_config").select("*").eq("id", 1).single();
    const config: ConfigInput = {
      eur_chf_rate: Number(cfg?.eur_chf_rate) || 0.96,
      chf_per_km: Number(cfg?.chf_per_km) || 1.5,
      customs_flat: Number(cfg?.customs_flat) || 160,
      vat_rate: Number(cfg?.vat_rate) || 0.081,
      automobilsteuer_rate: Number(cfg?.automobilsteuer_rate) || 0.04,
      mfk_flat: Number(cfg?.mfk_flat) || 220,
      preparation_flat: Number(cfg?.preparation_flat) || 100,
      target_margin_chf: Number(cfg?.target_margin_chf) || 3500,
      weight_margin: cfg?.weight_margin ?? 35,
      weight_liquidity: cfg?.weight_liquidity ?? 25,
      weight_risk: cfg?.weight_risk ?? 25,
      weight_learning: cfg?.weight_learning ?? 15,
    };

    const analysis = computeAnalysis(
      {
        price_eur: Number(vehicle.price_eur),
        mileage_km: vehicle.mileage_km,
        year: vehicle.year,
        location: vehicle.location,
        fuel: vehicle.fuel,
        seller_type: vehicle.seller_type,
        distance_km: vehicle.distance_km,
      },
      config,
    );

    await supabaseAdmin.from("vehicle_analyses").upsert(
      { vehicle_id: vehicle.id, ...analysis, seller_has_mwst: true, computed_at: new Date().toISOString() },
      { onConflict: "vehicle_id" },
    );

    return { ok: true };
  });

const ConfirmNoNettoInput = z.object({ vehicle_id: z.string().uuid() });

export const confirmNoNetto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConfirmNoNettoInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("vehicles")
      .update({
        confirmed_no_netto: true,
        pending_review: false,
        extension_archived: true,
        skip_reason: "no_netto_price",
        reviewed_at: new Date().toISOString(),
        seller_has_mwst: false,
      })
      .eq("id", data.vehicle_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Reset extension queue — unblock vehicles that failed to scrape 3+ times
export const resetExtensionQueue = createServerFn({ method: "POST" }).handler(async () => {
  const { error, count } = await supabaseAdmin
    .from("vehicles")
    .update({ extension_attempts: 0, last_extension_attempt_at: null }, { count: "exact" })
    .gte("extension_attempts", 3)
    .is("extension_scraped_at", null);
  if (error) throw new Error(error.message);
  return { ok: true, reset: count ?? 0 };
});
