import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseGmailMessage, type ParsedListing } from "@/lib/mobile-parser";
import { computeAnalysis, type ConfigInput } from "@/lib/analysis";

const GMAIL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

interface GmailListResp {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

async function gmailFetch<T>(path: string): Promise<T> {
  const LOVABLE = process.env.LOVABLE_API_KEY;
  const KEY = process.env.GOOGLE_MAIL_API_KEY;
  if (!LOVABLE) throw new Error("LOVABLE_API_KEY missing");
  if (!KEY) throw new Error("GOOGLE_MAIL_API_KEY missing (Gmail connector not linked)");
  const res = await fetch(`${GMAIL}${path}`, {
    headers: {
      Authorization: `Bearer ${LOVABLE}`,
      "X-Connection-Api-Key": KEY,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

async function runSync(limit: number) {
  // Determine since-timestamp from sync state
  const { data: state } = await supabaseAdmin
    .from("email_sync_state")
    .select("*")
    .eq("id", 1)
    .single();
  const sinceMs = state?.last_message_internal_date ?? 0;
  const sinceSec = sinceMs ? Math.floor(sinceMs / 1000) : Math.floor((Date.now() - 30 * 86400 * 1000) / 1000);

  // mobile.de subscription emails: search by sender + recency
  const q = encodeURIComponent(`from:(mobile.de OR mobile.de-info OR noreply@mobile.de) after:${sinceSec}`);
  const list = await gmailFetch<GmailListResp>(`/users/me/messages?maxResults=${limit}&q=${q}`);
  const messages = list.messages ?? [];

  // Fetch config once
  const { data: cfg } = await supabaseAdmin.from("app_config").select("*").eq("id", 1).single();
  const config: ConfigInput = {
    eur_chf_rate: Number(cfg?.eur_chf_rate ?? 0.96),
    chf_per_km: Number(cfg?.chf_per_km ?? 0.85),
    customs_flat: Number(cfg?.customs_flat ?? 0),
    vat_rate: Number(cfg?.vat_rate ?? 0.081),
    automobilsteuer_rate: Number(cfg?.automobilsteuer_rate ?? 0.04),
    mfk_flat: Number(cfg?.mfk_flat ?? 600),
    preparation_flat: Number(cfg?.preparation_flat ?? 1200),
    target_margin_chf: Number(cfg?.target_margin_chf ?? 3500),
    weight_margin: cfg?.weight_margin ?? 35,
    weight_liquidity: cfg?.weight_liquidity ?? 25,
    weight_risk: cfg?.weight_risk ?? 25,
    weight_learning: cfg?.weight_learning ?? 15,
  };

  let parsed = 0;
  let inserted = 0;
  let maxInternal = sinceMs;
  const errors: string[] = [];

  for (const m of messages) {
    try {
      const full = await gmailFetch<{
        id: string;
        internalDate?: string;
        payload?: Parameters<typeof parseGmailMessage>[0]["payload"];
      }>(`/users/me/messages/${m.id}?format=full`);
      const internal = full.internalDate ? parseInt(full.internalDate, 10) : 0;
      if (internal > maxInternal) maxInternal = internal;

      const listings: ParsedListing[] = parseGmailMessage(full);
      parsed += listings.length;

      for (const L of listings) {
        if (!L.price_eur) continue;
        // upsert vehicle by source_message_id
        const { data: inserted_row, error: insErr } = await supabaseAdmin
          .from("vehicles")
          .upsert(
            {
              source: "mobile.de",
              source_message_id: L.source_message_id,
              listing_url: L.listing_url,
              title: L.title,
              make: L.make,
              model: L.model,
              year: L.year,
              registration_month: L.registration_month,
              mileage_km: L.mileage_km,
              price_eur: L.price_eur,
              fuel: L.fuel,
              transmission: L.transmission,
              power_kw: L.power_kw,
              power_ps: L.power_ps,
              consumption: L.consumption,
              co2_gkm: L.co2_gkm,
              emission_class: L.emission_class,
              location: L.location,
              seller_name: L.seller_name,
              seller_type: L.seller_type,
              image_url: L.image_url,
              raw_text: L.raw_text,
              received_at: L.received_at,
            },
            { onConflict: "source_message_id" },
          )
          .select("id")
          .single();
        if (insErr) {
          errors.push(`upsert vehicle: ${insErr.message}`);
          continue;
        }
        inserted++;
        const analysis = computeAnalysis(
          {
            price_eur: L.price_eur,
            mileage_km: L.mileage_km,
            year: L.year,
            location: L.location,
            fuel: L.fuel,
            seller_type: L.seller_type,
          },
          config,
        );
        await supabaseAdmin
          .from("vehicle_analyses")
          .upsert({ vehicle_id: inserted_row.id, ...analysis, computed_at: new Date().toISOString() });
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  await supabaseAdmin
    .from("email_sync_state")
    .update({
      last_synced_at: new Date().toISOString(),
      last_message_internal_date: maxInternal,
    })
    .eq("id", 1);

  return { checked: messages.length, parsed, inserted, errors };
}

export const Route = createFileRoute("/api/public/hooks/sync-gmail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let limit = 25;
          try {
            const body = (await request.json()) as { limit?: number };
            if (body?.limit && Number.isFinite(body.limit)) limit = Math.min(100, Math.max(1, body.limit));
          } catch { /* empty body is fine */ }
          const result = await runSync(limit);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[sync-gmail]", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
      GET: async () => {
        // Convenience for manual browser testing
        try {
          const result = await runSync(25);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
