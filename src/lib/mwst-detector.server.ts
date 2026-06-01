// Liest mobile.de Inserate über Jina AI Reader (gratis, umgeht Bot-Schutz).
// Extrahiert MwSt-Status, Netto-Preis, Standort (PLZ+Stadt) und Land.

export interface ListingDetails {
  has_mwst: boolean | null;
  netto_eur: number | null;
  location: string | null;   // "71088 Holzgerlingen" — Nominatim-kompatibel
  country_code: string | null; // "DE", "AT", etc.
  signals: string[];
}

function parseEuroAmount(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function extractExplicitNetto(text: string): number | null {
  const patterns = [
    /([\d.'’\s]+(?:[.,]\d{2})?)\s*€\s*\(\s*Netto\s*\)(?:[,\s]*(\d+)\s*%\s*MwSt)?/i,
    /(?:Netto(?:preis)?|Preis\s*\(\s*Netto\s*\)|Netto\s*:)\s*[:\-]?\s*([\d.'’\s]+(?:[.,]\d{2})?)\s*€?/i,
    /([\d.'’\s]+(?:[.,]\d{2})?)\s*€\s*netto\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    const netto = parseEuroAmount(m?.[1]);
    if (netto && netto >= 500 && netto <= 10_000_000) return netto;
  }
  return null;
}

export async function fetchListingDetails(listingUrl: string): Promise<ListingDetails> {
  const result: ListingDetails = {
    has_mwst: null,
    netto_eur: null,
    location: null,
    country_code: null,
    signals: [],
  };
  if (!listingUrl || !/mobile\.de/i.test(listingUrl)) return result;

  let cleanUrl = listingUrl;
  try {
    const u = new URL(listingUrl);
    if (u.hostname.includes("click.news.mobile.de") || u.hostname.includes("link.news.mobile.de")) {
      // tracking link — Jina folgt Redirects, also OK
    } else {
      const id = u.searchParams.get("id");
      if (id && u.pathname.includes("/fahrzeuge/details.html")) {
        cleanUrl = `https://suchen.mobile.de/fahrzeuge/details.html?id=${id}`;
      }
    }
  } catch {
    /* keep original */
  }

  const jinaUrl = `https://r.jina.ai/${cleanUrl}`;
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "X-Locale": "de-DE",
      },
    });
    if (!res.ok) {
      result.signals.push(`jina_status_${res.status}`);
      return result;
    }
    const text = await res.text();
    if (!text || text.length < 200) {
      result.signals.push("empty_response");
      return result;
    }

    // 1) MwSt-Erkennung
    const netto = extractExplicitNetto(text);
    if (netto) {
      result.has_mwst = true;
      result.netto_eur = netto;
      result.signals.push(`netto_explicit:${netto}`);
    }
    if (result.has_mwst === null) {
      if (/MwSt\.?\s*ausweisbar|MwSt\.?\s*ausgewiesen|zzgl\.?\s*\d+\s*%?\s*MwSt|exkl\.?\s*MwSt|Nettopreis|netto\s*(?:zzgl|exkl|\+|,\s*\d+\s*%)/i.test(text)) {
        result.has_mwst = true;
        result.signals.push("mwst_keyword");
      }
    }
    if (/§\s*25\s*a|Differenzbesteu/i.test(text)) {
      if (result.has_mwst !== true) {
        result.has_mwst = false;
        result.signals.push("§25a");
      }
    }

    // 2) Standort + Land aus "DE-71088 Holzgerlingen"
    const addrMatch = /\b(DE|AT|CH|IT|FR|NL|BE|LU|DK|PL|CZ|ES|PT|SE|NO|FI|HU|SK|SI|HR)-(\d{4,5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-\s]{2,40}?)(?=\s*[,\n<•|·]|\s*$|\s*\d|\s+Tel)/.exec(text);
    if (addrMatch) {
      result.country_code = addrMatch[1];
      result.location = `${addrMatch[2]} ${addrMatch[3].trim()}`.replace(/\s+/g, " ");
      result.signals.push(`addr:${result.country_code}`);
    }

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
