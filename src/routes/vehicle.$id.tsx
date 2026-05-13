import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, MapPin, Calendar, Gauge, Fuel, Check, X, Bookmark, Phone, Globe, Building2, Navigation, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { fetchVehicle, recordDecision, fetchConfig, type DecisionValue } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
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
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const decideMut = useMutation({
    mutationFn: (d: DecisionValue) => recordDecision(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle", id] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
  const mwstMut = useMutation({
    mutationFn: async (val: boolean | null) => {
      const { error } = await supabase.from("vehicles").update({ seller_has_mwst: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicle", id] }),
  });

  type MwStStatus = "unknown" | "with" | "without";
  const initialStatus: MwStStatus =
    data?.seller_has_mwst === true ? "with" : data?.seller_has_mwst === false ? "without" : "unknown";
  const [mwstStatus, setMwstStatus] = useState<MwStStatus>(initialStatus);
  useEffect(() => { setMwstStatus(initialStatus); }, [initialStatus]);

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
  const market = Number(a?.market_value_chf ?? 0);
  const co2Threshold = Number(config?.co2_threshold_gkm ?? 130);

  const handleMwstChange = (s: MwStStatus) => {
    setMwstStatus(s);
    mwstMut.mutate(s === "with" ? true : s === "without" ? false : null);
  };

  // Dual-scenario numbers (fallback to canonical fields if extras missing)
  const transport_chf = Number(a?.transport_chf ?? 0);
  const mfk_aufbereitung_chf = Number(a?.mfk_chf ?? 0) + Number(a?.preparation_chf ?? 0);
  const wm = a ? {
    de_mwst_erstattung: Number(a.de_mwst_erstattung_chf ?? 0),
    netto: Number(a.netto_kaufpreis_chf ?? 0),
    automobilsteuer: Math.round(Number(a.netto_kaufpreis_chf ?? 0) * 0.04),
    zoll: Number(a.zoll_chf ?? a.customs_chf ?? 0),
    ch_mwst: Math.round((Number(a.netto_kaufpreis_chf ?? 0) + Number(a.zoll_chf ?? a.customs_chf ?? 0)) * 0.077),
    total: Number(a.total_with_mwst_chf ?? 0),
    margin: Number(a.margin_with_mwst_chf ?? 0),
    max_buy_eur: Number(a.max_buy_with_mwst_eur ?? 0),
  } : null;
  const wom = a ? {
    automobilsteuer: Number(a.automobilsteuer_chf ?? 0),
    zoll: Number(a.customs_chf ?? 0),
    ch_mwst: Number(a.vat_chf ?? 0),
    total: Number(a.total_without_mwst_chf ?? a.total_cost_chf ?? 0),
    margin: Number(a.margin_without_mwst_chf ?? a.expected_margin_chf ?? 0),
    max_buy_eur: Number(a.max_buy_without_mwst_eur ?? 0),
  } : null;
  const mwst_saving = Number(a?.mwst_saving_chf ?? 0);
  const distanceKm = v.distance_km != null ? Math.round(v.distance_km) : 0;
  const showWith = mwstStatus === "with";
  const total = showWith ? wm?.total ?? 0 : wom?.total ?? 0;
  const margin = showWith ? wm?.margin ?? 0 : wom?.margin ?? 0;

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
        {(v.consumption || v.co2_gkm || v.emission_class || v.transmission || v.location || v.distance_km) && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border-t border-border">
            {v.transmission && <Stat icon={<Gauge />} label="Getriebe" value={v.transmission} />}
            {v.consumption && <Stat icon={<Fuel />} label="Verbrauch" value={v.consumption} />}
            {v.co2_gkm != null && <Stat icon={<Fuel />} label="CO₂" value={`${v.co2_gkm} g/km${v.emission_class ? ` · Klasse ${v.emission_class}` : ""}`} />}
            {v.location && <Stat icon={<MapPin />} label="Standort" value={v.location} />}
            {v.distance_km != null && (
              <Stat
                icon={<Navigation />}
                label="Fahrdistanz nach Kloten"
                value={`${Math.round(v.distance_km)} km${v.distance_minutes ? ` · ${Math.floor(v.distance_minutes / 60)}h ${v.distance_minutes % 60}min` : ""}`}
              />
            )}
          </div>
        )}
      </div>

      {(v.seller_name || v.seller_phone || v.seller_address || v.seller_website || v.seller_type) && (
        <Section title="Händler / Verkäufer">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            {v.seller_name && (
              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">{v.seller_name}</div>
                  {v.seller_type && <div className="text-xs text-muted-foreground">{v.seller_type === "Dealer" ? "Händler / Gewerblich" : "Privat"}</div>}
                </div>
              </div>
            )}
            {v.seller_address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm">{v.seller_address}</div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=Flughafen+Kloten,+Schweiz&origin=${encodeURIComponent(v.seller_address)}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    Route in Google Maps öffnen <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
            {v.seller_phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`tel:${v.seller_phone.replace(/\s/g, "")}`} className="text-sm text-primary hover:underline tabular-nums">{v.seller_phone}</a>
              </div>
            )}
            {v.seller_website && (
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={v.seller_website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">{v.seller_website}</a>
              </div>
            )}
            {v.distance_km != null && (
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Navigation className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <span className="font-semibold tabular-nums">{Math.round(v.distance_km)} km</span>
                  {v.distance_minutes != null && (
                    <span className="text-muted-foreground"> · ca. {Math.floor(v.distance_minutes / 60)}h {v.distance_minutes % 60}min Fahrt nach Kloten</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {a && (
        <Section title="Import-Kostenaufstellung">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
      {v.co2_gkm != null && v.co2_gkm > 0 && v.co2_gkm > co2Threshold && (
        <div className="flex items-start gap-3 bg-danger/10 border border-danger/30 rounded-lg p-3">
          <AlertTriangle className="h-5 w-5 text-danger mt-0.5 shrink-0" />
          <div>
            <div className="text-danger font-semibold text-sm">CO₂-Warnung</div>
            <div className="text-danger/90 text-xs mt-0.5">
              {v.co2_gkm} g/km — überschreitet den Schweizer Grenzwert von {co2Threshold} g/km.
              Es können zusätzliche Schweizer CO₂-Lenkungsabgaben anfallen. Bitte separat kalkulieren.
            </div>
          </div>
        </div>
      )}

      {a && wm && wom && (
        <Section title="Import-Kostenaufstellung">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">🧾 MwSt-Status des Verkäufers</div>
              <div className="flex gap-2">
                <MwStBtn active={mwstStatus === "with"} tone="success" onClick={() => handleMwstChange("with")}
                  label="✅ MwSt ausweisbar" sub="Händler / gewerblich" />
                <MwStBtn active={mwstStatus === "without"} tone="info" onClick={() => handleMwstChange("without")}
                  label="❌ Kein MwSt-Ausweis" sub="Privat / Differenz" />
                <MwStBtn active={mwstStatus === "unknown"} tone="warning" onClick={() => handleMwstChange("unknown")}
                  label="❓ Unbekannt" sub="Beide anzeigen" />
              </div>
            </div>

            {mwstStatus === "unknown" ? (
              <>
                <div className="grid md:grid-cols-2 gap-3">
                  <CostTable
                    title="✅ MIT MwSt-Ausweis"
                    subtitle="Händlerkauf"
                    accent="success"
                    rows={[
                      { label: "Kaufpreis DE (brutto)", value: fmtChf(Number(a.price_chf)) },
                      { label: "− DE MwSt (19%)", value: `− ${fmtChf(wm.de_mwst_erstattung)}`, positive: true },
                      { label: "= Nettobasis", value: fmtChf(wm.netto), divider: true },
                      { label: "+ Automobilsteuer (4%)", value: `+ ${fmtChf(wm.automobilsteuer)}` },
                      { label: "+ Zoll CH", value: `+ ${fmtChf(wm.zoll)}` },
                      { label: "+ CH MwSt (7.7%)", value: `+ ${fmtChf(wm.ch_mwst)}` },
                      { label: `+ Transport (${distanceKm}km × 1.50)`, value: `+ ${fmtChf(transport_chf)}` },
                      { label: "+ MFK + Aufbereitung", value: `+ ${fmtChf(mfk_aufbereitung_chf)}` },
                    ]}
                    total={wm.total}
                    sellPrice={market}
                    margin={wm.margin}
                    maxBuyEur={wm.max_buy_eur}
                  />
                  <CostTable
                    title="❌ OHNE MwSt-Ausweis"
                    subtitle="Privat / Differenz"
                    accent="info"
                    rows={[
                      { label: "Kaufpreis (Einfuhrbasis)", value: fmtChf(Number(a.price_chf)) },
                      { label: "⚠️ Kein MwSt-Abzug möglich", value: "", note: true },
                      { label: "+ Automobilsteuer (4%)", value: `+ ${fmtChf(wom.automobilsteuer)}` },
                      { label: "+ Zoll CH", value: `+ ${fmtChf(wom.zoll)}` },
                      { label: "+ CH MwSt (7.7%)", value: `+ ${fmtChf(wom.ch_mwst)}` },
                      { label: `+ Transport (${distanceKm}km × 1.50)`, value: `+ ${fmtChf(transport_chf)}` },
                      { label: "+ MFK + Aufbereitung", value: `+ ${fmtChf(mfk_aufbereitung_chf)}` },
                    ]}
                    total={wom.total}
                    sellPrice={market}
                    margin={wom.margin}
                    maxBuyEur={wom.max_buy_eur}
                  />
                </div>
                <div className="flex items-center justify-center gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <span className="text-warning">💡</span>
                  <span className="text-warning text-sm">
                    MwSt-Ersparnis wenn ausweisbar: <strong className="ml-1">{fmtChf(mwst_saving)}</strong>
                  </span>
                </div>
              </>
            ) : (
              <div className="grid md:grid-cols-1 gap-3">
                <CostTable
                  title={showWith ? "✅ MIT MwSt-Ausweis" : "❌ OHNE MwSt-Ausweis"}
                  subtitle={showWith ? "Händlerkauf" : "Privat / Differenz"}
                  accent={showWith ? "success" : "info"}
                  rows={showWith ? [
                    { label: "Kaufpreis DE (brutto)", value: fmtChf(Number(a.price_chf)) },
                    { label: "− DE MwSt (19%)", value: `− ${fmtChf(wm.de_mwst_erstattung)}`, positive: true },
                    { label: "= Nettobasis", value: fmtChf(wm.netto), divider: true },
                    { label: "+ Automobilsteuer (4%)", value: `+ ${fmtChf(wm.automobilsteuer)}` },
                    { label: "+ Zoll CH", value: `+ ${fmtChf(wm.zoll)}` },
                    { label: "+ CH MwSt (7.7%)", value: `+ ${fmtChf(wm.ch_mwst)}` },
                    { label: `+ Transport (${distanceKm}km × 1.50)`, value: `+ ${fmtChf(transport_chf)}` },
                    { label: "+ MFK + Aufbereitung", value: `+ ${fmtChf(mfk_aufbereitung_chf)}` },
                  ] : [
                    { label: "Kaufpreis (Einfuhrbasis)", value: fmtChf(Number(a.price_chf)) },
                    { label: "⚠️ Kein MwSt-Abzug möglich", value: "", note: true },
                    { label: "+ Automobilsteuer (4%)", value: `+ ${fmtChf(wom.automobilsteuer)}` },
                    { label: "+ Zoll CH", value: `+ ${fmtChf(wom.zoll)}` },
                    { label: "+ CH MwSt (7.7%)", value: `+ ${fmtChf(wom.ch_mwst)}` },
                    { label: `+ Transport (${distanceKm}km × 1.50)`, value: `+ ${fmtChf(transport_chf)}` },
                    { label: "+ MFK + Aufbereitung", value: `+ ${fmtChf(mfk_aufbereitung_chf)}` },
                  ]}
                  total={showWith ? wm.total : wom.total}
                  sellPrice={market}
                  margin={showWith ? wm.margin : wom.margin}
                  maxBuyEur={showWith ? wm.max_buy_eur : wom.max_buy_eur}
                />
              </div>
            )}
          </div>
        </Section>
      )}

      {a && (
        <Section title="Marktanalyse Schweiz">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="text-xs text-muted-foreground">
              Vergleichsbasis: <span className="text-foreground font-medium">{v.make ?? ""} {v.model ?? ""}</span>
              {v.mileage_km != null && <> · ± 20'000 km</>}
              {v.year && <> · {v.year - 2}–{v.year + 2}</>} · 🇨🇭 CH
            </div>

            {Number(a.autoscout_ch_price_avg ?? 0) > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                <MarketCard label="Minimum" value={fmtChf(Number(a.autoscout_ch_price_min ?? 0))} sub="" />
                <MarketCard label="Ø Markt CH" value={fmtChf(Number(a.autoscout_ch_price_avg ?? 0))} sub={`${a.autoscout_ch_comparable_count ?? 0} Inserate`} tone="success" />
                <MarketCard label="Maximum" value={fmtChf(Number(a.autoscout_ch_price_max ?? 0))} sub="" />
              </div>
            ) : (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                ⚠️ Keine direkten Vergleichsfahrzeuge auf AutoScout24.ch gefunden. Geschätzter Marktpreis basiert auf Erfahrungswerten.
              </div>
            )}

            <div className="rounded-lg bg-surface p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dieses Auto · Einstand CH</span>
                <span className="font-medium tabular-nums">{fmtChf(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marktpreis Ø CH</span>
                <span className="font-medium tabular-nums">{fmtChf(market)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between items-center">
                <span className="font-semibold">Marge</span>
                <span className={cn("text-xl font-bold tabular-nums", margin >= 0 ? "text-success" : "text-danger")}>
                  {margin >= 0 ? "+" : ""}{fmtChf(margin)}
                  {market > 0 && <span className="text-xs font-normal ml-1 text-muted-foreground">({((margin / market) * 100).toFixed(1)}%)</span>}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">Kaufpreis CHF: {fmtChf(price_chf)} {v.price_eur ? `(${fmtEur(Number(v.price_eur))})` : ""}</div>
            </div>

            {a.autoscout_ch_url && (
              <a
                href={a.autoscout_ch_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center rounded-lg border-2 border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition"
              >
                🔍 {v.make} {v.model} auf AutoScout24.ch vergleichen
                {Number(a.autoscout_ch_comparable_count ?? 0) > 0 && ` (${a.autoscout_ch_comparable_count} Inserate)`}
                {" →"}
              </a>
            )}
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
