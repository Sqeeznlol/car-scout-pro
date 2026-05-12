// Telegram notification helpers (server-only).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const fmtChf = (n: number) =>
  "CHF " + new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(n);
const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(n) + " €";
const fmtKm = (n: number) =>
  new Intl.NumberFormat("de-CH").format(n) + " km";

// MarkdownV2 needs these escaped.
function esc(s: string | number | null | undefined): string {
  return String(s ?? "").replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (m) => "\\" + m);
}

export interface TelegramFilter {
  id: string;
  name: string;
  is_active: boolean;
  makes: string[];
  models: string[];
  max_mileage: number | null;
  max_price_eur: number | null;
  min_margin_chf: number | null;
  min_deal_score: number | null;
  fuel_types: string[];
  telegram_bot_token: string;
  telegram_chat_id: string;
}

interface VehicleLite {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage_km: number | null;
  price_eur: number | null;
  fuel: string | null;
  transmission: string | null;
  location: string | null;
  seller_name: string | null;
  seller_type: string | null;
  listing_url: string | null;
  distance_km: number | null;
}

interface AnalysisLite {
  total_cost_chf: number | null;
  expected_margin_chf: number | null;
  deal_score: number | null;
}

export function vehicleMatchesFilter(
  v: VehicleLite,
  a: AnalysisLite,
  f: TelegramFilter,
): boolean {
  if (!f.is_active || !f.telegram_chat_id) return false;
  if (f.makes.length > 0) {
    const make = (v.make ?? "").toLowerCase();
    if (!f.makes.some((m) => make.includes(m.toLowerCase()))) return false;
  }
  if (f.models.length > 0) {
    const model = (v.model ?? "").toLowerCase();
    if (!f.models.some((m) => model.includes(m.toLowerCase()))) return false;
  }
  if (f.max_mileage != null && (v.mileage_km ?? Infinity) > f.max_mileage) return false;
  if (f.max_price_eur != null && (v.price_eur ?? Infinity) > f.max_price_eur) return false;
  if (f.min_margin_chf != null && (a.expected_margin_chf ?? -Infinity) < f.min_margin_chf) return false;
  if (f.min_deal_score != null && (a.deal_score ?? -Infinity) < f.min_deal_score) return false;
  if (f.fuel_types.length > 0) {
    const fuel = (v.fuel ?? "").toLowerCase();
    if (!f.fuel_types.some((t) => fuel.includes(t.toLowerCase()))) return false;
  }
  return true;
}

export function buildTelegramMessage(
  v: VehicleLite,
  a: AnalysisLite,
  f: TelegramFilter,
): string {
  const score = a.deal_score ?? 0;
  const scoreEmoji = score >= 80 ? "🔥" : score >= 65 ? "⭐" : "📋";
  const margin = a.expected_margin_chf ?? 0;
  const marginEmoji = margin >= 4000 ? "💰" : "💵";

  const lines: string[] = [];
  if (f.makes.length > 0) lines.push(`✅ Marke: ${esc(v.make ?? "")}`);
  if (f.max_mileage != null && v.mileage_km != null)
    lines.push(`✅ ${esc(fmtKm(v.mileage_km))} \\(Max: ${esc(fmtKm(f.max_mileage))}\\)`);
  if (f.max_price_eur != null && v.price_eur != null)
    lines.push(`✅ ${esc(fmtEur(v.price_eur))} \\(Max: ${esc(fmtEur(f.max_price_eur))}\\)`);
  if (f.min_margin_chf != null)
    lines.push(`✅ Marge ${esc(fmtChf(margin))} \\(Min: ${esc(fmtChf(f.min_margin_chf))}\\)`);
  if (f.min_deal_score != null)
    lines.push(`✅ Score ${esc(score)}/100 \\(Min: ${esc(f.min_deal_score)}\\)`);
  if (f.fuel_types.length > 0) lines.push(`✅ Treibstoff: ${esc(v.fuel ?? "")}`);

  const dist = v.distance_km != null ? `${Math.round(v.distance_km)} km` : "—";
  const totalCost = a.total_cost_chf ?? 0;

  return (
    `${scoreEmoji} *DEIN WUNSCHAUTO IST DA\\!*\n\n` +
    `🚗 *${esc(v.make ?? "")} ${esc(v.model ?? "")}* ${esc(v.year ?? "")}\n` +
    `📏 ${esc(fmtKm(v.mileage_km ?? 0))} · ${esc(v.fuel ?? "")} · ${esc(v.transmission ?? "")}\n\n` +
    `💶 Preis: *${esc(fmtEur(v.price_eur ?? 0))}*\n` +
    `📦 Einstandspreis CH: *${esc(fmtChf(totalCost))}*\n` +
    `${marginEmoji} Erwartete Marge: *${esc(fmtChf(margin))}*\n` +
    `⭐ Deal Score: *${esc(score)}/100*\n\n` +
    `📍 ${esc(v.location ?? "")} → Kloten: ${esc(dist)}\n` +
    `🏷️ ${v.seller_type === "dealer" ? "Händler" : "Privat"}: ${esc(v.seller_name ?? "")}\n\n` +
    `*Deine Kriterien erfüllt:*\n${lines.join("\n")}\n\n` +
    (v.listing_url ? `[👉 Inserat öffnen](${esc(v.listing_url)})` : "")
  );
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function notifyMatchingFilters(
  vehicle: VehicleLite,
  analysis: AnalysisLite,
): Promise<void> {
  const { data: filters } = await supabaseAdmin
    .from("notification_filters")
    .select("*")
    .eq("is_active", true)
    .neq("telegram_chat_id", "");

  const list = (filters ?? []) as unknown as TelegramFilter[];
  let anySent = false;
  for (const f of list) {
    if (!vehicleMatchesFilter(vehicle, analysis, f)) continue;
    const msg = buildTelegramMessage(vehicle, analysis, f);
    const r = await sendTelegramMessage(f.telegram_bot_token, f.telegram_chat_id, msg);
    if (r.ok) anySent = true;
    else console.error("[telegram]", f.id, r.error);
  }
  if (anySent) {
    await supabaseAdmin
      .from("vehicles")
      .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
      .eq("id", vehicle.id);
  }
}
