// Lädt die mobile.de Inserat-Seite und prüft ob MwSt ausweisbar ist.
// Komplett kostenlos via fetch(). Server-side only.

export interface MwStDetectionResult {
  has_mwst: boolean | null; // true = ausweisbar, false = §25a/keine, null = unklar
  signals: string[];
  raw_excerpt: string | null;
}

const POSITIVE_PATTERNS = [
  /MwSt\.?\s*ausweisbar/i,
  /MwSt\.?\s*ausgewiesen/i,
  /MwSt\.?\s*reg(\.?|ulär)/i,
  /netto\s*\(zzgl\.\s*MwSt\.?\)/i,
  /zzgl\.\s*\d+\s*%\s*MwSt/i,
  /Nettopreis/i,
  /Brutto:\s*[\d.,]+\s*€\s*\(Netto/i,
  /Differenzbesteuert.*nein/i,
];

const NEGATIVE_PATTERNS = [
  /§\s*25\s*a/i,
  /Differenzbesteuert/i,
  /Differenzbesteuerung/i,
  /MwSt\.?\s*nicht\s*ausweisbar/i,
  /keine\s*MwSt\.?\s*ausweisbar/i,
];

export async function detectMwStFromListing(listingUrl: string): Promise<MwStDetectionResult> {
  const result: MwStDetectionResult = { has_mwst: null, signals: [], raw_excerpt: null };
  if (!listingUrl || !/mobile\.de/i.test(listingUrl)) return result;

  try {
    const res = await fetch(listingUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return result;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");

    const positives = POSITIVE_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
    const negatives = NEGATIVE_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);

    const mwstMatch = /[^.]{0,80}MwSt[^.]{0,80}/i.exec(text);
    result.raw_excerpt = mwstMatch ? mwstMatch[0].trim().slice(0, 300) : null;

    if (positives.length > 0 && negatives.length === 0) {
      result.has_mwst = true;
      result.signals = positives;
    } else if (negatives.length > 0 && positives.length === 0) {
      result.has_mwst = false;
      result.signals = negatives;
    } else if (positives.length > 0 && negatives.length > 0) {
      result.has_mwst = false;
      result.signals = [...negatives, "(konflikt mit positiven Signalen)"];
    }
    return result;
  } catch {
    return result;
  }
}
