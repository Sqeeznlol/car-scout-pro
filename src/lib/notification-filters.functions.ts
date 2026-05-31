import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const FilterInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  is_active: z.boolean(),
  makes: z.array(z.string().min(1).max(60)).max(50),
  models: z.array(z.string().min(1).max(60)).max(100),
  max_mileage: z.number().int().nullable(),
  max_price_eur: z.number().int().nullable(),
  min_margin_chf: z.number().int().nullable(),
  min_deal_score: z.number().int().nullable(),
  fuel_types: z.array(z.string().min(1).max(40)).max(20),
  telegram_bot_token: z.string().max(200),
  telegram_chat_id: z.string().max(64),
});

export const getMyNotificationFilter = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("notification_filters")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});

export const saveMyNotificationFilter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FilterInput.parse(d))
  .handler(async ({ data }) => {
    const payload = { ...data, updated_at: new Date().toISOString() };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("notification_filters")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { id: _omit, ...insertPayload } = payload;
    const { data: row, error } = await supabaseAdmin
      .from("notification_filters")
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
