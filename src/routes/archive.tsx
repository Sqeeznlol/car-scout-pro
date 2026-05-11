import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, ArrowUpDown, Check, X, Bookmark, Undo2 } from "lucide-react";
import { vehicles, analyses } from "@/lib/seed";
import { useRadarStore } from "@/lib/store";
import { fmtChf, fmtKm } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Decision } from "@/lib/types";

export const Route = createFileRoute("/archive")({
  component: ArchivePage,
});

const decisionMeta: Record<Decision, { label: string; icon: React.ReactNode; cls: string }> = {
  interesting: { label: "Interested", icon: <Check className="h-3.5 w-3.5" />, cls: "bg-success/15 text-success border-success/30" },
  maybe: { label: "Maybe", icon: <Bookmark className="h-3.5 w-3.5" />, cls: "bg-warning/15 text-warning border-warning/30" },
  skip: { label: "Skipped", icon: <X className="h-3.5 w-3.5" />, cls: "bg-danger/15 text-danger border-danger/30" },
};

function ArchivePage() {
  const decisions = useRadarStore((s) => s.decisions);
  const undo = useRadarStore((s) => s.undo);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Decision>("all");

  const rows = useMemo(() => {
    return Object.values(decisions)
      .map((d) => {
        const v = vehicles.find((x) => x.id === d.vehicleId);
        const a = analyses[d.vehicleId];
        return v && a ? { d, v, a } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter(({ v }) =>
        q ? `${v.title} ${v.make} ${v.model}`.toLowerCase().includes(q.toLowerCase()) : true,
      )
      .filter(({ d }) => (filter === "all" ? true : d.decision === filter))
      .sort((a, b) => new Date(b.d.decidedAt).getTime() - new Date(a.d.decidedAt).getTime());
  }, [decisions, q, filter]);

  const stats = useMemo(() => {
    const all = Object.values(decisions);
    const interested = all.filter((d) => d.decision === "interesting").length;
    return {
      total: all.length,
      interested,
      conversion: all.length ? Math.round((interested / all.length) * 100) : 0,
    };
  }, [decisions]);

  return (
    <div className="mx-auto max-w-6xl px-4 lg:px-8 py-4 lg:py-8 space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Archive</h1>
        <p className="text-sm text-muted-foreground">Every decision in one place. Filter, search, revisit.</p>
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Decisions" value={stats.total} />
        <StatCard label="Interested" value={stats.interested} tone="success" />
        <StatCard label="Conversion" value={`${stats.conversion}%`} />
      </div>

      {/* filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search make, model…" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All decisions</SelectItem>
            <SelectItem value="interesting">Interested</SelectItem>
            <SelectItem value="maybe">Maybe</SelectItem>
            <SelectItem value="skip">Skipped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <ArrowUpDown className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="font-semibold mt-3">No decisions yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Head to the queue and start swiping.</p>
          <Button asChild className="mt-4"><Link to="/queue">Open queue</Link></Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {rows.map(({ d, v, a }) => {
            const m = decisionMeta[d.decision];
            return (
              <div key={v.id} className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 border-b border-border last:border-0 hover:bg-accent/30 transition">
                <img src={v.image} alt="" className="h-14 w-20 lg:h-16 lg:w-24 rounded-md object-cover bg-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link to="/vehicle/$id" params={{ id: v.id }} className="font-medium hover:underline truncate block">{v.title}</Link>
                  <div className="text-xs text-muted-foreground truncate">
                    {v.year} · {fmtKm(v.mileage)} · {v.locationCity}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border text-xs px-2 py-0.5", m.cls)}>
                      {m.icon} {m.label}
                    </span>
                    <span className={cn(
                      "text-xs tabular-nums font-medium",
                      a.expectedMarginChf > 0 ? "text-success" : "text-danger",
                    )}>
                      {a.expectedMarginChf > 0 ? "+" : ""}{fmtChf(a.expectedMarginChf)}
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1.5">
                  <ScoreBadge score={a.dealScore} size="sm" />
                  <button onClick={() => undo(v.id)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <Undo2 className="h-3 w-3" /> Undo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "success" }) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-4",
      tone === "success" && "bg-success/5 border-success/30",
    )}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums mt-1", tone === "success" && "text-success")}>{value}</div>
    </div>
  );
}
