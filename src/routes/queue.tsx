import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { Check, X, Bookmark, MapPin, Gauge, Calendar, Undo2, Fuel, RefreshCw, Inbox, Flame } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchVehicles, recordDecision, undoDecision, type VehicleWithAnalysis, type DecisionValue } from "@/lib/db";
import { fmtChf, fmtEur, fmtKm } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTracking } from "@/hooks/useTracking";

function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(ms); } catch { /* noop */ }
  }
}

export const Route = createFileRoute("/queue")({
  component: QueuePage,
});

async function triggerSync() {
  const res = await fetch("/api/public/hooks/sync-gmail", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Sync failed");
  return data as { checked: number; parsed: number; inserted: number; errors: string[] };
}

type SortKey = "margin" | "newest" | "price" | "vsMarket";

function effectiveMargin(v: VehicleWithAnalysis): number {
  const a = v.analysis;
  if (!a) return -Infinity;
  if (v.seller_has_mwst === true) return Number(a.margin_with_mwst_chf ?? a.expected_margin_chf ?? 0);
  return Number(a.margin_without_mwst_chf ?? a.expected_margin_chf ?? 0);
}
function effectiveTotal(v: VehicleWithAnalysis): number {
  const a = v.analysis;
  if (!a) return 0;
  return v.seller_has_mwst === true
    ? Number(a.total_with_mwst_chf ?? a.total_cost_chf ?? 0)
    : Number(a.total_without_mwst_chf ?? a.total_cost_chf ?? 0);
}
function vsMarketPct(v: VehicleWithAnalysis): number {
  const a = v.analysis;
  const market = Number(a?.autoscout_ch_price_avg ?? a?.market_value_chf ?? 0);
  const total = effectiveTotal(v);
  if (!market || !total) return 0;
  return Math.round(((total - market) / market) * 100);
}

function QueuePage() {
  const qc = useQueryClient();
  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
  });

  const decideMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: DecisionValue }) => recordDecision(id, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
  const undoMut = useMutation({
    mutationFn: (id: string) => undoDecision(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
  const syncMut = useMutation({
    mutationFn: triggerSync,
    onSuccess: (r) => {
      toast.success(`${r.inserted} neue Inserate geladen`, { description: `${r.checked} Mails geprüft · ${r.parsed} Inserate erkannt` });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (e: Error) => toast.error("Sync fehlgeschlagen", { description: e.message }),
  });

  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [lastDecided, setLastDecided] = useState<string | null>(null);

  const queue = useMemo(() => {
    const open = vehicles.filter((v) => !v.decision);
    const ts = (v: VehicleWithAnalysis) => new Date(v.received_at ?? v.created_at).getTime();
    return open.sort((a, b) => {
      if (sortKey === "margin") {
        const d = effectiveMargin(b) - effectiveMargin(a);
        if (d !== 0) return d;
        return ts(b) - ts(a);
      }
      if (sortKey === "newest") return ts(b) - ts(a);
      if (sortKey === "price") return Number(a.price_eur ?? Infinity) - Number(b.price_eur ?? Infinity);
      if (sortKey === "vsMarket") return vsMarketPct(a) - vsMarketPct(b);
      return 0;
    });
  }, [vehicles, sortKey]);

  const handleDecide = (id: string, d: DecisionValue) => {
    haptic(d === "interesting" ? 18 : d === "skip" ? 8 : 12);
    decideMut.mutate({ id, d });
    setLastDecided(id);
  };

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Lade Fahrzeuge…</div>;
  }

  const sortLabel: Record<SortKey, string> = {
    margin: "höchste Marge",
    newest: "neueste",
    price: "tiefster Preis",
    vsMarket: "günstigster vs. Markt",
  };

  return (
    <div className="mx-auto max-w-2xl px-3 lg:px-8 py-3 lg:py-8 page-pb">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight truncate">Swipe Queue</h1>
          <p className="text-xs lg:text-sm text-muted-foreground truncate">
            {queue.length} Fahrzeug{queue.length === 1 ? "" : "e"} · sortiert nach {sortLabel[sortKey]}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={cn("h-4 w-4", syncMut.isPending && "animate-spin")} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
          {lastDecided && (
            <Button size="sm" variant="ghost" onClick={() => { undoMut.mutate(lastDecided); setLastDecided(null); }}>
              <Undo2 className="h-4 w-4" /> <span className="hidden sm:inline">Undo</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar -mx-3 px-3 lg:mx-0 lg:px-0">
        {([
          ["margin", "💰 Höchste Marge"],
          ["newest", "🕐 Neueste"],
          ["price", "📉 Tiefster Preis"],
          ["vsMarket", "🔍 vs. Markt"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs border transition",
              sortKey === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {queue.length === 0 ? (
        <EmptyState hasAny={vehicles.length > 0} onSync={() => syncMut.mutate()} syncing={syncMut.isPending} />
      ) : (
        <div className="space-y-4">
          {queue.map((v) => (
            <QueueCard key={v.id} vehicle={v} onDecide={(d) => handleDecide(v.id, d)} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasAny, onSync, syncing }: { hasAny: boolean; onSync: () => void; syncing: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="h-20 w-20 rounded-2xl bg-gradient-success/20 flex items-center justify-center mb-6 shadow-glow-success">
        {!hasAny ? <Inbox className="h-10 w-10 text-success" /> : <Flame className="h-10 w-10 text-success" />}
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">
        {!hasAny ? "Noch keine Inserate" : "Queue abgearbeitet"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        {!hasAny
          ? 'Klicke auf „Gmail jetzt synchronisieren“, um mobile.de-Mails zu importieren.'
          : "Keine Fahrzeuge zur Entscheidung offen. Neue Mails erscheinen automatisch hier."}
      </p>
      <div className="mt-6 flex gap-2 flex-wrap justify-center">
        <Button onClick={onSync} disabled={syncing} className="bg-gradient-primary text-primary-foreground">
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Synchronisiere…" : "Gmail jetzt synchronisieren"}
        </Button>
        {hasAny && <Button asChild variant="outline"><Link to="/archive">Archiv ansehen</Link></Button>}
      </div>
    </div>
  );
}

function QueueCard({ vehicle, onDecide }: {
  vehicle: VehicleWithAnalysis;
  onDecide: (d: DecisionValue) => void;
}) {
  const [deciding, setDeciding] = useState<DecisionValue | null>(null);
  const cardAppearedAt = useRef<number>(Date.now());
  const tappedAutoscout = useRef(false);
  const tappedListing = useRef(false);
  const { trackDecision } = useTracking();

  const handleClick = (d: DecisionValue) => {
    if (deciding) return;
    setDeciding(d);
    const margin = effectiveMargin(vehicle);
    const market = Number(vehicle.analysis?.autoscout_ch_price_avg ?? vehicle.analysis?.market_value_chf ?? 0);
    void trackDecision(vehicle.id, d, {
      timeOnCardMs: Date.now() - cardAppearedAt.current,
      tappedAutoscout: tappedAutoscout.current,
      tappedListing: tappedListing.current,
      vehicle: {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        mileage_km: vehicle.mileage_km,
        price_eur: vehicle.price_eur,
        fuel: vehicle.fuel,
        seller_type: vehicle.seller_type,
        distance_km: vehicle.distance_km,
      },
      analysis: {
        margin_chf: margin === -Infinity ? null : margin,
        market_price_ch: market || null,
        price_vs_market_percent: vsMarketPct(vehicle),
      },
    });
    setTimeout(() => onDecide(d), 180);
  };

  const a = vehicle.analysis;
  const margin = effectiveMargin(vehicle);
  const total = effectiveTotal(vehicle);
  const market = Number(a?.autoscout_ch_price_avg ?? a?.market_value_chf ?? 0);
  const compCount = Number(a?.autoscout_ch_comparable_count ?? 0);
  const vsMkt = vsMarketPct(vehicle);

  const marginTone =
    margin >= 3500 ? { border: "border-success/30", bg: "bg-success/10", text: "text-success" }
    : margin >= 1500 ? { border: "border-warning/30", bg: "bg-warning/10", text: "text-warning" }
    : { border: "border-danger/30", bg: "bg-danger/10", text: "text-danger" };

  const vsMarketText =
    !market ? "🟡 kein CH-Vergleich"
    : vsMkt < 0 ? `🟢 ${Math.abs(vsMkt)}% unter Markt`
    : vsMkt > 0 ? `🔴 ${vsMkt}% über Markt`
    : "🟡 Marktpreis";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="relative aspect-[16/10] bg-muted">
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt={vehicle.title} className="w-full h-full object-cover" draggable={false} loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Kein Bild</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30 pointer-events-none" />
        <div className="absolute bottom-3 left-3 right-3 text-white pointer-events-none">
          {vehicle.make && <div className="text-xs uppercase tracking-wider text-white/70">{vehicle.make}</div>}
          <div className="text-xl font-semibold leading-tight line-clamp-2">{vehicle.title}</div>
        </div>
      </div>

      <div className="p-4 lg:p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Spec icon={<Calendar className="h-3.5 w-3.5" />} label={vehicle.year ? String(vehicle.year) : "—"} sub="EZ" />
          <Spec icon={<Gauge className="h-3.5 w-3.5" />} label={vehicle.mileage_km ? fmtKm(vehicle.mileage_km) : "—"} sub="Kilometer" />
          <Spec icon={<Fuel className="h-3.5 w-3.5" />} label={vehicle.fuel ?? "—"} sub={vehicle.transmission ?? ""} />
          <Spec
            icon={<MapPin className="h-3.5 w-3.5" />}
            label={vehicle.location ?? "—"}
            sub={vehicle.distance_km != null ? `${Math.round(vehicle.distance_km)} km nach Kloten` : "Standort"}
          />
        </div>

        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Kaufpreis Deutschland</div>
          <div className="text-lg font-semibold tabular-nums">
            {vehicle.price_eur ? fmtEur(Number(vehicle.price_eur)) : "—"}
            {a?.price_chf ? <span className="text-muted-foreground text-sm ml-2 font-normal">({fmtChf(Number(a.price_chf))})</span> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className={cn("rounded-xl border p-3", marginTone.border, marginTone.bg)}>
            <div className={cn("text-[11px] mb-1 opacity-70", marginTone.text)}>💰 MARGE</div>
            <div className={cn("text-xl font-bold tabular-nums", marginTone.text)}>
              {margin === -Infinity ? "—" : `${margin >= 0 ? "+" : ""}${fmtChf(margin)}`}
            </div>
            <div className={cn("text-[11px] opacity-60 mt-0.5", marginTone.text)}>nach Import CH</div>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
            <div className="text-[11px] text-primary mb-1">📊 MARKTPREIS CH</div>
            <div className="text-xl font-bold text-primary tabular-nums">
              {market > 0 ? fmtChf(market) : "— nicht gefunden"}
            </div>
            <div className="text-[11px] text-primary/70 mt-0.5">
              {compCount > 0 ? `${compCount} Inserate CH` : "AutoScout24.ch"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[11px] text-muted-foreground mb-1">📦 EINSTANDSPREIS</div>
            <div className="text-xl font-bold tabular-nums">{total > 0 ? fmtChf(total) : "—"}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">alle Kosten CH</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[11px] text-muted-foreground mb-1">🔍 VERGLEICH</div>
            <div className="text-sm font-semibold mt-1">{vsMarketText}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {compCount > 0 ? `${compCount} ähnliche in CH` : "kein CH-Vergleich"}
            </div>
          </div>
        </div>

        {a?.autoscout_ch_url && (
          <a
            href={a.autoscout_ch_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-primary/30 hover:border-primary hover:bg-primary/5 transition text-xs text-primary"
          >
            <span>🔍 CH-Marktpreise auf AutoScout24.ch vergleichen</span>
            <span>→</span>
          </a>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{vehicle.source} · {vehicle.received_at ? new Date(vehicle.received_at).toLocaleDateString("de-CH") : "—"}</span>
          <Link to="/vehicle/$id" params={{ id: vehicle.id }} className="text-primary hover:underline font-medium">
            Vollansicht →
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleClick("skip")}
            disabled={!!deciding}
            className={cn(
              "h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 font-semibold border-2 transition-all active:scale-95",
              deciding === "skip"
                ? "bg-danger/30 border-danger text-danger"
                : "bg-danger/10 border-danger/30 text-danger hover:bg-danger/20",
            )}
          >
            <X className="h-5 w-5" />
            <span className="text-sm">Skip</span>
          </button>
          <button
            type="button"
            onClick={() => handleClick("maybe")}
            disabled={!!deciding}
            className={cn(
              "h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 font-semibold border-2 transition-all active:scale-95",
              deciding === "maybe"
                ? "bg-warning/30 border-warning text-warning"
                : "bg-warning/10 border-warning/30 text-warning hover:bg-warning/20",
            )}
          >
            <Bookmark className="h-5 w-5" />
            <span className="text-sm">Später</span>
          </button>
          <button
            type="button"
            onClick={() => handleClick("interesting")}
            disabled={!!deciding}
            className={cn(
              "h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 font-semibold border-2 transition-all active:scale-95",
              deciding === "interesting"
                ? "bg-success/30 border-success text-success"
                : "bg-success/10 border-success/30 text-success hover:bg-success/20",
            )}
          >
            <Check className="h-5 w-5" />
            <span className="text-sm">Deal</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Spec({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-md bg-surface flex items-center justify-center text-muted-foreground border border-border">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
      </div>
    </div>
  );
}
