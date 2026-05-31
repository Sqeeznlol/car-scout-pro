import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listUserSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("user_sessions")
    .select("*")
    .order("last_seen", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});
