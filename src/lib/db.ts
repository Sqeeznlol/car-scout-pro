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
    .eq("extension_archived", false)
    .eq("pending_review", false)
    .eq("seller_has_mwst", true)
    .or("country_code.eq.DE,country_code.is.null")
    .order("received_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    const analysis = Array.isArray(r.analysis) ? (r.analysis[0] ?? null) : (r.analysis ?? null);
    const decision = Array.isArray(r.decision) ? (r.decision[0] ?? null) : (r.decision ?? null);
    return { ...(row as DbVehicle), analysis: analysis as DbAnalysis | null, decision: decision as DbDecision | null };
  });
}

export async function fetchPendingReview(): Promise<VehicleWithAnalysis[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, analysis:vehicle_analyses(*)")
    .eq("pending_review", true)
    .eq("confirmed_no_netto", false)
    .is("skip_reason", null)
    .order("price_eur", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    const analysis = Array.isArray(r.analysis) ? (r.analysis[0] ?? null) : (r.analysis ?? null);
    return { ...(row as DbVehicle), analysis: analysis as DbAnalysis | null, decision: null };
  });
  // Sekundär-Sort: ohne Preis → nach Luxus-Marke (Ferrari, Lambo, …)
  const luxuryRank: Record<string, number> = {
    bugatti: 1, koenigsegg: 2, pagani: 3, ferrari: 4, lamborghini: 5,
    "rolls-royce": 6, rollsroyce: 6, mclaren: 7, bentley: 8,
    "aston martin": 9, astonmartin: 9, maserati: 10, porsche: 11,
    maybach: 12, lotus: 13, "mercedes-amg": 14, "mercedes-benz": 15,
    mercedes: 15, audi: 16, bmw: 17, jaguar: 18,
    "land rover": 19, landrover: 19,
  };
  const rank = (m: string | null | undefined) => luxuryRank[(m ?? "").toLowerCase().trim()] ?? 999;
  return rows.sort((a, b) => {
    const ap = a.price_eur != null;
    const bp = b.price_eur != null;
    if (ap && bp) return Number(b.price_eur) - Number(a.price_eur);
    if (ap !== bp) return ap ? -1 : 1;
    return rank(a.make) - rank(b.make);
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
