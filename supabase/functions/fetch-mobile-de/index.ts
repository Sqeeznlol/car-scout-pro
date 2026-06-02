// Supabase Edge Function: fetch-mobile-de
// Proxies a mobile.de listing URL, scrapes title/price/location plus MwSt + country.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function pick(html: string, regexes: RegExp[]): string | null {
  for (const r of regexes) {
    const m = html.match(r);
    if (m && m[1]) {
      const v = stripTags(m[1]);
      if (v) return v;
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  return pick(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<title>([\s\S]*?)<\/title>/i,
  ]);
}

function extractPrice(html: string): { raw: string | null; eur: number | null } {
  const raw = pick(html, [
    /"price"\s*:\s*"?([0-9.,]+)"?/i,
    /data-price=["']([0-9.,]+)["']/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([0-9.,]+)["']/i,
    /([0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]{2})?)\s*€/,
    /€\s*([0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]{2})?)/,
  ]);
  if (!raw) return { raw: null, eur: null };
  const cleaned = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return { raw, eur: Number.isFinite(n) ? n : null };
}

function extractLocation(html: string): string | null {
  return pick(html, [
    /"addressLocality"\s*:\s*"([^"]+)"/i,
    /"address"\s*:\s*\{[^}]*"addressLocality"\s*:\s*"([^"]+)"/i,
    /data-testid=["']seller-address["'][^>]*>([\s\S]*?)</i,
    /class=["'][^"']*seller-address[^"']*["'][^>]*>([\s\S]*?)</i,
    /<meta[^>]+property=["']og:locality["'][^>]+content=["']([^"']+)["']/i,
  ]);
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

function analyseHtml(html: string) {
  const text = stripTags(html);
  const signals: string[] = [];
  let has_mwst: boolean | null = null;
  let netto_eur: number | null = null;
  let country_code: string | null = null;
  let location_addr: string | null = null;

  const netto = extractExplicitNetto(text);
  if (netto) {
    has_mwst = true;
    netto_eur = netto;
    signals.push(`netto_explicit:${netto}`);
  }
  if (has_mwst === null) {
    if (
      /MwSt\.?\s*ausweisbar|MwSt\.?\s*ausgewiesen|zzgl\.?\s*\d+\s*%?\s*MwSt|exkl\.?\s*MwSt|Nettopreis|netto\s*(?:zzgl|exkl|\+|,\s*\d+\s*%)/i.test(
        text,
      )
    ) {
      has_mwst = true;
      signals.push("mwst_keyword");
    }
  }
  if (/§\s*25\s*a|Differenzbesteu/i.test(text)) {
    if (has_mwst !== true) {
      has_mwst = false;
      signals.push("§25a");
    }
  }

  const addrMatch =
    /\b(DE|AT|CH|IT|FR|NL|BE|LU|DK|PL|CZ|ES|PT|SE|NO|FI|HU|SK|SI|HR)-(\d{4,5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-\s]{2,40}?)(?=\s*[,\n<•|·]|\s*$|\s*\d|\s+Tel)/.exec(
      text,
    );
  if (addrMatch) {
    country_code = addrMatch[1];
    location_addr = `${addrMatch[2]} ${addrMatch[3].trim()}`.replace(/\s+/g, " ");
    signals.push(`addr:${country_code}`);
  }

  return { has_mwst, netto_eur, country_code, location_addr, signals };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url } = await req.json().catch(() => ({}));

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'url' in body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/(^|\.)mobile\.de$/i.test(target.hostname)) {
      return new Response(JSON.stringify({ error: "Only mobile.de URLs are allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(target.toString(), {
      headers: {
        "User-Agent": UA,
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream returned ${res.status}`, status: res.status }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const html = await res.text();

    const title = extractTitle(html);
    const price = extractPrice(html);
    const ogLocation = extractLocation(html);
    const analysis = analyseHtml(html);

    const price_gross_eur = price.eur;
    const price_net_eur = analysis.netto_eur;

    return new Response(
      JSON.stringify({
        url: target.toString(),
        title,
        price_eur: price_gross_eur,
        price_raw: price.raw,
        price_gross_eur,
        price_net_eur,
        location: analysis.location_addr ?? ogLocation,
        country_code: analysis.country_code,
        has_mwst: analysis.has_mwst,
        netto_eur: price_net_eur,
        signals: analysis.signals,
        fetched_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
