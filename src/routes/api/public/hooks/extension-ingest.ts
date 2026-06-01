import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeAnalysis, recomputeWithMarket, type ConfigInput } from "@/lib/analysis";
import { computeDistanceToKloten } from "@/lib/distance.server";
import { estimateChMarketValue } from "@/lib/ch-market.server";
import { getLiveEurChfRate } from "@/lib/fx.server";
import { fetchListingDetails } from "@/lib/mwst-detector.server";

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
  if (!payload.vehicle_id && !payload.mobile_de_id && !payload.url) {
    throw new Error("Missing vehicle_id / mobile_de_id / url");
  }

  const idFromUrl = payload.url?.match(/[?&]id=(\d+)/)?.[1] ?? null;
  const idMatch = payload.mobile_de_id ?? idFromUrl;

  const SELECT_COLS = "id, listing_url, source_message_id, make, model, year, mileage_km, location, fuel, seller_type, distance_km, price_eur";

  type ExistingRow = {
    id: string;
    listing_url: string | null;
    source_message_id: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    mileage_km: number | null;
    location: string | null;
    fuel: string | null;
    seller_type: string | null;
    distance_km: number | null;
    price_eur: number | null;
  };

  let existing: ExistingRow | null = null;

  // 1) Direkt per vehicle_id
  if (payload.vehicle_id) {
    const { data } = await supabaseAdmin
      .from("vehicles").select(SELECT_COLS).eq("id", payload.vehicle_id).limit(1).maybeSingle();
    existing = (data as ExistingRow | null) ?? null;
  }

  // 2) Fallback: per mobile_de_listing_id / source_message_id
  if (!existing && idMatch) {
    const { data } = await supabaseAdmin
      .from("vehicles").select(SELECT_COLS)
      .or(`mobile_de_listing_id.eq.${idMatch},source_message_id.ilike.%${idMatch}%`)
      .limit(1).maybeSingle();
    existing = (data as ExistingRow | null) ?? null;
  }

  // 3) Fallback: per listing_url
  if (!existing && payload.url) {
    const { data } = await supabaseAdmin
      .from("vehicles").select(SELECT_COLS).eq("listing_url", payload.url).limit(1).maybeSingle();
    existing = (data as ExistingRow | null) ?? null;
  }

  // 4) Nichts gefunden → neuen Vehicle-Eintrag automatisch anlegen
  if (!existing) {
    if (!idMatch && !payload.url) {
      return { ok: false, error: "vehicle not found and no id/url to create one", archived: false };
    }
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("vehicles")
      .insert({
        source: "mobile.de",
        title: payload.title ?? `mobile.de ${idMatch ?? ""}`.trim(),
        listing_url: payload.url ?? null,
        mobile_de_listing_id: idMatch ?? null,
        price_eur: payload.price_eur ?? null,
        mileage_km: payload.mileage_km ?? null,
        year: payload.year ?? null,
        fuel: payload.fuel ?? null,
        location: payload.location ?? null,
        seller_type: payload.seller_type ?? null,
        received_at: new Date().toISOString(),
      } as never)
      .select(SELECT_COLS)
      .single();
    if (insErr || !inserted) {
      // Race / Duplikat: ein paralleler Ingest hat den Eintrag schon angelegt
      // (unique partial index auf mobile_de_listing_id). Wir holen ihn nach.
      const isDup = insErr?.code === "23505" || /duplicate key|unique/i.test(insErr?.message ?? "");
      if (isDup && idMatch) {
        const { data: dup } = await supabaseAdmin
          .from("vehicles").select(SELECT_COLS)
          .eq("mobile_de_listing_id", idMatch).limit(1).maybeSingle();
        if (dup) {
          existing = dup as ExistingRow;
        }
      }
      if (!existing) {
        return { ok: false, error: `auto-create failed: ${insErr?.message ?? "unknown"}`, archived: false };
      }
    } else {
      existing = inserted as ExistingRow;
    }
  }

  // Echte Detaildaten vorhanden? Reiner Fallback-Ping (nur id/url/country) zählt nicht.
  const hasRealData = Boolean(
    (typeof payload.price_eur === "number" && payload.price_eur > 0) ||
      payload.mileage_km ||
      payload.seller_name ||
      payload.seller_address ||
      (payload.image_urls && payload.image_urls.length > 0),
  );

  // synced_at IMMER stempeln (Extension hat angeklopft).
  // scraped_at NUR bei echten Daten — sonst bleibt das Inserat in der Claim-Queue
  // und wird erneut versucht (extension_attempts < 3 limitiert automatisch).
  const stampUpdate: Record<string, unknown> = {
    extension_synced_at: new Date().toISOString(),
    ...(idFromUrl ? { mobile_de_listing_id: idFromUrl } : {}),
  };
  if (hasRealData) {
    stampUpdate.extension_scraped_at = new Date().toISOString();
  }
  await supabaseAdmin.from("vehicles").update(stampUpdate as never).eq("id", existing.id);

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

  // Netto nur akzeptieren, wenn mobile.de wirklich einen separaten Netto-Betrag liefert.
  // "MwSt. ausweisbar" allein reicht nicht — ohne expliziten Netto-Preis ist es für CH nicht interessant.
  let effectiveHasMwst = payload.seller_has_mwst;
  let effectiveNetto = payload.price_eur_netto ?? null;

  // Fallback: weder bestätigt noch netto → Jina inline probieren (ein Versuch).
  if ((effectiveHasMwst !== true || !effectiveNetto) && payload.url) {
    try {
      const jina = await fetchListingDetails(payload.url);
      if (jina.has_mwst === true) {
        effectiveHasMwst = true;
        if (jina.netto_eur && jina.netto_eur > 0) effectiveNetto = jina.netto_eur;
      } else if (jina.has_mwst === false) {
        effectiveHasMwst = false;
      }
    } catch {
      /* jina optional */
    }
  }

  // Immer noch kein expliziter Netto-Betrag → nicht in die Swipe Queue aufnehmen.
  if (effectiveHasMwst !== true || !effectiveNetto) {
    const cleaned: Record<string, unknown> = {
      pending_review: false,
      extension_archived: true,
      skip_reason: "no_explicit_netto_price",
      country_code: country || "DE",
      seller_has_mwst: effectiveHasMwst === true,
      price_eur_netto: null,
      review_reason: effectiveHasMwst === true ? "mwst_without_explicit_netto" : "no_netto_price",
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
    return { ok: true, archived: true, reason: "kein expliziter Nettopreis" };
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
    price_eur_netto: effectiveNetto,
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
