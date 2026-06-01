import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchListingDetails } from "@/lib/mwst-detector.server";
import { computeAnalysis, recomputeWithMarket, type ConfigInput } from "@/lib/analysis";
import { getLiveEurChfRate } from "@/lib/fx.server";
import { estimateChMarketValue } from "@/lib/ch-market.server";

const BATCH = 15;
const DELAY_MS = 3500;

async function loadConfig(): Promise<ConfigInput> {
  const { data: cfg } = await supabaseAdmin.from("app_config").select("*").eq("id", 1).single();
  const liveRate = await getLiveEurChfRate().catch(() => Number(cfg?.eur_chf_rate) || 0.96);
  return {
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
}

async function recomputeAnalysisForVehicle(vehicleId: string, config: ConfigInput) {
  const { data: v, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, price_eur, mileage_km, year, location, fuel, seller_type, distance_km, make, model")
    .eq("id", vehicleId)
    .single();
  if (error || !v) return;

  const input = {
    price_eur: Number(v.price_eur ?? 0),
    mileage_km: v.mileage_km,
    year: v.year,
    location: v.location,
    fuel: v.fuel,
    seller_type: v.seller_type,
    distance_km: v.distance_km,
  };

  let analysis = computeAnalysis(input, config);
  let asExtra: Record<string, unknown> = {};
  try {
    const ch = await estimateChMarketValue({
      make: v.make,
      model: v.model,
      year: v.year,
      mileage_km: v.mileage_km,
      fuel: v.fuel,
    });
    if (ch) {
      asExtra = {
        autoscout_ch_url: ch.url,
        autoscout_ch_comparable_count: ch.count,
        autoscout_ch_price_min: ch.min || null,
        autoscout_ch_price_max: ch.max || null,
        autoscout_ch_price_avg: ch.avg || null,
        autoscout_ch_scraped_at: new Date().toISOString(),
      };
      if (ch.avg > 0) {
        analysis = recomputeWithMarket(input, config, analysis, ch.avg);
      }
    }
  } catch {
    /* optional */
  }

  await supabaseAdmin.from("vehicle_analyses").upsert(
    {
      vehicle_id: vehicleId,
      ...analysis,
      ...asExtra,
      seller_has_mwst: true,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "vehicle_id" },
  );
}

interface ResolveSummary {
  checked: number;
  resolved_netto: number;
  kept_mwst_only: number;
  archived_25a: number;
  archived_non_de: number;
  unresolved: number;
  remaining: number;
  errors: string[];
}

async function runResolve(): Promise<ResolveSummary> {
  const { data: rows, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, listing_url, price_eur, country_code, review_resolve_attempts")
    .eq("pending_review", true)
    .eq("confirmed_no_netto", false)
    .is("skip_reason", null)
    .not("listing_url", "is", null)
    .order("review_resolve_attempts", { ascending: true, nullsFirst: true })
    .order("last_review_resolve_at", { ascending: true, nullsFirst: true })
    .order("price_eur", { ascending: false, nullsFirst: false })
    .limit(BATCH);

  if (error) throw new Error(error.message);

  const summary: ResolveSummary = {
    checked: 0,
    resolved_netto: 0,
    kept_mwst_only: 0,
    archived_25a: 0,
    archived_non_de: 0,
    unresolved: 0,
    remaining: 0,
    errors: [],
  };

  if (!rows || rows.length === 0) {
    const { count } = await supabaseAdmin
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("pending_review", true)
      .eq("confirmed_no_netto", false)
      .is("skip_reason", null);
    summary.remaining = count ?? 0;
    return summary;
  }

  const config = await loadConfig();
  const nowIso = () => new Date().toISOString();

  for (const v of rows) {
    summary.checked++;
    if (!v.listing_url) continue;
    try {
      const det = await fetchListingDetails(v.listing_url);

      // Non-DE → archive
      if (det.country_code && det.country_code !== "DE") {
        await supabaseAdmin
          .from("vehicles")
          .update({
            country_code: det.country_code,
            extension_archived: true,
            pending_review: false,
            skip_reason: `country_${det.country_code}`,
            reviewed_at: nowIso(),
            last_review_resolve_at: nowIso(),
            review_resolve_attempts: (v.review_resolve_attempts ?? 0) + 1,
          })
          .eq("id", v.id);
        summary.archived_non_de++;
      } else if (det.netto_eur && det.netto_eur > 0) {
        // Netto erkannt → wie applyManualNetto
        await supabaseAdmin
          .from("vehicles")
          .update({
            price_eur_netto: det.netto_eur,
            seller_has_mwst: true,
            netto_manually_set: false,
            pending_review: false,
            extension_archived: false,
            reviewed_at: nowIso(),
            country_code: det.country_code ?? undefined,
            last_review_resolve_at: nowIso(),
            review_resolve_attempts: (v.review_resolve_attempts ?? 0) + 1,
            review_reason: null,
          })
          .eq("id", v.id);
        await recomputeAnalysisForVehicle(v.id, config);
        summary.resolved_netto++;
      } else if (det.has_mwst === false && det.signals.some((s) => s.includes("25a"))) {
        // §25a / Differenzbesteuerung
        await supabaseAdmin
          .from("vehicles")
          .update({
            confirmed_no_netto: true,
            pending_review: false,
            extension_archived: true,
            skip_reason: "no_netto_price",
            reviewed_at: nowIso(),
            seller_has_mwst: false,
            country_code: det.country_code ?? undefined,
            last_review_resolve_at: nowIso(),
            review_resolve_attempts: (v.review_resolve_attempts ?? 0) + 1,
            review_reason: "differenzbesteuerung_25a",
          })
          .eq("id", v.id);
        summary.archived_25a++;
      } else if (det.has_mwst === true) {
        // MwSt erkannt, aber kein Netto-Betrag im Inserat → aus Brutto ableiten (DE 19%).
        const brutto = Number(v.price_eur ?? 0);
        const derivedNetto = brutto > 0 ? Math.round(brutto / 1.19) : null;
        if (derivedNetto) {
          await supabaseAdmin
            .from("vehicles")
            .update({
              price_eur_netto: derivedNetto,
              seller_has_mwst: true,
              netto_manually_set: false,
              pending_review: false,
              extension_archived: false,
              reviewed_at: nowIso(),
              country_code: det.country_code ?? undefined,
              last_review_resolve_at: nowIso(),
              review_resolve_attempts: (v.review_resolve_attempts ?? 0) + 1,
              review_reason: "auto_derived_netto_19pct",
            })
            .eq("id", v.id);
          await recomputeAnalysisForVehicle(v.id, config);
          summary.resolved_netto++;
        } else {
          await supabaseAdmin
            .from("vehicles")
            .update({
              seller_has_mwst: true,
              country_code: det.country_code ?? undefined,
              last_review_resolve_at: nowIso(),
              review_resolve_attempts: (v.review_resolve_attempts ?? 0) + 1,
              review_reason: "mwst_ohne_brutto",
            })
            .eq("id", v.id);
          summary.kept_mwst_only++;
        }
      } else {
        // Jina hat nichts brauchbares
        await supabaseAdmin
          .from("vehicles")
          .update({
            last_review_resolve_at: nowIso(),
            review_resolve_attempts: (v.review_resolve_attempts ?? 0) + 1,
            review_reason: det.signals[0] ?? "no_signal",
          })
          .eq("id", v.id);
        summary.unresolved++;
      }
    } catch (e) {
      summary.errors.push(`${v.id}: ${e instanceof Error ? e.message : String(e)}`);
      try {
        await supabaseAdmin
          .from("vehicles")
          .update({
            last_review_resolve_at: nowIso(),
            review_resolve_attempts: (v.review_resolve_attempts ?? 0) + 1,
            review_reason: "exception",
          })
          .eq("id", v.id);
      } catch {
        /* ignore */
      }
      summary.unresolved++;
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const { count } = await supabaseAdmin
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("pending_review", true)
    .eq("confirmed_no_netto", false)
    .is("skip_reason", null);
  summary.remaining = count ?? 0;

  return summary;
}

export const Route = createFileRoute("/api/public/hooks/resolve-review-queue")({
  server: {
    handlers: {
      POST: async () => Response.json(await runResolve()),
      GET: async () => Response.json(await runResolve()),
    },
  },
});
