import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildTelegramMessage,
  sendTelegramMessage,
  type TelegramFilter,
} from "./telegram.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TestInput = z.object({
  filter: z.object({
    id: z.string().default("test"),
    name: z.string().default("Test"),
    is_active: z.boolean().default(true),
    makes: z.array(z.string()).default([]),
    models: z.array(z.string()).default([]),
    max_mileage: z.number().nullable().default(null),
    max_price_eur: z.number().nullable().default(null),
    min_margin_chf: z.number().nullable().default(null),
    min_deal_score: z.number().nullable().default(null),
    fuel_types: z.array(z.string()).default([]),
    telegram_bot_token: z.string().min(10),
    telegram_chat_id: z.string().min(1),
  }),
});

export const sendTestTelegram = createServerFn({ method: "POST" })
  .inputValidator((data) => TestInput.parse(data))
  .handler(async ({ data }) => {
    const f = data.filter as TelegramFilter;

    // Echtes Inserat aus DB holen (neuestes mit Bild + Link)
    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select("id,make,model,year,mileage_km,price_eur,fuel,transmission,location,seller_name,seller_type,listing_url,distance_km,image_url")
      .not("listing_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!vehicle) {
      return { ok: false, error: "Kein Inserat in der Datenbank gefunden. Synchronisiere zuerst eine E-Mail." };
    }

    const { data: analysisRow } = await supabaseAdmin
      .from("vehicle_analyses")
      .select("total_cost_chf,expected_margin_chf,deal_score")
      .eq("vehicle_id", vehicle.id)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const analysis = {
      total_cost_chf: analysisRow?.total_cost_chf ?? null,
      expected_margin_chf: analysisRow?.expected_margin_chf ?? null,
      deal_score: analysisRow?.deal_score ?? null,
    };

    const msg = buildTelegramMessage(vehicle, analysis, f);
    const r = await sendTelegramMessage(
      f.telegram_bot_token,
      f.telegram_chat_id,
      msg,
      vehicle.image_url ?? null,
    );
    return r;
  });

const FetchChatInput = z.object({ token: z.string().min(10) });

export const fetchTelegramChatId = createServerFn({ method: "POST" })
  .inputValidator((data) => FetchChatInput.parse(data))
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${data.token}/getUpdates`);
      const body = (await res.json()) as {
        ok?: boolean;
        result?: Array<{ message?: { chat?: { id?: number; first_name?: string } } }>;
        description?: string;
      };
      if (!body.ok) return { ok: false as const, error: body.description ?? "Telegram API error" };
      const updates = body.result ?? [];
      const last = updates[updates.length - 1];
      const id = last?.message?.chat?.id;
      if (!id) return { ok: false as const, error: "Noch keine Nachricht. Schreib dem Bot zuerst 'hallo'." };
      return { ok: true as const, chatId: String(id), name: last?.message?.chat?.first_name ?? null };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
