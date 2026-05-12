import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildTelegramMessage,
  sendTelegramMessage,
  type TelegramFilter,
} from "./telegram.server";

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
    const sample = {
      id: "demo",
      make: "BMW",
      model: "320d",
      year: 2021,
      mileage_km: 87000,
      price_eur: 27500,
      fuel: "Diesel",
      transmission: "Automatik",
      location: "München",
      seller_name: "BMW Autohaus München",
      seller_type: "dealer",
      listing_url: "https://www.mobile.de/",
      distance_km: 330,
    };
    const analysis = { total_cost_chf: 34200, expected_margin_chf: 4800, deal_score: 82 };
    const msg = buildTelegramMessage(sample, analysis, f);
    const r = await sendTelegramMessage(f.telegram_bot_token, f.telegram_chat_id, msg);
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
