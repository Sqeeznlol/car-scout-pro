import { createFileRoute } from "@tanstack/react-router";

async function runTest() {
  const testUrl = "https://suchen.mobile.de/fahrzeuge/details.html?id=456556351";
  const jinaUrl = `https://r.jina.ai/${testUrl}`;
  const out: Record<string, unknown> = { jinaUrl };
  try {
    const t0 = Date.now();
    const res = await fetch(jinaUrl, {
      headers: { "Accept": "text/plain", "X-Locale": "de-DE" },
    });
    out.status = res.status;
    out.ok = res.ok;
    out.duration_ms = Date.now() - t0;
    const text = await res.text();
    out.text_length = text.length;
    out.first_500_chars = text.slice(0, 500);
    out.contains_netto = text.includes("Netto");
    out.contains_mwst = /MwSt/i.test(text);
    out.contains_de_postal = /DE-\d{5}/.test(text);
    const ix = text.indexOf("Netto");
    if (ix >= 0) out.context_around_netto = text.slice(Math.max(0, ix - 100), ix + 200);
    const addrMatch = /DE-\d{5}\s+[A-Z][a-zA-ZäöüÄÖÜß\s-]+/.exec(text);
    if (addrMatch) out.address_found = addrMatch[0];
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    out.error_stack = e instanceof Error ? e.stack?.slice(0, 500) : null;
  }
  return out;
}

export const Route = createFileRoute("/api/public/hooks/test-jina")({
  server: {
    handlers: {
      GET: async () => Response.json(await runTest()),
    },
  },
});
