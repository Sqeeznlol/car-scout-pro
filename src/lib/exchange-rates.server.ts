import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface BazgRateResult {
  rate: number;
  source: "BAZG" | "cache" | "fallback";
  date: string;
}

const BAZG_URL = "https://www.backend-rates.bazg.admin.ch/api/xmldaily?locale=de";
const FALLBACK_RATE = 0.96;

function parseBazgXml(xml: string, currencyCode: string): { rate: number; date: string } | null {
  const dateMatch = /datum="([^"]+)"/.exec(xml);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

  const codePattern = new RegExp(
    `<devise[^>]+code="${currencyCode}"[^>]*>([\\s\\S]*?)</devise>`,
    "i",
  );
  const block = codePattern.exec(xml);
  if (!block) return null;

  const kursMatch = /<kurs>([\d.]+)<\/kurs>/.exec(block[1]);
  const wertMatch = /<waehrung>(\d+)\s*[A-Z]+<\/waehrung>/i.exec(block[1]);
  if (!kursMatch) return null;

  const raw = parseFloat(kursMatch[1]);
  // BAZG quotes per N units (usually 1 EUR, but e.g. 100 JPY). Normalize per-unit.
  const units = wertMatch ? Math.max(1, parseInt(wertMatch[1], 10)) : 1;
  const rate = raw / units;
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return { rate, date };
}

export async function getEurChfRate(): Promise<BazgRateResult> {
  const today = new Date().toISOString().slice(0, 10);

  // 1) Cache hit for today (BAZG only)
  const { data: cached } = await supabaseAdmin
    .from("exchange_rates")
    .select("rate_chf, valid_date, source")
    .eq("currency_code", "EUR")
    .eq("valid_date", today)
    .maybeSingle();

  if (cached && cached.source === "BAZG") {
    return { rate: Number(cached.rate_chf), source: "cache", date: cached.valid_date };
  }

  // 2) Fetch BAZG
  try {
    const res = await fetch(BAZG_URL, {
      headers: { Accept: "application/xml,text/xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`BAZG HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = parseBazgXml(xml, "EUR");
    if (!parsed) throw new Error("EUR rate not found in BAZG response");

    await supabaseAdmin
      .from("exchange_rates")
      .upsert(
        {
          currency_code: "EUR",
          rate_chf: parsed.rate,
          valid_date: parsed.date,
          fetched_at: new Date().toISOString(),
          source: "BAZG",
        },
        { onConflict: "currency_code,valid_date" },
      );

    return { rate: parsed.rate, source: "BAZG", date: parsed.date };
  } catch (e) {
    console.warn("[exchange-rates] BAZG fetch failed:", e instanceof Error ? e.message : String(e));

    // 3) Most recent cached
    const { data: latest } = await supabaseAdmin
      .from("exchange_rates")
      .select("rate_chf, valid_date")
      .eq("currency_code", "EUR")
      .order("valid_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      return { rate: Number(latest.rate_chf), source: "cache", date: latest.valid_date };
    }

    // 4) Hardcoded fallback
    return { rate: FALLBACK_RATE, source: "fallback", date: today };
  }
}
