import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchListingDetails } from "@/lib/mwst-detector.server";
import { computeDistanceToKloten } from "@/lib/distance.server";

async function runBackfill() {
  const { data: rows, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, listing_url, seller_has_mwst, country_code, location, skip_reason")
    .or("seller_has_mwst.is.null,country_code.is.null,pending_review.eq.true")
    .not("listing_url", "is", null)
    .is("skip_reason", null)
    .limit(15);
  if (error) throw new Error(error.message);

  let mwst_set = 0;
  let country_set = 0;
  let archived_non_de = 0;
  let location_improved = 0;
  const errors: string[] = [];

  for (const v of rows ?? []) {
    if (!v.listing_url) continue;
    try {
      const det = await fetchListingDetails(v.listing_url);
      const updates: Partial<{
        seller_has_mwst: boolean;
        price_eur_netto: number;
        country_code: string;
        skip_reason: string;
        location: string;
        latitude: number;
        longitude: number;
        distance_km: number;
        distance_minutes: number;
        distance_computed_at: string;
      }> = {};
      if (v.seller_has_mwst == null && det.has_mwst !== null) {
        updates.seller_has_mwst = det.has_mwst;
        if (det.netto_eur) updates.price_eur_netto = det.netto_eur;
        mwst_set++;
      }
      if (!v.country_code && det.country_code) {
        updates.country_code = det.country_code;
        country_set++;
        if (det.country_code !== "DE") {
          updates.skip_reason = `country_${det.country_code}`;
          archived_non_de++;
        }
      }
      if (det.location && det.location !== v.location) {
        updates.location = det.location;
        const dist = await computeDistanceToKloten(det.location, null);
        if (dist) {
          updates.latitude = dist.latitude;
          updates.longitude = dist.longitude;
          updates.distance_km = dist.distance_km;
          updates.distance_minutes = dist.distance_minutes;
          updates.distance_computed_at = new Date().toISOString();
        }
        location_improved++;
      }
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("vehicles").update(updates).eq("id", v.id);
      }
      await new Promise((r) => setTimeout(r, 3500));
    } catch (e) {
      errors.push(`${v.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { checked: rows?.length ?? 0, mwst_set, country_set, archived_non_de, location_improved, errors };
}

export const Route = createFileRoute("/api/public/hooks/backfill-mwst")({
  server: {
    handlers: {
      POST: async () => Response.json(await runBackfill()),
      GET: async () => Response.json(await runBackfill()),
    },
  },
});
