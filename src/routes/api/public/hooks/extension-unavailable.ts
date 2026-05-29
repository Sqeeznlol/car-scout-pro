import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/hooks/extension-unavailable")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { mobile_de_id?: string; url?: string };
          if (!body.mobile_de_id) {
            return new Response(JSON.stringify({ ok: false, error: "mobile_de_id required" }), {
              status: 400,
              headers: { "content-type": "application/json", ...CORS },
            });
          }
          const sid = `extension_${body.mobile_de_id}`;
          // Update existing vehicle if present
          const { data: existing } = await supabaseAdmin
            .from("vehicles")
            .select("id")
            .eq("source_message_id", sid)
            .maybeSingle();
          if (existing) {
            await supabaseAdmin
              .from("vehicles")
              .update({ skip_reason: "unavailable", extension_synced_at: new Date().toISOString() })
              .eq("id", existing.id);
            return new Response(JSON.stringify({ ok: true, vehicle_id: existing.id, archived: true }), {
              status: 200,
              headers: { "content-type": "application/json", ...CORS },
            });
          }
          // Insert stub row so it shows in archive
          const { data: inserted } = await supabaseAdmin
            .from("vehicles")
            .upsert(
              {
                source: "mobile.de",
                source_message_id: sid,
                mobile_de_listing_id: body.mobile_de_id,
                listing_url: body.url ?? null,
                title: `Mobile.de ${body.mobile_de_id} (nicht mehr verfügbar)`,
                skip_reason: "unavailable",
                extension_synced_at: new Date().toISOString(),
              },
              { onConflict: "source_message_id" },
            )
            .select("id")
            .single();
          return new Response(JSON.stringify({ ok: true, vehicle_id: inserted?.id, archived: true }), {
            status: 200,
            headers: { "content-type": "application/json", ...CORS },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});
