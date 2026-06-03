import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeDistanceToKloten } from "@/lib/distance.server";
import { computeAnalysis, recomputeWithMarket, type ConfigInput } from "@/lib/analysis";
import { getLiveEurChfRate } from "@/lib/fx.server";

const Schema = z.object({
  vehicle_id: z.string().uuid(),
  price_eur: z.number().nullable().optional(),
  price_eur_netto: z.number().nullable().optional(),
  seller_has_mwst: z.boolean().nullable().optional(),
  country_code: z.string().min(2).max(2).nullable().optional(),
  location: z.string().nullable().optional(),
  seller_address: z.string().nullable().optional(),
});

export const updateVehicleManual = createServerFn({ method: "POST" })
  .inputValidator((d) => Schema.parse(d))
  .handler(async ({ data }) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["price_eur", "price_eur_netto", "seller_has_mwst", "country_code", "location", "seller_address"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }

    // Recompute distance if address/location changed
    let dist: { latitude: number; longitude: number; distance_km: number; distance_minutes: number } | null = null;
    if (data.seller_address !== undefined || data.location !== undefined) {
      const { data: vrow } = await supabaseAdmin
        .from("vehicles")
        .select("seller_address, location")
        .eq("id", data.vehicle_id)
        .single();
      const addr = data.seller_address ?? vrow?.seller_address ?? null;
      const loc = data.location ?? vrow?.location ?? null;
      dist = await computeDistanceToKloten(addr, loc);
      if (dist) {
        patch.latitude = dist.latitude;
        patch.longitude = dist.longitude;
        patch.distance_km = dist.distance_km;
        patch.distance_minutes = dist.distance_minutes;
        patch.distance_computed_at = new Date().toISOString();
      }
    }

    // If country changed to non-DE → archive; if back to DE → un-archive
    if (data.country_code !== undefined) {
      if (data.country_code && data.country_code !== "DE") {
        patch.skip_reason = `country_${data.country_code}`;
      } else {
        patch.skip_reason = null;
      }
    }

    const { error: upErr } = await supabaseAdmin.from("vehicles").update(patch as never).eq("id", data.vehicle_id);

    if (upErr) throw new Error(upErr.message);

    // Recompute analysis
    const { data: v } = await supabaseAdmin.from("vehicles").select("*").eq("id", data.vehicle_id).single();
    if (!v || !v.price_eur) return { ok: true, recomputed: false };

    const { data: cfg } = await supabaseAdmin.from("app_config").select("*").eq("id", 1).single();
    const liveRate = await getLiveEurChfRate();
    const config: ConfigInput = {
      eur_chf_rate: liveRate,
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
    let analysis = computeAnalysis(
      {
        price_eur: Number(v.price_eur),
        explicit_netto_eur: v.price_eur_netto != null ? Number(v.price_eur_netto) : null,
        mileage_km: v.mileage_km,
        year: v.year,
        location: v.location,
        fuel: v.fuel,
        seller_type: v.seller_type,
        distance_km: v.distance_km,
      },
      config,
    );

    const { data: prevA } = await supabaseAdmin
      .from("vehicle_analyses")
      .select("autoscout_ch_price_avg, autoscout_ch_url, autoscout_ch_comparable_count, autoscout_ch_price_min, autoscout_ch_price_max, autoscout_ch_scraped_at")
      .eq("vehicle_id", data.vehicle_id)
      .maybeSingle();
    if (prevA?.autoscout_ch_price_avg && Number(prevA.autoscout_ch_price_avg) > 0) {
      analysis = recomputeWithMarket(
        {
          price_eur: Number(v.price_eur),
          explicit_netto_eur: v.price_eur_netto != null ? Number(v.price_eur_netto) : null,
          mileage_km: v.mileage_km,
          year: v.year,
          location: v.location,
          fuel: v.fuel,
          seller_type: v.seller_type,
          distance_km: v.distance_km,
        },
        config,
        analysis,
        Number(prevA.autoscout_ch_price_avg),
      );
    }
    await supabaseAdmin.from("vehicle_analyses").upsert({
      vehicle_id: data.vehicle_id,
      ...analysis,
      autoscout_ch_url: prevA?.autoscout_ch_url ?? null,
      autoscout_ch_comparable_count: prevA?.autoscout_ch_comparable_count ?? null,
      autoscout_ch_price_min: prevA?.autoscout_ch_price_min ?? null,
      autoscout_ch_price_max: prevA?.autoscout_ch_price_max ?? null,
      autoscout_ch_price_avg: prevA?.autoscout_ch_price_avg ?? null,
      autoscout_ch_scraped_at: prevA?.autoscout_ch_scraped_at ?? null,
      computed_at: new Date().toISOString(),
    });

    return { ok: true, recomputed: true, distance_km: dist?.distance_km ?? v.distance_km };
  });
