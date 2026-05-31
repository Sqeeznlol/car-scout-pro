import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

async function getQueue(limit: number) {
  // Rotation: nie-versucht zuerst, dann ältester Versuch, dann wenigste Versuche
  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, listing_url, source_message_id, extension_attempts")
    .is("extension_scraped_at", null)
    .is("skip_reason", null)
    .eq("extension_archived", false)
    .not("listing_url", "is", null)
    .lt("extension_attempts", 3)
    .order("last_extension_attempt_at", { ascending: true, nullsFirst: true })
    .order("extension_attempts", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const items = (data ?? [])
    .filter((v) => v.listing_url && /mobile\.de/i.test(v.listing_url))
    .map((v) => ({ id: v.id, url: v.listing_url as string, mobile_de_id: v.source_message_id }));

  // Atomar Counter erhöhen — verhindert, dass die gleichen Inserate beim nächsten Lauf zurückkommen
  const ids = items.map((i) => i.id);
  if (ids.length > 0) {
    const { error: rpcErr } = await supabaseAdmin.rpc("increment_extension_attempts", { vehicle_ids: ids });
    if (rpcErr) {
      console.warn("[extension-queue] RPC failed, using fallback:", rpcErr.message);
      // ECHTER Fallback: aktuellen Wert lesen und +1, statt fix auf 1 zu setzen
      const { data: currentRows } = await supabaseAdmin
        .from("vehicles")
        .select("id, extension_attempts")
        .in("id", ids);
      if (currentRows) {
        for (const row of currentRows) {
          await supabaseAdmin
            .from("vehicles")
            .update({
              extension_attempts: ((row as { extension_attempts: number | null }).extension_attempts ?? 0) + 1,
              last_extension_attempt_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
      }
    }
  }

  return items;
}

export const Route = createFileRoute("/api/public/hooks/extension-queue")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get("limit") || "5", 10)));
        try {
          const items = await getQueue(limit);
          return new Response(JSON.stringify({ ok: true, items }), {
            status: 200,
            headers: { "content-type": "application/json", ...CORS_HEADERS, "cache-control": "no-store" },
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
