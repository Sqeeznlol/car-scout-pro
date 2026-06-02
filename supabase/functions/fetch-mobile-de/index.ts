// Supabase Edge Function: fetch-mobile-de
// Proxies a mobile.de listing URL, scrapes price/location/title and returns JSON.

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
    const location = extractLocation(html);

    return new Response(
      JSON.stringify({
        url: target.toString(),
        title,
        price_eur: price.eur,
        price_raw: price.raw,
        location,
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
