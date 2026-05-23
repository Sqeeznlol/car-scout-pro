// Live EUR→CHF rate from frankfurter.app (ECB reference rates, no API key).
// Cached in-memory for 1 hour per server instance.

let cached: { rate: number; ts: number } | null = null;
const TTL_MS = 60 * 60 * 1000;
const FALLBACK = 0.94;

export async function getLiveEurChfRate(): Promise<number> {
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.rate;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=CHF", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { rates?: { CHF?: number } };
    const rate = json.rates?.CHF;
    if (typeof rate !== "number" || rate <= 0) throw new Error("invalid rate");
    cached = { rate, ts: Date.now() };
    return rate;
  } catch (e) {
    console.error("[fx] live rate fetch failed, fallback", e);
    return cached?.rate ?? FALLBACK;
  }
}
