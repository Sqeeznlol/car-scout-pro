import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

async function getQueue(limit: number) {
  // Atomarer Claim via Postgres-Funktion (FOR UPDATE SKIP LOCKED).
  // Garantiert: mehrere PCs/Laptops bekommen NIE dasselbe Inserat.
  // Lease = 10 Minuten — crasht ein Worker, wird das Inserat danach automatisch frei.
  const { data, error } = await supabaseAdmin.rpc("claim_extension_queue", {
    limit_count: limit,
    lease_minutes: 10,
  });
  if (error) throw new Error(error.message);

  type Row = { id: string; listing_url: string | null; source_message_id: string | null };
  const rows = (data ?? []) as Row[];
  return rows
    .filter((v) => v.listing_url && /mobile\.de/i.test(v.listing_url))
    .map((v) => ({ id: v.id, url: v.listing_url as string, mobile_de_id: v.source_message_id }));
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
          // Fire-and-forget: jeder Extension-Poll löst nebenher einen Resolve-Batch aus,
          // damit die pending_review-Queue per Jina automatisch leerläuft.
          const origin = `${url.protocol}//${url.host}`;
          fetch(`${origin}/api/public/hooks/resolve-review-queue`, {
            method: "POST",
            headers: { "content-type": "application/json" },
          }).catch(() => { /* ignore */ });
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
