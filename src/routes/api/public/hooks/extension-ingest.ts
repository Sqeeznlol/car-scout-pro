import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeAnalysis, recomputeWithMarket, type ConfigInput } from "@/lib/analysis";
import { computeDistanceToKloten } from "@/lib/distance.server";
import { estimateChMarketValue } from "@/lib/ch-market.server";
import { getLiveEurChfRate } from "@/lib/fx.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Extension-Token",
};

interface ExtensionPayload {
  mobile_de_id: string;
  url: string;
  title: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  registration_month?: number | null;
  mileage_km?: number | null;
  price_eur?: number | null;
  price_eur_netto?: number | null;
  seller_has_mwst?: boolean | null;
  fuel?: string | null;
  transmission?: string | null;
  power_kw?: number | null;
  power_ps?: number | null;
  consumption?: string | null;
  co2_gkm?: number | null;
  emission_class?: string | null;
  location?: string | null;
  country_code?: string | null;
  seller_name?: string | null;
  seller_type?: string | null;
  seller_phone?: string | null;
  seller_address?: string | null;
  seller_website?: string | null;
  image_url?: string | null;
  image_urls?: string[];
  equipment?: string[];
  description?: string | null;
  owner_count?: number | null;
  hu_until?: string | null;
  color?: string | null;
  interior_color?: string | null;
  body_type?: string | null;
  doors?: number | null;
  seats?: number | null;
}

async function ingest(payload: ExtensionPayload) {
  if (!payload.mobile_de_id || !payload.price_eur) {
    return { ok: false, error: "mobile_de_id and price_eur required" };
  }

  const source_message_id = `extension_${payload.mobile_de_id}`;

  if (payload.country_code && payload.country_code !== "DE") {
    const { data: row } = await supabaseAdmin.from("vehicles").upsert(
      {
        source: "mobile.de",
        source_message_id,
        mobile_de_listing_id: payload.mobile_de_id,
        listing_url: payload.url,
        title: payload.title,
        make: payload.make ?? null,
        model: payload.model ?? null,
        year: payload.year ?? null,
        mileage_km: payload.mileage_km ?? null,
        price_eur: payload.price_eur,
        fuel: payload.fuel ?? null,
        image_url: payload.image_url ?? null,
        location: payload.location ?? null,
        country_code: payload.country_code,
        skip_reason: `country_${payload.country_code}`,
        extension_synced_at: new Date().toISOString(),
      },
      { onConflict: "source_message_id" },
    ).select("id").single();
    return { ok: true, vehicle_id: row?.id, archived: true, reason: `country_${payload.country_code}` };
  }

  const dist = await computeDistanceToKloten(payload.seller_address ?? null, payload.location ?? null);

  const { data: inserted_row, error: insErr } = await supabaseAdmin
    .from("vehicles")
    .upsert(
      {
        source: "mobile.de",
        source_message_id,
        mobile_de_listing_id: payload.mobile_de_id,
        listing_url: payload.url,
        title: payload.title,
        make: payload.make ?? null,
        model: payload.model ?? null,
        year: payload.year ?? null,
        registration_month: payload.registration_month ?? null,
        mileage_km: payload.mileage_km ?? null,
        price_eur: payload.price_eur,
        price_eur_netto: payload.price_eur_netto ?? null,
        seller_has_mwst: payload.seller_has_mwst ?? null,
        country_code: payload.country_code ?? "DE",
        fuel: payload.fuel ?? null,
        transmission: payload.transmission ?? null,
        power_kw: payload.power_kw ?? null,
        power_ps: payload.power_ps ?? null,
        consumption: payload.consumption ?? null,
        co2_gkm: payload.co2_gkm ?? null,
        emission_class: payload.emission_class ?? null,
        location: payload.location ?? null,
        seller_name: payload.seller_name ?? null,
        seller_type: payload.seller_type ?? null,
        seller_phone: payload.seller_phone ?? null,
        seller_address: payload.seller_address ?? null,
        seller_website: payload.seller_website ?? null,
        image_url: payload.image_url ?? payload.image_urls?.[0] ?? null,
        image_urls: payload.image_urls ?? null,
        equipment: payload.equipment ?? null,
        description: payload.description ?? null,
        owner_count: payload.owner_count ?? null,
        hu_until: payload.hu_until ?? null,
        color: payload.color ?? null,
        interior_color: payload.interior_color ?? null,
        body_type: payload.body_type ?? null,
        doors: payload.doors ?? null,
        seats: payload.seats ?? null,
        latitude: dist?.latitude ?? null,
        longitude: dist?.longitude ?? null,
        distance_km: dist?.distance_km ?? null,
        distance_minutes: dist?.distance_minutes ?? null,
        distance_computed_at: dist ? new Date().toISOString() : null,
        extension_synced_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
      },
      { onConflict: "source_message_id" },
    )
    .select("id")
    .single();
  if (insErr || !inserted_row) {
    return { ok: false, error: insErr?.message ?? "upsert failed" };
  }

  // DE listing without ausweisbare MwSt / Netto → goes to Admin "Prüfung" instead of Swipe Queue.
  // User manually enters Netto (→ Queue) or confirms none (→ Archive).
  if (payload.seller_has_mwst !== true || !payload.price_eur_netto) {
    await supabaseAdmin
      .from("vehicles")
      .update({ pending_review: true, seller_has_mwst: payload.seller_has_mwst ?? false })
      .eq("id", inserted_row.id);
    return { ok: true, vehicle_id: inserted_row.id, pending_review: true, reason: "kein Nettopreis erkannt — wartet auf Prüfung" };
  }

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
      price_eur: payload.price_eur,
      mileage_km: payload.mileage_km ?? null,
      year: payload.year ?? null,
      location: payload.location ?? null,
      fuel: payload.fuel ?? null,
      seller_type: payload.seller_type ?? null,
      distance_km: dist?.distance_km ?? null,
    },
    config,
  );
  let asExtra = {
    autoscout_ch_url: null as string | null,
    autoscout_ch_comparable_count: null as number | null,
    autoscout_ch_price_min: null as number | null,
    autoscout_ch_price_max: null as number | null,
    autoscout_ch_price_avg: null as number | null,
    autoscout_ch_scraped_at: null as string | null,
  };
  try {
    const ch = await estimateChMarketValue({
      make: payload.make ?? null,
      model: payload.model ?? null,
      year: payload.year ?? null,
      mileage_km: payload.mileage_km ?? null,
      fuel: payload.fuel ?? null,
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
            price_eur: payload.price_eur,
            mileage_km: payload.mileage_km ?? null,
            year: payload.year ?? null,
            location: payload.location ?? null,
            fuel: payload.fuel ?? null,
            seller_type: payload.seller_type ?? null,
            distance_km: dist?.distance_km ?? null,
          },
          config,
          analysis,
          ch.avg,
        );
      }
    }
  } catch {
    /* ignore market estimation errors */
  }
  await supabaseAdmin.from("vehicle_analyses").upsert({
    vehicle_id: inserted_row.id,
    ...analysis,
    ...asExtra,
    computed_at: new Date().toISOString(),
  });

  return {
    ok: true,
    vehicle_id: inserted_row.id,
    archived: false,
    queue_url: `/vehicle/${inserted_row.id}`,
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
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as ExtensionPayload;
          const result = await ingest(body);
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
