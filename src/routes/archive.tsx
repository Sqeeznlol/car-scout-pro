import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, ArrowUpDown, Check, X, Bookmark, Undo2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchVehicles, undoDecision, type DecisionValue } from "@/lib/db";
import { fmtChf, fmtKm } from "@/lib/format";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/archive")({
  component: ArchivePage,
});

const decisionMeta: Record<DecisionValue, { label: string; icon: React.ReactNode; cls: string }> = {
  interesting: { label: "Interessant", icon: <Check className="h-3.5 w-3.5" />, cls: "bg-success/15 text-success border-success/30" },
  maybe: { label: "Vielleicht", icon: <Bookmark className="h-3.5 w-3.5" />, cls: "bg-warning/15 text-warning border-warning/30" },
  skip: { label: "Skip", icon: <X className="h-3.5 w-3.5" />, cls: "bg-danger/15 text-danger border-danger/30" },
};

function ArchivePage() {
  const qc = useQueryClient();
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: fetchVehicles });
  const undoMut = useMutation({
    mutationFn: (id: string) => undoDecision(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | DecisionValue>("all");

  const rows = useMemo(() => {
    return vehicles
      .filter((v) => v.decision)
      .filter((v) => (q ? `${v.title} ${v.make ?? ""} ${v.model ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true))
      .filter((v) => (filter === "all" ? true : v.decision?.decision === filter))
      .sort((a, b) => new Date(b.decision!.decided_at).getTime() - new Date(a.decision!.decided_at).getTime());
  }, [vehicles, q, filter]);

  const stats = useMemo(() => {
    const decided = vehicles.filter((v) => v.decision);
    const interested = decided.filter((v) => v.decision!.decision === "interesting").length;
    return {
      total: decided.length,
      interested,
      conversion: decided.length ? Math.round((interested / decided.length) * 100) : 0,
    };
  }, [vehicles]);

  return (
    <div className="mx-auto max-w-6xl px-4 lg:px-8 py-4 lg:py-8 space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Archiv</h1>
        <p className="text-sm text-muted-foreground">Jede Entscheidung an einem Ort. Filtern, suchen, nachsehen.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Entscheidungen" value={stats.total} />
        <StatCard label="Interessant" value={stats.interested} tone="success" />
        <StatCard label="Conversion" value={`${stats.conversion}%`} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Marke, Modell suchen…" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="interesting">Interessant</SelectItem>
            <SelectItem value="maybe">Vielleicht</SelectItem>
            <SelectItem value="skip">Skip</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <ArrowUpDown className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="font-semibold mt-3">Noch keine Entscheidungen</h3>
          <p className="text-sm text-muted-foreground mt-1">Geh zur Queue und fang an zu swipen.</p>
          <Button asChild className="mt-4"><Link to="/queue">Queue öffnen</Link></Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {rows.map((v) => {
            const m = decisionMeta[v.decision!.decision];
            const margin = Number(v.analysis?.expected_margin_chf ?? 0);
            return (
              <div key={v.id} className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 border-b border-border last:border-0 hover:bg-accent/30 transition">
                {v.image_url ? (
                  <img src={v.image_url} alt="" className="h-14 w-20 lg:h-16 lg:w-24 rounded-md object-cover bg-muted shrink-0" />
                ) : (
                  <div className="h-14 w-20 lg:h-16 lg:w-24 rounded-md bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <Link to="/vehicle/$id" params={{ id: v.id }} className="font-medium hover:underline truncate block">{v.title}</Link>
                  <div className="text-xs text-muted-foreground truncate">
                    {v.year ?? "—"} · {v.mileage_km ? fmtKm(v.mileage_km) : "—"} · {v.location ?? "—"}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border text-xs px-2 py-0.5", m.cls)}>
                      {m.icon} {m.label}
                    </span>
                    <span className={cn("text-xs tabular-nums font-medium", margin > 0 ? "text-success" : "text-danger")}>
                      {margin > 0 ? "+" : ""}{fmtChf(margin)}
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1.5">
                  <button onClick={() => undoMut.mutate(v.id)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <Undo2 className="h-3 w-3" /> Rückgängig
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
    <div className={cn("rounded-xl border border-border bg-card p-4", tone === "success" && "bg-success/5 border-success/30")}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums mt-1", tone === "success" && "text-success")}>{value}</div>
    </div>
  );
}
