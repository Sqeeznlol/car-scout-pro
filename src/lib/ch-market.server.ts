// Schätzt den Schweizer Marktwert via AutoScout24.ch (Median ähnlicher Inserate).
// Nutzt Firecrawl, da AS24 Cloudflare-geschützt ist.

function slug(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function parsePrices(markdown: string): number[] {
  // Matcht "CHF 24'900", "CHF 24'900.–", "CHF 24 900", "CHF 24.900"
  const out: number[] = [];
  const re = /CHF[\s ]*([0-9][0-9'\u2019.\s]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const raw = m[1].replace(/[\s'\u2019.]/g, "");
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1500 && n <= 300000) out.push(n);
  }
  return out;
}

export interface ChMarketInput {
  make: string | null;
  model: string | null;
  year: number | null;
  mileage_km: number | null;
}

export interface ChMarketResult {
  market_value_chf: number;
  sample_size: number;
  source_url: string;
  raw_prices?: number[];
}

export async function estimateChMarketValue(v: ChMarketInput): Promise<ChMarketResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[ch-market] FIRECRAWL_API_KEY missing");
    return null;
  }
  if (!v.make) return null;

  const makeS = slug(v.make);
  const modelS = slug(v.model);
  const yearFrom = v.year ? v.year - 1 : undefined;
  const yearTo = v.year ? v.year + 1 : undefined;
  const kmFrom = v.mileage_km ? Math.max(0, Math.round(v.mileage_km * 0.6)) : undefined;
  const kmTo = v.mileage_km ? Math.round(v.mileage_km * 1.6) : undefined;

  const params = new URLSearchParams();
  if (yearFrom) params.set("firstRegistrationYearFrom", String(yearFrom));
  if (yearTo) params.set("firstRegistrationYearTo", String(yearTo));
  if (kmFrom !== undefined) params.set("vehicleMileageFrom", String(kmFrom));
  if (kmTo !== undefined) params.set("vehicleMileageTo", String(kmTo));
  params.set("sort", "price-asc");

  const path = modelS ? `${makeS}--${modelS}` : makeS;
  const url = `https://www.autoscout24.ch/de/autos/${path}?${params.toString()}`;

  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 1500,
      }),
    });
    if (!res.ok) {
      console.warn(`[ch-market] firecrawl ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }
    const data = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
    const md = data.data?.markdown ?? data.markdown ?? "";
    const prices = parsePrices(md);
    if (prices.length === 0) {
      console.warn(`[ch-market] no prices parsed for ${url}`);
      return { market_value_chf: 0, sample_size: 0, source_url: url, raw_prices: [] };
    }
    return {
      market_value_chf: median(prices),
      sample_size: prices.length,
      source_url: url,
      raw_prices: prices,
    };
  } catch (e) {
    console.warn(`[ch-market] error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
