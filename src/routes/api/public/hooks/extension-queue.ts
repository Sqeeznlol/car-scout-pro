import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getQueue(limit: number) {
  // Inserate die noch nie von der Extension synct wurden ODER alte Daten haben
  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, listing_url, mobile_de_listing_id, extension_synced_at, seller_has_mwst, country_code")
    .not("listing_url", "is", null)
    .is("skip_reason", null)
    .or("extension_synced_at.is.null,seller_has_mwst.is.null,country_code.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((v) => v.listing_url && /mobile\.de/.test(v.listing_url))
    .map((v) => ({ id: v.id, url: v.listing_url as string }));
}

export const Route = createFileRoute("/api/public/hooks/extension-queue")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 20);
        try {
          const items = await getQueue(limit);
          return new Response(JSON.stringify({ ok: true, items }), {
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});
