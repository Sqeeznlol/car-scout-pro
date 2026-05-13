// AutoScout24.ch Marktvergleich – sucht ähnliche Fahrzeuge in der Schweiz
// (gleiche Marke/Modell, ±20'000 km, ±2 Jahre) und liefert Preisstatistik.
// Nutzt Firecrawl, da AS24 Cloudflare-geschützt ist.

export interface ChMarketInput {
  make: string | null;
  model: string | null;
  year: number | null;
  mileage_km: number | null;
  fuel?: string | null;
}

export interface ChMarketResult {
  url: string;
  count: number;
  avg: number;
  min: number;
  max: number;
}

export function buildAutoScoutChUrl(v: ChMarketInput): string {
  const km = v.mileage_km ?? 0;
  const kmMin = Math.max(0, km - 20000);
  const kmMax = km + 20000;
  const yearMin = v.year ? v.year - 2 : 0;
  const yearMax = v.year ? v.year + 2 : 0;

  const params = new URLSearchParams();
  if (v.make) params.set("make", v.make);
  if (v.model) params.set("model", v.model);
  params.set("cy", "CH");
  if (v.mileage_km != null) {
    params.set("kmfrom", String(kmMin));
    params.set("kmto", String(kmMax));
  }
  if (v.year) {
    params.set("yearfrom", String(yearMin));
    params.set("yearto", String(yearMax));
  }
  const fuel = (v.fuel ?? "").toLowerCase();
  if (fuel.includes("diesel")) params.set("fuel", "D");
  else if (fuel.includes("benzin") || fuel.includes("petrol")) params.set("fuel", "B");
  params.set("ustate", "U,N");
  params.set("sort", "price");
  params.set("atype", "C");

  return `https://www.autoscout24.ch/de/autos?${params.toString()}`;
}

function parseChfPrices(markdown: string): number[] {
  const out: number[] = [];
  // Matches "CHF 24'900", "CHF 24 900", "CHF 24'900.–", "CHF 24.900"
  const re = /CHF[\s ]*([0-9][0-9'\u2019.\s]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const raw = m[1].replace(/[\s'\u2019.]/g, "");
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 5000 && n <= 200000) out.push(n);
  }
  return out;
}

export async function estimateChMarketValue(v: ChMarketInput): Promise<ChMarketResult | null> {
  if (!v.make) return null;
  const url = buildAutoScoutChUrl(v);
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[ch-market] FIRECRAWL_API_KEY missing");
    return { url, count: 0, avg: 0, min: 0, max: 0 };
  }

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
      console.warn(`[ch-market] firecrawl ${res.status}`);
      return { url, count: 0, avg: 0, min: 0, max: 0 };
    }
    const data = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
    const md = data.data?.markdown ?? data.markdown ?? "";
    const prices = parseChfPrices(md);
    if (prices.length === 0) return { url, count: 0, avg: 0, min: 0, max: 0 };
    const sum = prices.reduce((a, b) => a + b, 0);
    return {
      url,
      count: prices.length,
      avg: Math.round(sum / prices.length),
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  } catch (e) {
    console.warn(`[ch-market] error: ${e instanceof Error ? e.message : String(e)}`);
    return { url, count: 0, avg: 0, min: 0, max: 0 };
  }
}
