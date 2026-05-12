// Parser for mobile.de search-subscription email payloads.
// Inputs: Gmail message in `full` format (server-side).
// Output: 0..N vehicle records ready to insert.

export interface ParsedListing {
  source_message_id: string;
  listing_url: string | null;
  title: string;
  make: string | null;
  model: string | null;
  year: number | null;
  registration_month: number | null;
  mileage_km: number | null;
  price_eur: number | null;
  fuel: string | null;
  transmission: string | null;
  power_kw: number | null;
  power_ps: number | null;
  consumption: string | null;
  co2_gkm: number | null;
  emission_class: string | null;
  location: string | null;
  seller_name: string | null;
  seller_type: string | null;
  image_url: string | null;
  raw_text: string;
  received_at: string | null;
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  try {
    // atob produces latin1; convert to UTF-8
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
}

function collectParts(part: GmailPart, acc: { html: string[]; text: string[] }) {
  if (part.body?.data) {
    const decoded = b64urlDecode(part.body.data);
    if (part.mimeType === "text/html") acc.html.push(decoded);
    else if (part.mimeType === "text/plain") acc.text.push(decoded);
  }
  if (part.parts) for (const p of part.parts) collectParts(p, acc);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&euro;/g, "€")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 10)); } catch { return " "; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; }
    })
    .replace(/&[a-zA-Z]+;/g, " ");
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<\/?[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

// Match any *.mobile.de URL (incl. click.news.mobile.de tracking links)
const LINK_RE = /https?:\/\/[a-z0-9.-]*mobile\.de\/[^\s"'<>)]+/gi;
const PRICE_RE = /€\s*([\d.]{3,})|EUR\s*([\d.]{3,})|([\d]{1,3}(?:[.\s]\d{3})+)\s*€/g;
const MILEAGE_RE = /([\d]{1,3}(?:[.\s]\d{3})*)\s*km/gi;
const YEAR_RE = /\b(EZ|Erstzulassung)[:\s.]*([0-9]{1,2}\/)?([12][0-9]{3})\b/gi;
const POWER_RE = /([\d]{2,3})\s*kW(?:\s*\(([\d]+)\s*PS\))?/i;
const IMG_RE = /<img[^>]+src=["']([^"']+)["']/gi;

const KNOWN_MAKES = [
  "BMW","Mercedes-Benz","Mercedes","Audi","Volkswagen","VW","Porsche","Opel","Skoda","Škoda",
  "Seat","Cupra","Ford","Toyota","Lexus","Honda","Hyundai","Kia","Mazda","Nissan",
  "Renault","Peugeot","Citroen","Citroën","Fiat","Alfa Romeo","Jaguar","Land Rover",
  "Range Rover","Volvo","Mini","Smart","Tesla","Polestar","Dacia","Suzuki","Subaru",
  "Mitsubishi","Jeep","Chrysler","Maserati","Ferrari","Lamborghini","Aston Martin",
];

function detectMake(title: string): string | null {
  const upper = title;
  for (const m of KNOWN_MAKES) {
    const re = new RegExp(`\\b${m.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (re.test(upper)) return m === "VW" ? "Volkswagen" : m;
  }
  return null;
}

function detectFuel(text: string): string | null {
  const t = text.toLowerCase();
  if (/elektro|electric|\bbev\b/.test(t)) return "Electric";
  if (/plug-?in|phev/.test(t)) return "Plug-in Hybrid";
  if (/hybrid/.test(t)) return "Hybrid";
  if (/diesel|tdi|cdi|hdi|bluetec/.test(t)) return "Diesel";
  if (/benzin|petrol|gasoline|tsi|tfsi/.test(t)) return "Petrol";
  return null;
}

function detectTransmission(text: string): string | null {
  const t = text.toLowerCase();
  if (/automatik|automatic|dsg|s-tronic|tiptronic|pdk/.test(t)) return "Automatic";
  if (/schaltgetriebe|manual|handschalt/.test(t)) return "Manual";
  return null;
}

function detectLocation(text: string): string | null {
  // Look for "Standort: X" or "PLZ Stadt"
  const m1 = /Standort[:\s]+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-.\s]{2,40})/.exec(text);
  if (m1) return m1[1].trim().replace(/\s+/g, " ");
  const m2 = /\b\d{5}\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]{2,30})/.exec(text);
  if (m2) return m2[1];
  return null;
}

interface ListingChunk {
  block: string;
  url: string | null;
  image: string | null;
}

// Splits a long email body into per-listing chunks. Each mobile.de email
// contains exactly one `<a href=URL>Details anzeigen</a>` per listing — that
// anchor is the authoritative source for both the listing URL and the
// surrounding block boundary.
function splitIntoListings(_text: string, html: string): ListingChunk[] {
  const ANCHOR_RE = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:[^<]|<(?!\/a>))*?Details anzeigen/gi;
  const anchors: Array<{ url: string; idx: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    anchors.push({ url: m[1], idx: m.index ?? 0, end: ANCHOR_RE.lastIndex });
  }
  if (anchors.length === 0) return [];

  // Listing photos are the classistatic.de images. They appear shortly before
  // the corresponding "Details anzeigen" link.
  const listingImgs = Array.from(html.matchAll(IMG_RE))
    .map((i) => ({ idx: i.index ?? 0, src: i[1] }))
    .filter((i) => /classistatic|mo-prod/i.test(i.src));

  const out: ListingChunk[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const prevEnd = i === 0 ? 0 : anchors[i - 1].end;
    const nextStart = i + 1 < anchors.length ? anchors[i + 1].idx : Math.min(html.length, anchors[i].end + 1500);
    const titleHtml = html.slice(prevEnd, anchors[i].idx);
    const specsHtml = html.slice(anchors[i].end, nextStart);
    const titlePart = stripHtml(titleHtml);
    const specsPart = stripHtml(specsHtml);
    const block = `${titlePart} ||| ${specsPart}`;
    // Closest listing image preceding (or just after) the anchor
    const img =
      [...listingImgs].reverse().find((im) => im.idx < anchors[i].idx) ??
      listingImgs.find((im) => im.idx > anchors[i].idx) ??
      null;
    // Remove this image from future candidates so each listing gets a unique one
    if (img) {
      const idx = listingImgs.indexOf(img);
      if (idx >= 0) listingImgs.splice(idx, 1);
    }
    out.push({ block, url: anchors[i].url, image: img?.src ?? null });
  }
  return out;
}

const REG_DATE_RE = /\b(0?[1-9]|1[0-2])\/((?:19|20)\d{2})\b/;
const CO2_RE = /(\d{1,3})\s*g\s*CO[₂2]\/km/i;
const EMISSION_RE = /CO[₂2]-Klasse\s+([A-G])/i;
const CONSUMPTION_RE = /(\d{1,2}[,.]\d\s*l\/100\s*km(?:\s*\([^)]+\))?)/i;


function pickPrice(block: string): number | null {
  PRICE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const candidates: number[] = [];
  while ((m = PRICE_RE.exec(block)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3];
    if (!raw) continue;
    const n = parseNumber(raw);
    if (n && n >= 1000 && n <= 500000) candidates.push(n);
  }
  if (!candidates.length) return null;
  return candidates[0];
}

function pickMileage(block: string): number | null {
  MILEAGE_RE.lastIndex = 0;
  const matches: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = MILEAGE_RE.exec(block)) !== null) {
    const n = parseNumber(m[1]);
    if (n && n > 100 && n < 600000) matches.push(n);
  }
  return matches.length ? matches[0] : null;
}

function pickYear(block: string): number | null {
  YEAR_RE.lastIndex = 0;
  const m = YEAR_RE.exec(block);
  if (m && m[3]) {
    const y = parseInt(m[3], 10);
    if (y >= 1990 && y <= new Date().getFullYear() + 1) return y;
  }
  // Fallback: any 4-digit year that looks plausible
  const m2 = /\b(20[0-2]\d)\b/.exec(block);
  return m2 ? parseInt(m2[1], 10) : null;
}

function pickTitle(block: string, make: string | null): string {
  const head = block.split("|||")[0] ?? block;
  // Cut at price marker
  let beforePrice = head.split(/\d{1,3}(?:[.\s]\d{3})+\s*€/)[0]?.trim() ?? head;
  // Strip spec-like prefixes that bled in from the previous listing
  beforePrice = beforePrice
    .replace(/^.*?CO[₂2]-Klasse\s+[A-Z](?:\s*\([^)]*\))?,?/i, "")
    .replace(/^.*?\d{1,3}\s*g\s*CO[₂2]\/km[^,]*,?/i, "")
    .replace(/^.*?\d+,\d+\s*l\/100\s*km[^,]*,?/i, "")
    .replace(/^.*?\d{2,3}\s*kW\s*\(\d+\s*PS\)[^,]*,?/i, "")
    .replace(/^.*?(?:Benzin|Diesel|Hybrid|Elektro)\b,?/i, "")
    .replace(/^[\s,]+/, "")
    .trim();
  const parts = beforePrice.split(/[⟩>›»]/).map((s) => s.trim()).filter(Boolean);
  const candidate = parts[parts.length - 1] || beforePrice;
  if (make && !candidate.toLowerCase().includes(make.toLowerCase())) {
    return `${make} ${candidate}`.slice(0, 200);
  }
  return candidate.slice(0, 200) || head.slice(0, 80);
}

export function parseGmailMessage(message: {
  id: string;
  internalDate?: string;
  payload?: GmailPart;
}): ParsedListing[] {
  if (!message.payload) return [];
  const acc = { html: [] as string[], text: [] as string[] };
  collectParts(message.payload, acc);
  const html = acc.html.join("\n");
  const text = acc.text.join("\n") || stripHtml(html);
  if (!html && !text) return [];

  const blocks = splitIntoListings(text, html || `<html>${text}</html>`);
  if (blocks.length === 0) return [];

  const internal = message.internalDate ? new Date(parseInt(message.internalDate, 10)).toISOString() : null;

  const listings: ParsedListing[] = [];
  for (const b of blocks) {
    const [titlePart = "", specsPart = ""] = b.block.split("|||").map((s) => s.trim());
    const title = pickTitle(b.block, detectMake(titlePart));
    const make = detectMake(title) ?? detectMake(titlePart);
    // Price lives in titlePart (before the "Details anzeigen" CTA)
    const price = pickPrice(titlePart) ?? pickPrice(b.block);
    // Specs (km, year, kW, fuel) live in specsPart (after the CTA)
    const mileage = pickMileage(specsPart);
    const year = pickYear(specsPart);
    const fuel = detectFuel(specsPart);
    const transmission = detectTransmission(specsPart);
    const location = detectLocation(specsPart) ?? detectLocation(titlePart);
    POWER_RE.lastIndex = 0;
    const powerMatch = POWER_RE.exec(specsPart);
    const power_kw = powerMatch ? parseInt(powerMatch[1], 10) : null;
    // Skip blocks that look like footer/header noise
    if (!price && !mileage && !year) continue;
    // Synthesize per-listing id from message id + URL
    const idSuffix = b.url ? b.url.replace(/\W+/g, "").slice(-24) : String(listings.length);
    listings.push({
      source_message_id: `${message.id}_${idSuffix}`,
      listing_url: b.url,
      title: title.slice(0, 200),
      make,
      model: null,
      year,
      mileage_km: mileage,
      price_eur: price,
      fuel,
      transmission,
      power_kw,
      location,
      seller_name: null,
      seller_type: null,
      image_url: b.image,
      raw_text: b.block.slice(0, 2000),
      received_at: internal,
    });
  }
  return listings;
}
