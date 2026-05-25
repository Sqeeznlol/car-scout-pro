import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { detectMwStFromText, detectCountry } from "@/lib/mobile-parser";

async function runBackfill() {
  const { data: rows, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, raw_text, seller_has_mwst, country_code, skip_reason")
    .not("raw_text", "is", null);
  if (error) throw new Error(error.message);

  let mwst_set = 0;
  let country_set = 0;
  let archived_non_de = 0;
  const errors: string[] = [];

  for (const v of rows ?? []) {
    if (!v.raw_text) continue;
    try {
      const updates: Record<string, unknown> = {};
      if (v.seller_has_mwst == null) {
        const m = detectMwStFromText(v.raw_text);
        if (m.has_mwst !== null) {
          updates.seller_has_mwst = m.has_mwst;
          if (m.netto_eur) updates.price_eur_netto = m.netto_eur;
          mwst_set++;
        }
      }
      if (!v.country_code) {
        const c = detectCountry(v.raw_text);
        if (c) {
          updates.country_code = c;
          country_set++;
          if (c !== "DE" && !v.skip_reason) {
            updates.skip_reason = `country_${c}`;
            archived_non_de++;
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("vehicles").update(updates).eq("id", v.id);
      }
    } catch (e) {
      errors.push(`${v.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { checked: rows?.length ?? 0, mwst_set, country_set, archived_non_de, errors };
}

export const Route = createFileRoute("/api/public/hooks/backfill-mwst")({
  server: {
    handlers: {
      POST: async () => Response.json(await runBackfill()),
      GET: async () => Response.json(await runBackfill()),
    },
  },
});
