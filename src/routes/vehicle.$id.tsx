import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, MapPin, Calendar, Gauge, Fuel, Check, X, Bookmark } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchVehicle, recordDecision, type DecisionValue } from "@/lib/db";
import { fmtChf, fmtEur, fmtKm, scoreColor } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vehicle/$id")({
  component: VehiclePage,
});

function VehiclePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => fetchVehicle(id),
  });
  const decideMut = useMutation({
    mutationFn: (d: DecisionValue) => recordDecision(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle", id] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Lade…</div>;
  if (!data) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold">Fahrzeug nicht gefunden</h2>
        <Link to="/queue" className="text-primary hover:underline mt-2 inline-block">Zurück zur Queue</Link>
      </div>
    );
  }

  const v = data;
  const a = v.analysis;
  const current = v.decision?.decision;
  const score = a?.deal_score ?? 0;
  const price_chf = Number(a?.price_chf ?? 0);
  const total = Number(a?.total_cost_chf ?? 0);
  const market = Number(a?.market_value_chf ?? 0);
  const margin = Number(a?.expected_margin_chf ?? 0);

  const costRows = a ? [
    { label: "Kaufpreis CHF", chf: Number(a.price_chf), sub: v.price_eur ? fmtEur(Number(v.price_eur)) : "" },
    { label: "Transport", chf: Number(a.transport_chf), sub: v.location ? `${v.location} → Schweiz` : "" },
    { label: "Automobilsteuer (4%)", chf: Number(a.automobilsteuer_chf), sub: "" },
    { label: "MwSt. (8.1%)", chf: Number(a.vat_chf), sub: "" },
    { label: "Verzollung", chf: Number(a.customs_chf), sub: "Flat" },
    { label: "MFK", chf: Number(a.mfk_chf), sub: "Schweizer Zulassung" },
    { label: "Aufbereitung", chf: Number(a.preparation_chf), sub: "Reinigung, Schilder, Admin" },
  ] : [];

  const factors = a ? [
    { label: "Marge", score: a.margin_score },
    { label: "Liquidität", score: a.liquidity_score },
    { label: "Risiko", score: a.risk_score },
    { label: "Learning", score: a.learning_score },
  ] : [];

  return (
    <div className="mx-auto max-w-5xl px-4 lg:px-8 py-4 lg:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/queue" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Zurück zur Queue
        </Link>
        {v.listing_url && (
          <a href={v.listing_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            Auf {v.source} öffnen <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-card">
        <div className="relative aspect-[16/8] bg-muted">
          {v.image_url ? (
            <img src={v.image_url} alt={v.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">Kein Bild</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4 text-white">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/70">{v.make ?? ""} {v.year ? `· ${v.year}` : ""}</div>
              <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">{v.title}</h1>
            </div>
            <ScoreBadge score={score} size="lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
          <Stat icon={<Calendar />} label="Erstzulassung" value={v.registration_month && v.year ? `${String(v.registration_month).padStart(2, "0")}/${v.year}` : v.year ? String(v.year) : "—"} />
          <Stat icon={<Gauge />} label="Kilometer" value={v.mileage_km ? fmtKm(v.mileage_km) : "—"} />
          <Stat icon={<Fuel />} label="Kraftstoff" value={v.fuel ?? "—"} />
          <Stat icon={<Gauge />} label="Leistung" value={v.power_kw ? `${v.power_kw} kW${v.power_ps ? ` (${v.power_ps} PS)` : ""}` : "—"} />
        </div>
        {(v.consumption || v.co2_gkm || v.emission_class || v.transmission || v.location) && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border-t border-border">
            {v.transmission && <Stat icon={<Gauge />} label="Getriebe" value={v.transmission} />}
            {v.consumption && <Stat icon={<Fuel />} label="Verbrauch" value={v.consumption} />}
            {v.co2_gkm != null && <Stat icon={<Fuel />} label="CO₂" value={`${v.co2_gkm} g/km${v.emission_class ? ` · Klasse ${v.emission_class}` : ""}`} />}
            {v.location && <Stat icon={<MapPin />} label="Standort" value={v.location} />}
          </div>
        )}
      </div>

      {a && (
        <Section title="Import-Kostenaufstellung">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {costRows.map((r) => (
                  <tr key={r.label} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div>{r.label}</div>
                      {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtChf(r.chf)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-elevated">
                  <td className="px-4 py-3 font-semibold">Total in CHF</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xl font-bold">{fmtChf(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {a && (
        <Section title="Marktanalyse">
          <div className="grid md:grid-cols-3 gap-4">
            <MarketCard label="Kaufpreis CHF" value={fmtChf(price_chf)} sub={v.price_eur ? `${fmtEur(Number(v.price_eur))} @ Konfig-Kurs` : ""} />
            <MarketCard label="CH-Marktwert (Schätzung)" value={fmtChf(market)} sub="Heuristik" />
            <MarketCard
              label="Erwartete Marge"
              value={`${margin >= 0 ? "+" : ""}${fmtChf(margin)}`}
              sub={margin >= 0 ? "Über Zielmarge" : "Unter Zielmarge"}
              tone={margin >= 0 ? "success" : "warning"}
            />
          </div>
        </Section>
      )}

      {a && (
        <Section title="Deal Score">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeDasharray={`${score} 100`} strokeLinecap="round" className={cn(scoreColor(score).text)} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold tabular-nums">{score}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Deal Score</div>
                <div className="text-lg font-semibold">{scoreColor(score).label} Opportunity</div>
              </div>
            </div>

            <div className="space-y-2">
              {factors.map((f) => (
                <div key={f.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="tabular-nums">{Math.round(Number(f.score ?? 0))}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div className="h-full bg-gradient-primary" style={{ width: `${Math.min(Number(f.score ?? 0), 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {v.raw_text && (
        <Section title="Original-Text aus E-Mail">
          <pre className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground whitespace-pre-wrap max-h-64 overflow-auto">{v.raw_text}</pre>
        </Section>
      )}

      <div className="sticky bottom-20 lg:bottom-4 z-20">
        <div className="rounded-xl glass border border-border p-3 grid grid-cols-3 gap-2">
          <Button variant="outline" className={cn("h-12 border-danger/40 hover:bg-danger/10", current === "skip" && "bg-danger/15")} onClick={() => decideMut.mutate("skip")}>
            <X className="h-4 w-4" /> Skip
          </Button>
          <Button variant="outline" className={cn("h-12 border-warning/40 hover:bg-warning/10", current === "maybe" && "bg-warning/15")} onClick={() => decideMut.mutate("maybe")}>
            <Bookmark className="h-4 w-4" /> Vielleicht
          </Button>
          <Button className={cn("h-12 bg-gradient-success text-success-foreground font-semibold", current === "interesting" && "ring-2 ring-success")} onClick={() => decideMut.mutate("interesting")}>
            <Check className="h-4 w-4" /> Interessant
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
function MarketCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "success" | "warning" }) {
  return (
    <div className={cn(
      "rounded-xl border border-border p-4",
      tone === "success" ? "bg-success/5 border-success/30" : tone === "warning" ? "bg-warning/5 border-warning/30" : "bg-card",
    )}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
