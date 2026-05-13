import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type DbVehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type DbAnalysis = Database["public"]["Tables"]["vehicle_analyses"]["Row"];
export type DbDecision = Database["public"]["Tables"]["decisions"]["Row"];
export type DbConfig = Database["public"]["Tables"]["app_config"]["Row"];
export type DecisionValue = Database["public"]["Enums"]["decision_type"];

export interface VehicleWithAnalysis extends DbVehicle {
  analysis: DbAnalysis | null;
  decision: DbDecision | null;
}

export async function fetchVehicles(): Promise<VehicleWithAnalysis[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, analysis:vehicle_analyses(*), decision:decisions(*)")
    .is("skip_reason", null)
    .order("received_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  // Supabase nests joined relations as arrays in some cases; normalize.
  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    const analysis = Array.isArray(r.analysis) ? (r.analysis[0] ?? null) : (r.analysis ?? null);
    const decision = Array.isArray(r.decision) ? (r.decision[0] ?? null) : (r.decision ?? null);
    return { ...(row as DbVehicle), analysis: analysis as DbAnalysis | null, decision: decision as DbDecision | null };
  });
}

export async function fetchVehicle(id: string): Promise<VehicleWithAnalysis | null> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, analysis:vehicle_analyses(*), decision:decisions(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const analysis = Array.isArray(r.analysis) ? (r.analysis[0] ?? null) : (r.analysis ?? null);
  const decision = Array.isArray(r.decision) ? (r.decision[0] ?? null) : (r.decision ?? null);
  return { ...(data as DbVehicle), analysis: analysis as DbAnalysis | null, decision: decision as DbDecision | null };
}

export async function recordDecision(vehicleId: string, decision: DecisionValue, notes?: string) {
  const { error } = await supabase
    .from("decisions")
    .upsert({ vehicle_id: vehicleId, decision, notes: notes ?? null, decided_at: new Date().toISOString() }, { onConflict: "vehicle_id" });
  if (error) throw error;
}

export async function undoDecision(vehicleId: string) {
  const { error } = await supabase.from("decisions").delete().eq("vehicle_id", vehicleId);
  if (error) throw error;
}

export async function fetchConfig(): Promise<DbConfig> {
  const { data, error } = await supabase.from("app_config").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

export async function saveConfig(patch: Partial<DbConfig>) {
  const { error } = await supabase
    .from("app_config")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}
