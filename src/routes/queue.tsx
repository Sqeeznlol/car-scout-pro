import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Check, X, Bookmark, MapPin, Gauge, Calendar, TrendingDown, Flame, Undo2, Fuel, RefreshCw, Inbox } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchVehicles, recordDecision, undoDecision, type VehicleWithAnalysis, type DecisionValue } from "@/lib/db";
import { fmtChf, fmtEur, fmtKm } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/queue")({
  component: QueuePage,
});

async function triggerSync() {
  const res = await fetch("/api/public/hooks/sync-gmail", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Sync failed");
  return data as { checked: number; parsed: number; inserted: number; errors: string[] };
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

  const queue = vehicles
    .filter((v) => !v.decision)
    .sort((a, b) => (b.analysis?.deal_score ?? 0) - (a.analysis?.deal_score ?? 0));

  const [lastDecided, setLastDecided] = useState<string | null>(null);

  const handleDecide = (id: string, d: DecisionValue) => {
    decideMut.mutate({ id, d });
    setLastDecided(id);
  };

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Lade Fahrzeuge…</div>;
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <div className="h-20 w-20 rounded-2xl bg-gradient-success/20 flex items-center justify-center mb-6 shadow-glow-success">
          {vehicles.length === 0 ? <Inbox className="h-10 w-10 text-success" /> : <Flame className="h-10 w-10 text-success" />}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {vehicles.length === 0 ? "Noch keine Inserate" : "Queue abgearbeitet"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          {vehicles.length === 0
            ? 'Klicke unten auf „Gmail jetzt synchronisieren“, um mobile.de-Mails aus deinem Postfach zu importieren.'
            : "Keine Fahrzeuge zur Entscheidung offen. Neue mobile.de-Mails erscheinen automatisch hier."}
        </p>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending} className="bg-gradient-primary text-primary-foreground">
            <RefreshCw className={cn("h-4 w-4", syncMut.isPending && "animate-spin")} />
            {syncMut.isPending ? "Synchronisiere…" : "Gmail jetzt synchronisieren"}
          </Button>
          {vehicles.length > 0 && <Button asChild variant="outline"><Link to="/archive">Archiv ansehen</Link></Button>}
          {lastDecided && (
            <Button variant="ghost" onClick={() => { undoMut.mutate(lastDecided); setLastDecided(null); }}>
              <Undo2 className="h-4 w-4" /> Letzte rückgängig
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 lg:px-8 py-4 lg:py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Swipe Queue</h1>
          <p className="text-sm text-muted-foreground">{queue.length} Fahrzeug{queue.length === 1 ? "" : "e"} · sortiert nach Deal Score</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={cn("h-4 w-4", syncMut.isPending && "animate-spin")} />
            Sync
          </Button>
          {lastDecided && (
            <Button size="sm" variant="ghost" onClick={() => { undoMut.mutate(lastDecided); setLastDecided(null); }}>
              <Undo2 className="h-4 w-4" /> Undo
            </Button>
          )}
        </div>
      </div>

      <div className="relative" style={{ minHeight: 620 }}>
        <AnimatePresence initial={false}>
          {queue.slice(0, 3).reverse().map((v, idx, arr) => {
            const isTop = idx === arr.length - 1;
            const depth = arr.length - 1 - idx;
            return (
              <SwipeCard
                key={v.id}
                vehicle={v}
                isTop={isTop}
                depth={depth}
                onDecide={(d) => handleDecide(v.id, d)}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SwipeCard({ vehicle, isTop, depth, onDecide }: {
  vehicle: VehicleWithAnalysis; isTop: boolean; depth: number;
  onDecide: (d: DecisionValue) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const skipOpacity = useTransform(x, [-160, -40], [1, 0]);
  const yesOpacity = useTransform(x, [40, 160], [0, 1]);
  const maybeOpacity = useTransform(y, [-160, -40], [1, 0]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x > 120 || velocity.x > 600) onDecide("interesting");
    else if (offset.x < -120 || velocity.x < -600) onDecide("skip");
    else if (offset.y < -120 || velocity.y < -600) onDecide("maybe");
  };

  const a = vehicle.analysis;
  const score = a?.deal_score ?? 0;
  const margin = Number(a?.expected_margin_chf ?? 0);
  const totalChf = Number(a?.total_cost_chf ?? 0);
  const marketChf = Number(a?.market_value_chf ?? 0);
  const marginPositive = margin > 0;

  return (
    <motion.div
      className={cn(
        "absolute inset-x-0 mx-auto max-w-2xl rounded-2xl border border-border bg-card shadow-card overflow-hidden",
        isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none",
      )}
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : 0,
        rotate: isTop ? rotate : 0,
        scale: 1 - depth * 0.04,
        top: depth * 8,
        zIndex: 10 - depth,
        opacity: depth > 2 ? 0 : 1,
      }}
      drag={isTop ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.6}
      onDragEnd={handleDragEnd}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1 - depth * 0.04, opacity: 1 }}
      exit={{ x: x.get() > 0 ? 600 : x.get() < 0 ? -600 : 0, y: y.get() < 0 ? -600 : 0, opacity: 0, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
    >
      {isTop && (
        <>
          <motion.div style={{ opacity: yesOpacity }} className="absolute inset-0 z-20 pointer-events-none bg-success/10 border-4 border-success/60 rounded-2xl flex items-start justify-end p-6">
            <span className="px-4 py-2 rounded-full bg-success text-success-foreground font-bold text-lg rotate-12">INTERESTED</span>
          </motion.div>
          <motion.div style={{ opacity: skipOpacity }} className="absolute inset-0 z-20 pointer-events-none bg-danger/10 border-4 border-danger/60 rounded-2xl flex items-start justify-start p-6">
            <span className="px-4 py-2 rounded-full bg-danger text-danger-foreground font-bold text-lg -rotate-12">SKIP</span>
          </motion.div>
          <motion.div style={{ opacity: maybeOpacity }} className="absolute inset-0 z-20 pointer-events-none bg-warning/10 border-4 border-warning/60 rounded-2xl flex items-start justify-center p-6">
            <span className="px-4 py-2 rounded-full bg-warning text-warning-foreground font-bold text-lg">MAYBE</span>
          </motion.div>
        </>
      )}

      <div className="relative aspect-[16/10] bg-muted">
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt={vehicle.title} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Kein Bild</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <ScoreBadge score={score} />
          {score >= 85 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-primary text-primary-foreground text-xs font-semibold px-2 py-1">
              <Flame className="h-3 w-3" /> Hot
            </span>
          )}
        </div>
        <div className="absolute bottom-3 left-3 right-3 text-white">
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

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Listenpreis DE</div>
            <div className="text-lg font-semibold tabular-nums">{vehicle.price_eur ? fmtEur(Number(vehicle.price_eur)) : "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total CH-Kosten</div>
            <div className="text-lg font-semibold tabular-nums">{totalChf ? fmtChf(totalChf) : "—"}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">inkl. Transport, MwSt., MFK</div>
          </div>
        </div>

        <div className={cn(
          "rounded-xl p-3 border",
          marginPositive ? "bg-success/10 border-success/30" : "bg-danger/10 border-danger/30",
        )}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Erwartete Marge</div>
              <div className={cn("text-2xl font-bold tabular-nums", marginPositive ? "text-success" : "text-danger")}>
                {marginPositive ? "+" : ""}{fmtChf(margin)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Verkauf @</div>
              <div className="text-sm font-semibold tabular-nums">{marketChf ? fmtChf(marketChf) : "—"}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{vehicle.source} · {vehicle.received_at ? new Date(vehicle.received_at).toLocaleDateString("de-CH") : "—"}</span>
          <Link to="/vehicle/$id" params={{ id: vehicle.id }} className="text-primary hover:underline font-medium">
            Vollansicht →
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button variant="outline" className="h-12 border-danger/40 hover:bg-danger/10 hover:text-danger" onClick={() => onDecide("skip")}>
            <X className="h-5 w-5" /> Skip
          </Button>
          <Button variant="outline" className="h-12 border-warning/40 hover:bg-warning/10 hover:text-warning" onClick={() => onDecide("maybe")}>
            <Bookmark className="h-5 w-5" /> Maybe
          </Button>
          <Button className="h-12 bg-gradient-success text-success-foreground hover:opacity-90 font-semibold" onClick={() => onDecide("interesting")}>
            <Check className="h-5 w-5" /> Interessant
          </Button>
        </div>
      </div>
    </motion.div>
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
