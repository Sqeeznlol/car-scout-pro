import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchListingDetails } from "@/lib/mwst-detector.server";
import { computeAnalysis, recomputeWithMarket, type ConfigInput } from "@/lib/analysis";
import { computeDistanceToKloten } from "@/lib/distance.server";
import { estimateChMarketValue } from "@/lib/ch-market.server";
import { getLiveEurChfRate } from "@/lib/fx.server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

const DEFAULT_BATCH = 10;
const MAX_BATCH = 25;

async function processOne(v: {
  id: string;
  listing_url: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage_km: number | null;
  fuel: string | null;
  location: string | null;
  seller_type: string | null;
  seller_address: string | null;
  distance_km: number | null;
  price_eur: number | null;
}) {
  // 1) Sofort scraped_at + attempt stempeln → fällt aus der Queue
  await supabaseAdmin
    .from("vehicles")
    .update({
      extension_scraped_at: new Date().toISOString(),
      extension_synced_at: new Date().toISOString(),
      last_extension_attempt_at: new Date().toISOString(),
      extension_attempts: ((v as unknown as { extension_attempts?: number }).extension_attempts ?? 0) + 1,
    })
    .eq("id", v.id);

  const det = await fetchListingDetails(v.listing_url);
  const country = (det.country_code ?? "DE").toUpperCase();

  // 2) non-DE → Archiv
  if (country && country !== "DE") {
    await supabaseAdmin
      .from("vehicles")
      .update({
        extension_archived: true,
        skip_reason: `non_de_dealer_${country.toLowerCase()}`,
        country_code: country,
        location: det.location ?? v.location,
      })
      .eq("id", v.id);
    return { id: v.id, status: "archived_non_de", country };
  }

  // 3) Kein Netto → Prüfung
  if (det.has_mwst !== true || !det.netto_eur) {
    await supabaseAdmin
      .from("vehicles")
      .update({
        pending_review: true,
        country_code: country || "DE",
        seller_has_mwst: false,
        location: det.location ?? v.location,
      })
      .eq("id", v.id);
    return { id: v.id, status: "pending_review", signals: det.signals };
  }

  // 4) DE + Netto → volle Verarbeitung
  let distance_km = v.distance_km;
  if (det.location && !distance_km) {
    const d = await computeDistanceToKloten(det.location, det.location).catch(() => null);
    if (d) distance_km = d.distance_km;
  }

  await supabaseAdmin
    .from("vehicles")
    .update({
      price_eur_netto: det.netto_eur,
      seller_has_mwst: true,
      country_code: country,
      location: det.location ?? v.location,
      distance_km,
      pending_review: false,
    })
    .eq("id", v.id);

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
      price_eur: Number(v.price_eur ?? 0),
      mileage_km: v.mileage_km,
      year: v.year,
      location: det.location ?? v.location,
      fuel: v.fuel,
      seller_type: v.seller_type,
      distance_km,
    },
    config,
  );

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
        analysis = recomputeWithMarket(
          {
            price_eur: Number(v.price_eur ?? 0),
            mileage_km: v.mileage_km,
            year: v.year,
            location: det.location ?? v.location,
            fuel: v.fuel,
            seller_type: v.seller_type,
            distance_km,
          },
          config,
          analysis,
          ch.avg,
        );
      }
    }
  } catch {
    /* optional */
  }

  await supabaseAdmin.from("vehicle_analyses").upsert(
    { vehicle_id: v.id, ...analysis, ...asExtra, seller_has_mwst: true, computed_at: new Date().toISOString() },
    { onConflict: "vehicle_id" },
  );

  return { id: v.id, status: "queued", netto: det.netto_eur };
}

async function runBatch(limit: number) {
  const { data: rows, error } = await supabaseAdmin
    .from("vehicles")
    .select(
      "id, listing_url, make, model, year, mileage_km, fuel, location, seller_type, seller_address, distance_km, price_eur, extension_attempts",
    )
    .is("extension_scraped_at", null)
    .is("skip_reason", null)
    .eq("extension_archived", false)
    .not("listing_url", "is", null)
    .lt("extension_attempts", 3)
    .order("last_extension_attempt_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const items = (rows ?? []).filter((r) => r.listing_url && /mobile\.de/i.test(r.listing_url));

  const results: unknown[] = [];
  // Sequentiell mit kleinem Jitter — Jina ist gratis aber nicht unbegrenzt
  for (const r of items) {
    try {
      const out = await processOne(r as Parameters<typeof processOne>[0]);
      results.push(out);
    } catch (e) {
      results.push({ id: r.id, status: "error", error: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((res) => setTimeout(res, 400 + Math.floor(Math.random() * 600)));
  }

  return { processed: results.length, results };
}

export const Route = createFileRoute("/api/public/hooks/scrape-batch")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(MAX_BATCH, Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_BATCH), 10)));
        try {
          const out = await runBatch(limit);
          return new Response(JSON.stringify({ ok: true, ...out }), {
            status: 200,
            headers: { "content-type": "application/json", ...CORS, "cache-control": "no-store" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
            status: 500,
            headers: { "content-type": "application/json", ...CORS },
          });
        }
      },
      POST: async ({ request }) => {
        let limit = DEFAULT_BATCH;
        try {
          const body = (await request.json().catch(() => ({}))) as { limit?: number };
          if (typeof body.limit === "number") limit = Math.min(MAX_BATCH, Math.max(1, body.limit));
        } catch {
          /* empty body OK */
        }
        try {
          const out = await runBatch(limit);
          return new Response(JSON.stringify({ ok: true, ...out }), {
            status: 200,
            headers: { "content-type": "application/json", ...CORS },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
            status: 500,
            headers: { "content-type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
