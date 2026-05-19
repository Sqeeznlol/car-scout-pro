// AutoScout24.ch Marktvergleich – sucht ähnliche Fahrzeuge in der Schweiz
// und liefert Preisstatistik. Nutzt Firecrawl (Scrape + Search Fallback),
// da AS24 Cloudflare-geschützt ist.

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

/** Normalisiert Modellbezeichnung → erstes aussagekräftiges Token (z.B. "A4 Avant 2.0 TDI" → "A4"). */
function normalizeModel(model: string | null): string {
  if (!model) return "";
  const cleaned = model.trim().split(/[\s,/]+/)[0] ?? "";
  return cleaned.toLowerCase();
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Baut AutoScout24.ch-URL. Verwendet Pfad-Format /de/s/mk-<make>/md-<model>, das AS24 tatsächlich routet. */
export function buildAutoScoutChUrl(v: ChMarketInput, opts?: { wide?: boolean }): string {
  const wide = opts?.wide ?? false;
  const km = v.mileage_km ?? 0;
  const kmTol = wide ? 40000 : 25000;
  const yearTol = wide ? 4 : 2;
  const kmMin = Math.max(0, km - kmTol);
  const kmMax = km + kmTol;
  const yearMin = v.year ? v.year - yearTol : 0;
  const yearMax = v.year ? v.year + yearTol : 0;

  const makeSlug = v.make ? slug(v.make) : "";
  const modelSlug = normalizeModel(v.model);

  let base = "https://www.autoscout24.ch/de/autos";
  if (makeSlug && modelSlug) base = `https://www.autoscout24.ch/de/s/mk-${makeSlug}/md-${modelSlug}`;
  else if (makeSlug) base = `https://www.autoscout24.ch/de/s/mk-${makeSlug}`;

  const params = new URLSearchParams();
  if (v.mileage_km != null) {
    params.set("kmfrom", String(kmMin));
    params.set("kmto", String(kmMax));
  }
  if (v.year) {
    params.set("firstRegistrationYearFrom", String(yearMin));
    params.set("firstRegistrationYearTo", String(yearMax));
  }
  if (!wide) {
    const fuel = (v.fuel ?? "").toLowerCase();
    if (fuel.includes("diesel")) params.set("fuel", "D");
    else if (fuel.includes("benzin") || fuel.includes("petrol")) params.set("fuel", "B");
    else if (fuel.includes("elek") || fuel.includes("elect")) params.set("fuel", "E");
    else if (fuel.includes("hybrid")) params.set("fuel", "H");
  }
  params.set("vehtyp", "10");
  params.set("sort", "price");

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function parseChfPrices(markdown: string): number[] {
  const out: number[] = [];
  // "CHF 24'900", "CHF 24 900", "CHF 24'900.–", "CHF 24.900", "Fr. 24'900"
  const re = /(?:CHF|Fr\.)[\s ]*([0-9][0-9'\u2019.\s]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const raw = m[1].replace(/[\s'\u2019.]/g, "");
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 3000 && n <= 300000) out.push(n);
  }
  return out;
}

/** Robuste Statistik: Median ± entferne extreme Ausreißer (top/bottom 10%). */
function priceStats(prices: number[]): { avg: number; min: number; max: number; count: number } {
  if (prices.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const sorted = [...prices].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * 0.1);
  const trimmed = sorted.length >= 5 ? sorted.slice(cut, sorted.length - cut) : sorted;
  const sum = trimmed.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round(sum / trimmed.length),
    min: trimmed[0],
    max: trimmed[trimmed.length - 1],
    count: trimmed.length,
  };
}

async function firecrawlScrape(url: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 2500 }),
    });
    if (!res.ok) {
      console.warn(`[ch-market] firecrawl scrape ${res.status} for ${url}`);
      return "";
    }
    const data = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
    return data.data?.markdown ?? data.markdown ?? "";
  } catch (e) {
    console.warn(`[ch-market] scrape error: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}

async function firecrawlSearch(query: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 15,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (!res.ok) {
      console.warn(`[ch-market] firecrawl search ${res.status}`);
      return "";
    }
    const data = (await res.json()) as {
      data?: Array<{ markdown?: string; description?: string; title?: string }>;
    };
    const results = data.data ?? [];
    return results.map((r) => [r.title, r.description, r.markdown].filter(Boolean).join("\n")).join("\n\n");
  } catch (e) {
    console.warn(`[ch-market] search error: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}

export async function estimateChMarketValue(v: ChMarketInput): Promise<ChMarketResult | null> {
  if (!v.make) return null;
  const url = buildAutoScoutChUrl(v);
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("[ch-market] FIRECRAWL_API_KEY missing");
    return { url, count: 0, avg: 0, min: 0, max: 0 };
  }

  // 1) Scrape mit präzisen Filtern
  let md = await firecrawlScrape(url, apiKey);
  let prices = parseChfPrices(md);

  // 2) Fallback: Scrape mit weiteren Toleranzen, ohne Fuel
  if (prices.length < 3) {
    const wideUrl = buildAutoScoutChUrl(v, { wide: true });
    md = await firecrawlScrape(wideUrl, apiKey);
    prices = parseChfPrices(md);
  }

  // 3) Fallback: Firecrawl Search auf autoscout24.ch
  if (prices.length < 3) {
    const q = [
      "site:autoscout24.ch",
      v.make,
      normalizeModel(v.model),
      v.year ? String(v.year) : "",
    ].filter(Boolean).join(" ");
    const searchMd = await firecrawlSearch(q, apiKey);
    const more = parseChfPrices(searchMd);
    prices = prices.concat(more);
  }

  const stats = priceStats(prices);
  return { url, count: stats.count, avg: stats.avg, min: stats.min, max: stats.max };
}
