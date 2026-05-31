import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeAnalysis, recomputeWithMarket, type ConfigInput } from "@/lib/analysis";
import { computeDistanceToKloten } from "@/lib/distance.server";
import { estimateChMarketValue } from "@/lib/ch-market.server";
import { getLiveEurChfRate } from "@/lib/fx.server";

interface IngestPayload {
  vehicle_id?: string;
  mobile_de_id?: string;
  url?: string;
  title?: string;
  country_code?: string | null;
  price_eur?: number;
  price_eur_netto?: number;
  seller_has_mwst?: boolean;
  mileage_km?: number;
  year?: number;
  registration_month?: number;
  power_kw?: number;
  power_ps?: number;
  fuel?: string;
  transmission?: string;
  consumption?: string;
  co2_gkm?: number;
  emission_class?: string;
  location?: string;
  seller_name?: string;
  seller_type?: string;
  seller_phone?: string;
  seller_address?: string;
  seller_website?: string;
  image_url?: string;
  image_urls?: string[];
  equipment?: string[];
  description?: string;
  owner_count?: number;
  hu_until?: string;
  color?: string;
  interior_color?: string;
  body_type?: string;
  doors?: number;
  seats?: number;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

async function ingest(payload: IngestPayload) {
  if (!payload.mobile_de_id && !payload.url) {
    throw new Error("Missing mobile_de_id or url");
  }

  const idFromUrl = payload.url?.match(/[?&]id=(\d+)/)?.[1] ?? null;
  const idMatch = payload.mobile_de_id ?? idFromUrl;

  let query = supabaseAdmin
    .from("vehicles")
    .select("id, listing_url, source_message_id, make, model, year, mileage_km, location, fuel, seller_type, distance_km, price_eur")
    .limit(1);

  if (idMatch) {
    query = query.ilike("source_message_id", `%${idMatch}%`);
  } else if (payload.url) {
    query = query.eq("listing_url", payload.url);
  }

  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { ok: false, error: "vehicle not found", archived: false };
  }

  // CRITICAL: scraped_at SOFORT stempeln — egal was danach passiert.
  // Ohne das würde die Extension dieselben Inserate ewig wiederholen.
  await supabaseAdmin
    .from("vehicles")
    .update({ extension_scraped_at: new Date().toISOString(), extension_synced_at: new Date().toISOString() })
    .eq("id", existing.id);

  const country = (payload.country_code ?? "DE").toUpperCase();
  if (country && country !== "DE") {
    await supabaseAdmin
      .from("vehicles")
      .update({
        extension_archived: true,
        skip_reason: `non_de_dealer_${country.toLowerCase()}`,
        country_code: country,
      })
      .eq("id", existing.id);
    return { ok: true, archived: true, reason: `non-DE (${country})` };
  }

  // Kein Netto erkannt → Prüfung-Tab (nicht archivieren!)
  if (payload.seller_has_mwst !== true || !payload.price_eur_netto) {
    const cleaned: Record<string, unknown> = {
      pending_review: true,
      country_code: country || "DE",
      seller_has_mwst: false,
    };
    if (payload.title) cleaned.title = payload.title;
    if (payload.price_eur) cleaned.price_eur = payload.price_eur;
    if (payload.mileage_km) cleaned.mileage_km = payload.mileage_km;
    if (payload.year) cleaned.year = payload.year;
    if (payload.fuel) cleaned.fuel = payload.fuel;
    if (payload.transmission) cleaned.transmission = payload.transmission;
    if (payload.power_kw) cleaned.power_kw = payload.power_kw;
    if (payload.location) cleaned.location = payload.location;
    if (payload.seller_name) cleaned.seller_name = payload.seller_name;
    if (payload.seller_phone) cleaned.seller_phone = payload.seller_phone;
    if (payload.seller_address) cleaned.seller_address = payload.seller_address;
    if (payload.image_url) cleaned.image_url = payload.image_url;
    if (payload.image_urls) cleaned.image_urls = payload.image_urls;
    if (payload.equipment) cleaned.equipment = payload.equipment;
    if (payload.description) cleaned.description = payload.description;

    await supabaseAdmin.from("vehicles").update(cleaned as never).eq("id", existing.id);
    return { ok: true, pending_review: true, reason: "kein Nettopreis — wartet auf Prüfung" };
  }

  // Vollständige Verarbeitung: DE + Netto vorhanden
  let distance_km = existing.distance_km as number | null;
  if (payload.seller_address) {
    const d = await computeDistanceToKloten(payload.seller_address, payload.location ?? null);
    if (d) distance_km = d.distance_km;
  }

  const update: Record<string, unknown> = {
    title: payload.title,
    price_eur: payload.price_eur ?? existing.price_eur,
    price_eur_netto: payload.price_eur_netto,
    seller_has_mwst: true,
    mileage_km: payload.mileage_km ?? existing.mileage_km,
    year: payload.year ?? existing.year,
    registration_month: payload.registration_month,
    power_kw: payload.power_kw,
    power_ps: payload.power_ps,
    fuel: payload.fuel ?? existing.fuel,
    transmission: payload.transmission,
    consumption: payload.consumption,
    co2_gkm: payload.co2_gkm,
    emission_class: payload.emission_class,
    location: payload.location ?? existing.location,
    seller_name: payload.seller_name,
    seller_type: payload.seller_type ?? existing.seller_type,
    seller_phone: payload.seller_phone,
    seller_address: payload.seller_address,
    seller_website: payload.seller_website,
    image_url: payload.image_url,
    image_urls: payload.image_urls,
    equipment: payload.equipment,
    description: payload.description,
    owner_count: payload.owner_count,
    hu_until: payload.hu_until,
    color: payload.color,
    interior_color: payload.interior_color,
    body_type: payload.body_type,
    doors: payload.doors,
    seats: payload.seats,
    country_code: country,
    distance_km,
    pending_review: false,
  };
  const cleanUpdate = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined));
  await supabaseAdmin.from("vehicles").update(cleanUpdate as never).eq("id", existing.id);

  // Analyse neu berechnen
  const { data: cfg } = await supabaseAdmin.from("app_config").select("*").eq("id", 1).single();
  const liveRate = await getLiveEurChfRate().catch(() => Number(cfg?.eur_chf_rate) || 0.96);
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
      price_eur: Number(payload.price_eur ?? existing.price_eur ?? 0),
      mileage_km: payload.mileage_km ?? existing.mileage_km ?? null,
      year: payload.year ?? existing.year ?? null,
      location: payload.location ?? existing.location ?? null,
      fuel: payload.fuel ?? existing.fuel ?? null,
      seller_type: payload.seller_type ?? existing.seller_type ?? null,
      distance_km,
    },
    config,
  );

  let asExtra: Record<string, unknown> = {};
  try {
    const ch = await estimateChMarketValue({
      make: existing.make,
      model: existing.model,
      year: payload.year ?? existing.year,
      mileage_km: payload.mileage_km ?? existing.mileage_km,
      fuel: payload.fuel ?? existing.fuel ?? null,
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
        analysis = recomputeWithMarket(
          {
            price_eur: Number(payload.price_eur ?? existing.price_eur ?? 0),
            mileage_km: payload.mileage_km ?? existing.mileage_km ?? null,
            year: payload.year ?? existing.year ?? null,
            location: payload.location ?? existing.location ?? null,
            fuel: payload.fuel ?? existing.fuel ?? null,
            seller_type: payload.seller_type ?? existing.seller_type ?? null,
            distance_km,
          },
          config,
          analysis,
          ch.avg,
        );
      }
    }
  } catch {
    /* market estimation optional */
  }

  await supabaseAdmin.from("vehicle_analyses").upsert(
    { vehicle_id: existing.id, ...analysis, ...asExtra, seller_has_mwst: true, computed_at: new Date().toISOString() },
    { onConflict: "vehicle_id" },
  );

  return {
    ok: true,
    archived: false,
    analysis: {
      total_cost_chf: analysis.total_cost_chf,
      expected_margin_chf: analysis.expected_margin_chf,
      deal_score: analysis.deal_score,
    },
  };
}

export const Route = createFileRoute("/api/public/hooks/extension-ingest")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        try {
          const payload = (await request.json()) as IngestPayload;
          const result = await ingest(payload);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 400,
            headers: { "content-type": "application/json", ...CORS_HEADERS },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json", ...CORS_HEADERS } },
          );
        }
      },
    },
  },
});
