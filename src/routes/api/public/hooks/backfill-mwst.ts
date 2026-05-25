import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { detectMwStFromListing } from "@/lib/mwst-detector.server";

async function runBackfill(limit: number) {
  const { data: rows, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, listing_url")
    .is("seller_has_mwst", null)
    .not("listing_url", "is", null)
    .limit(limit);
  if (error) throw new Error(error.message);

  let checked = 0;
  let updated_true = 0;
  let updated_false = 0;
  let still_unknown = 0;
  const errors: string[] = [];

  for (const r of rows ?? []) {
    if (!r.listing_url) continue;
    checked++;
    try {
      const det = await detectMwStFromListing(r.listing_url);
      if (det.has_mwst === true) {
        await supabaseAdmin.from("vehicles").update({ seller_has_mwst: true }).eq("id", r.id);
        updated_true++;
      } else if (det.has_mwst === false) {
        await supabaseAdmin.from("vehicles").update({ seller_has_mwst: false }).eq("id", r.id);
        updated_false++;
      } else {
        still_unknown++;
      }
    } catch (e) {
      errors.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { checked, updated_true, updated_false, still_unknown, errors };
}

export const Route = createFileRoute("/api/public/hooks/backfill-mwst")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let limit = 50;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body?.limit && Number.isFinite(body.limit)) limit = Math.min(200, Math.max(1, body.limit));
        } catch {
          /* ignore */
        }
        const r = await runBackfill(limit);
        return Response.json(r);
      },
      GET: async () => {
        const r = await runBackfill(50);
        return Response.json(r);
      },
    },
  },
});
