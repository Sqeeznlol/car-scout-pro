import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, MapPin, Calendar, Gauge, Fuel, AlertTriangle, Check, X, Bookmark } from "lucide-react";
import { vehicles, analyses } from "@/lib/seed";
import { fmtChf, fmtEur, fmtKm, scoreColor, riskDotClass } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Button } from "@/components/ui/button";
import { useRadarStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Decision } from "@/lib/types";

export const Route = createFileRoute("/vehicle/$id")({
  component: VehiclePage,
  loader: ({ params }) => {
    const v = vehicles.find((x) => x.id === params.id);
    if (!v) throw notFound();
    return { vehicle: v, analysis: analyses[v.id]! };
  },
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-semibold">Vehicle not found</h2>
      <Link to="/queue" className="text-primary hover:underline mt-2 inline-block">Back to queue</Link>
    </div>
  ),
});

function VehiclePage() {
  const { vehicle: v, analysis: a } = Route.useLoaderData();
  const decide = useRadarStore((s) => s.decide);
  const decisions = useRadarStore((s) => s.decisions);
  const current = decisions[v.id]?.decision;
  const config = useRadarStore((s) => s.config);

  const onDecide = (d: Decision) => decide(v.id, d);

  const costRows = [
    { label: "Purchase price", chf: v.priceEur * a.eurChfRate, sub: `${fmtEur(v.priceEur)} @ ${a.eurChfRate}` },
    { label: "Transport (Kloten)", chf: a.transportCostChf, sub: `${a.distanceKm} km × ${config.chfPerKm} CHF/km` },
    { label: "Automobilsteuer (4%)", chf: a.importTaxChf, sub: "Swiss auto tax" },
    { label: "Swiss VAT (8.1%)", chf: a.swissVatChf, sub: "MwSt." },
    { label: "Customs / Verzollung", chf: a.customsChf, sub: "Flat" },
    { label: "MFK Inspection", chf: a.mfkCostChf, sub: "Swiss roadworthiness" },
    { label: "Preparation", chf: a.preparationCostChf, sub: "Cleaning, plates, admin" },
  ];

  const weights = config.scoreWeights;
  const factors = [
    { label: "Margin", weight: weights.margin, score: Math.min(a.expectedMarginChf / config.targetMarginChf, 2) * 50 },
    { label: "Price vs market", weight: weights.priceVsMarket, score: a.priceVsMarketPercent < 0 ? Math.min(Math.abs(a.priceVsMarketPercent) / 20, 1) * 100 : 0 },
    { label: "Liquidity", weight: weights.liquidity, score: Math.min(a.similarListings / 50, 1) * 100 },
    { label: "Import risk", weight: weights.importRisk, score: a.riskLevel === "low" ? 100 : a.riskLevel === "medium" ? 60 : 25 },
    { label: "Equipment / demand", weight: weights.demand, score: 70 },
    { label: "Learning", weight: weights.learning, score: 50 },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 lg:px-8 py-4 lg:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/queue" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to queue
        </Link>
        <a href={v.listingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          Open on {v.sourcePlatform} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Hero */}
      <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-card">
        <div className="relative aspect-[16/8] bg-muted">
          <img src={v.image} alt={v.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4 text-white">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/70">{v.make} · {v.year}</div>
              <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">{v.title}</h1>
            </div>
            <ScoreBadge score={a.dealScore} size="lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
          <Stat icon={<Calendar />} label="First registered" value={String(v.year)} />
          <Stat icon={<Gauge />} label="Mileage" value={fmtKm(v.mileage)} />
          <Stat icon={<Fuel />} label="Fuel / Gearbox" value={`${v.fuelType} · ${v.transmission}`} />
          <Stat icon={<MapPin />} label="Location" value={`${v.locationCity}, ${v.locationCountry}`} />
        </div>
      </div>

      {/* Listing + Seller */}
      <Section title="Listing Info">
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KV k="Color" v={v.color} />
              <KV k="Platform ID" v={v.platformId} />
              <KV k="Source" v={v.sourcePlatform} />
              <KV k="Listed" v={`${v.daysListed} days ago`} />
            </div>
            {v.previousPriceEur && (
              <div className="text-sm text-success">
                Price reduced from {fmtEur(v.previousPriceEur)} → {fmtEur(v.priceEur)}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Seller</div>
            <div className="font-medium">{v.sellerName}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-surface border border-border text-xs px-2 py-1 capitalize">
              {v.sellerType}
            </div>
          </div>
        </div>
      </Section>

      {/* Cost calculator */}
      <Section title="Import Cost Breakdown">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {costRows.map((r) => (
                <tr key={r.label} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div>{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.sub}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtChf(r.chf)}</td>
                </tr>
              ))}
              {a.co2Warning && (
                <tr className="bg-warning/5 border-b border-border">
                  <td className="px-4 py-3 text-warning flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> High CO₂ — possible penalty
                  </td>
                  <td className="px-4 py-3 text-right text-warning">review</td>
                </tr>
              )}
              <tr className="bg-surface-elevated">
                <td className="px-4 py-3 font-semibold">Total cost in CHF</td>
                <td className="px-4 py-3 text-right tabular-nums text-xl font-bold">{fmtChf(a.totalCostChf)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Market */}
      <Section title="Market Analysis">
        <div className="grid md:grid-cols-3 gap-4">
          <MarketCard label="Germany avg" value={fmtEur(a.marketPriceDeAvg)} sub={`${a.similarListings} similar listings`} />
          <MarketCard label="Switzerland avg" value={fmtChf(a.marketPriceChAvg)} sub="AutoScout24.ch estimate" />
          <MarketCard
            label="Position vs market"
            value={`${a.priceVsMarketPercent.toFixed(1)}%`}
            sub={a.priceVsMarketPercent < 0 ? "Below average" : "Above average"}
            tone={a.priceVsMarketPercent < 0 ? "success" : "warning"}
          />
        </div>
      </Section>

      {/* Score */}
      <Section title="Deal Score Breakdown">
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeDasharray={`${a.dealScore} 100`} strokeLinecap="round"
                  className={cn(scoreColor(a.dealScore).text)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold tabular-nums">
                {a.dealScore}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Deal score</div>
              <div className="text-lg font-semibold">{scoreColor(a.dealScore).label} opportunity</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <span className={cn("h-2 w-2 rounded-full", riskDotClass(a.riskLevel))} />
                {a.riskLevel} import risk · {v.fuelType}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {factors.map((f) => (
              <div key={f.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{f.label} <span className="opacity-60">({f.weight}%)</span></span>
                  <span className="tabular-nums">{Math.round(f.score)}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                  <div className="h-full bg-gradient-primary" style={{ width: `${Math.min(f.score, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Sticky actions */}
      <div className="sticky bottom-20 lg:bottom-4 z-20">
        <div className="rounded-xl glass border border-border p-3 grid grid-cols-3 gap-2">
          <Button variant="outline" className={cn("h-12 border-danger/40 hover:bg-danger/10", current === "skip" && "bg-danger/15")} onClick={() => onDecide("skip")}>
            <X className="h-4 w-4" /> Skip
          </Button>
          <Button variant="outline" className={cn("h-12 border-warning/40 hover:bg-warning/10", current === "maybe" && "bg-warning/15")} onClick={() => onDecide("maybe")}>
            <Bookmark className="h-4 w-4" /> Maybe
          </Button>
          <Button className={cn("h-12 bg-gradient-success text-success-foreground font-semibold", current === "interesting" && "ring-2 ring-success")} onClick={() => onDecide("interesting")}>
            <Check className="h-4 w-4" /> Interested
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <div className="text-muted-foreground h-4 w-4 mb-2">{icon}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium text-sm">{value}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

function MarketCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "success" | "warning" }) {
  return (
    <div className={cn(
      "rounded-xl border border-border p-4",
      tone === "success" ? "bg-success/5 border-success/30" : tone === "warning" ? "bg-warning/5 border-warning/30" : "bg-card",
    )}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}
