// Holt mobile.de Inserat-Daten über die Supabase Edge Function `fetch-mobile-de`
// (ersetzt den direkten Jina-Aufruf; Browser-CORS-Probleme entfallen).

export interface ListingDetails {
  has_mwst: boolean | null;
  netto_eur: number | null;
  location: string | null;     // "71088 Holzgerlingen" — Nominatim-kompatibel
  country_code: string | null; // "DE", "AT", etc.
  title: string | null;
  price_eur: number | null;
  signals: string[];
}

function cleanMobileUrl(listingUrl: string): string {
  try {
    const u = new URL(listingUrl);
    if (u.hostname.includes("click.news.mobile.de") || u.hostname.includes("link.news.mobile.de")) {
      return listingUrl; // tracking link — edge function folgt Redirects
    }
    const id = u.searchParams.get("id");
    if (id && u.pathname.includes("/fahrzeuge/details.html")) {
      return `https://suchen.mobile.de/fahrzeuge/details.html?id=${id}`;
    }
  } catch {
    /* keep original */
  }
  return listingUrl;
}

function edgeFunctionUrl(): string {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL not configured");
  return `${base.replace(/\/+$/, "")}/functions/v1/fetch-mobile-de`;
}

export async function fetchListingDetails(listingUrl: string): Promise<ListingDetails> {
  const result: ListingDetails = {
    has_mwst: null,
    netto_eur: null,
    location: null,
    country_code: null,
    title: null,
    price_eur: null,
    signals: [],
  };
  if (!listingUrl || !/mobile\.de/i.test(listingUrl)) return result;

  const cleanUrl = cleanMobileUrl(listingUrl);

  try {
    const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const res = await fetch(edgeFunctionUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { apikey: apiKey, Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ url: cleanUrl }),
    });

    if (!res.ok) {
      result.signals.push(`edge_status_${res.status}`);
      return result;
    }

    const data = (await res.json()) as Partial<{
      title: string | null;
      price_eur: number | null;
      location: string | null;
      country_code: string | null;
      has_mwst: boolean | null;
      netto_eur: number | null;
      signals: string[];
      error: string;
    }>;

    if (data.error) {
      result.signals.push(`edge_error:${data.error.slice(0, 60)}`);
      return result;
    }

    result.title = data.title ?? null;
    result.price_eur = typeof data.price_eur === "number" ? data.price_eur : null;
    result.location = data.location ?? null;
    result.country_code = data.country_code ?? null;
    result.has_mwst = data.has_mwst ?? null;
    result.netto_eur = typeof data.netto_eur === "number" ? data.netto_eur : null;
    if (Array.isArray(data.signals)) result.signals.push(...data.signals);

    return result;
  } catch (e) {
    result.signals.push(`fetch_error:${e instanceof Error ? e.message.slice(0, 50) : "unknown"}`);
    return result;
  }
}

// Alias für Rückwärtskompatibilität
export const detectMwStFromListing = async (url: string) => {
  const r = await fetchListingDetails(url);
  return { has_mwst: r.has_mwst, signals: r.signals, raw_excerpt: null };
};
