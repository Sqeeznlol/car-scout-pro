import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Check, X, Bookmark, MapPin, Gauge, Calendar, TrendingDown, Flame, Undo2, Fuel } from "lucide-react";
import { vehicles, analyses } from "@/lib/seed";
import { useRadarStore } from "@/lib/store";
import { fmtChf, fmtEur, fmtKm, riskDotClass } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Vehicle, VehicleAnalysis, Decision } from "@/lib/types";

export const Route = createFileRoute("/queue")({
  component: QueuePage,
});

function QueuePage() {
  const decisions = useRadarStore((s) => s.decisions);
  const decide = useRadarStore((s) => s.decide);
  const undo = useRadarStore((s) => s.undo);
  const markVisited = useRadarStore((s) => s.markVisited);

  useEffect(() => { markVisited(); }, [markVisited]);

  const queue = useMemo(() => {
    return vehicles
      .filter((v) => !decisions[v.id])
      .map((v) => ({ v, a: analyses[v.id]! }))
      .sort((x, y) => y.a.dealScore - x.a.dealScore);
  }, [decisions]);

  const [lastDecided, setLastDecided] = useState<string | null>(null);

  const handleDecide = (id: string, d: Decision) => {
    decide(id, d);
    setLastDecided(id);
  };

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <div className="h-20 w-20 rounded-2xl bg-gradient-success/20 flex items-center justify-center mb-6 shadow-glow-success">
          <Flame className="h-10 w-10 text-success" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Queue cleared</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          No vehicles waiting for a decision. New listings from mobile.de will land here automatically.
        </p>
        <div className="mt-6 flex gap-2">
          <Button asChild variant="outline"><Link to="/archive">View archive</Link></Button>
          {lastDecided && (
            <Button onClick={() => { undo(lastDecided); setLastDecided(null); }}>
              <Undo2 className="h-4 w-4" /> Undo last
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
          <p className="text-sm text-muted-foreground">{queue.length} vehicle{queue.length === 1 ? "" : "s"} · sorted by deal score</p>
        </div>
        {lastDecided && (
          <Button size="sm" variant="ghost" onClick={() => { undo(lastDecided); setLastDecided(null); }}>
            <Undo2 className="h-4 w-4" /> Undo
          </Button>
        )}
      </div>

      <div className="relative" style={{ minHeight: 620 }}>
        <AnimatePresence initial={false}>
          {queue.slice(0, 3).reverse().map(({ v, a }, idx, arr) => {
            const isTop = idx === arr.length - 1;
            const depth = arr.length - 1 - idx;
            return (
              <SwipeCard
                key={v.id}
                vehicle={v}
                analysis={a}
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

function SwipeCard({
  vehicle, analysis, isTop, depth, onDecide,
}: {
  vehicle: Vehicle; analysis: VehicleAnalysis; isTop: boolean; depth: number;
  onDecide: (d: Decision) => void;
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

  const priceDropped = vehicle.previousPriceEur && vehicle.previousPriceEur > vehicle.priceEur;
  const totalChf = analysis.totalCostChf;
  const marginPositive = analysis.expectedMarginChf > 0;
  const belowMarket = analysis.priceVsMarketPercent < -10;

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
      {/* swipe overlays */}
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

      {/* image */}
      <div className="relative aspect-[16/10] bg-muted">
        <img src={vehicle.image} alt={vehicle.title} className="w-full h-full object-cover" draggable={false} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <ScoreBadge score={analysis.dealScore} />
          {belowMarket && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/90 text-success-foreground text-xs font-semibold px-2 py-1">
              <TrendingDown className="h-3 w-3" /> Below market
            </span>
          )}
          {analysis.dealScore >= 85 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-primary text-primary-foreground text-xs font-semibold px-2 py-1">
              <Flame className="h-3 w-3" /> Hot
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur px-2.5 py-1 text-xs text-white/90">
          <span className={cn("h-2 w-2 rounded-full", riskDotClass(analysis.riskLevel))} />
          {analysis.riskLevel} risk
        </div>
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <div className="text-xs uppercase tracking-wider text-white/70">{vehicle.make}</div>
          <div className="text-xl font-semibold leading-tight">{vehicle.title}</div>
        </div>
      </div>

      {/* body */}
      <div className="p-4 lg:p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Spec icon={<Calendar className="h-3.5 w-3.5" />} label={String(vehicle.year)} sub="First reg." />
          <Spec icon={<Gauge className="h-3.5 w-3.5" />} label={fmtKm(vehicle.mileage)} sub="Mileage" />
          <Spec icon={<Fuel className="h-3.5 w-3.5" />} label={vehicle.fuelType} sub={vehicle.transmission} />
          <Spec icon={<MapPin className="h-3.5 w-3.5" />} label={`${analysis.distanceKm} km`} sub={`${vehicle.locationCity} → Kloten`} />
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">List price</div>
            <div className="text-lg font-semibold tabular-nums">{fmtEur(vehicle.priceEur)}</div>
            {priceDropped && (
              <div className="text-[11px] text-success flex items-center gap-1 mt-0.5">
                <TrendingDown className="h-3 w-3" />
                {fmtEur(vehicle.previousPriceEur! - vehicle.priceEur)} drop
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total CH cost</div>
            <div className="text-lg font-semibold tabular-nums">{fmtChf(totalChf)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">incl. transport, tax, MFK</div>
          </div>
        </div>

        <div className={cn(
          "rounded-xl p-3 border",
          marginPositive ? "bg-success/10 border-success/30" : "bg-danger/10 border-danger/30",
        )}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Expected margin</div>
              <div className={cn("text-2xl font-bold tabular-nums", marginPositive ? "text-success" : "text-danger")}>
                {marginPositive ? "+" : ""}{fmtChf(analysis.expectedMarginChf)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sell @</div>
              <div className="text-sm font-semibold tabular-nums">{fmtChf(analysis.estimatedSellPriceCh)}</div>
              <div className="text-[11px] text-muted-foreground">{analysis.priceVsMarketPercent.toFixed(1)}% vs market</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Listed {vehicle.daysListed}d ago · {vehicle.sourcePlatform}</span>
          <Link to="/vehicle/$id" params={{ id: vehicle.id }} className="text-primary hover:underline font-medium">
            Full details →
          </Link>
        </div>

        {/* action buttons */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            variant="outline"
            className="h-12 border-danger/40 hover:bg-danger/10 hover:text-danger"
            onClick={() => onDecide("skip")}
          >
            <X className="h-5 w-5" /> Skip
          </Button>
          <Button
            variant="outline"
            className="h-12 border-warning/40 hover:bg-warning/10 hover:text-warning"
            onClick={() => onDecide("maybe")}
          >
            <Bookmark className="h-5 w-5" /> Maybe
          </Button>
          <Button
            className="h-12 bg-gradient-success text-success-foreground hover:opacity-90 font-semibold"
            onClick={() => onDecide("interesting")}
          >
            <Check className="h-5 w-5" /> Interested
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
