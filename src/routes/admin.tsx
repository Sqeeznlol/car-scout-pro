import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Save, Sliders, Mail, Sparkles, Ban, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchConfig, saveConfig, fetchVehicles, type DbConfig } from "@/lib/db";
import { fmtChf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

async function triggerSync() {
  const res = await fetch("/api/public/hooks/sync-gmail", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return res.json();
}

function AdminPage() {
  const qc = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: fetchVehicles });
  const [draft, setDraft] = useState<DbConfig | null>(null);

  useEffect(() => { if (config && !draft) setDraft(config); }, [config, draft]);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<DbConfig>) => saveConfig(patch),
    onSuccess: () => { toast.success("Konfiguration gespeichert"); qc.invalidateQueries({ queryKey: ["config"] }); },
    onError: (e: Error) => toast.error("Fehler beim Speichern", { description: e.message }),
  });

  const syncMut = useMutation({
    mutationFn: triggerSync,
    onSuccess: (r) => {
      toast.success(`${r.inserted ?? 0} neue Inserate`, { description: `${r.checked ?? 0} Mails geprüft` });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  const weightSum = useMemo(() => {
    if (!draft) return 0;
    return (draft.weight_margin + draft.weight_liquidity + draft.weight_risk + draft.weight_learning);
  }, [draft]);

  const insights = useMemo(() => {
    const liked = vehicles.filter((v) => v.decision?.decision === "interesting");
    const makes: Record<string, number> = {};
    let total = 0;
    for (const v of liked) {
      if (v.make) makes[v.make] = (makes[v.make] || 0) + 1;
      total += v.analysis?.deal_score ?? 0;
    }
    return {
      count: liked.length,
      topMakes: Object.entries(makes).sort((a, b) => b[1] - a[1]).slice(0, 5),
      avgScore: liked.length ? Math.round(total / liked.length) : 0,
      decisionCount: vehicles.filter((v) => v.decision).length,
    };
  }, [vehicles]);

  if (!draft) return <div className="p-12 text-center text-muted-foreground">Lade Konfiguration…</div>;

  const save = () => {
    if (weightSum !== 100) { toast.error(`Score-Gewichte müssen 100 ergeben (aktuell ${weightSum})`); return; }
    saveMut.mutate(draft);
  };

  const update = <K extends keyof DbConfig>(k: K, v: DbConfig[K]) => setDraft({ ...draft, [k]: v });

  return (
    <div className="mx-auto max-w-5xl px-4 lg:px-8 py-4 lg:py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Kostenmodell, Score-Gewichte und Gmail-Sync verwalten.</p>
        </div>
        <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
          <RefreshCw className={cn("h-4 w-4", syncMut.isPending && "animate-spin")} />
          Gmail Sync
        </Button>
      </div>

      <Tabs defaultValue="costs">
        <TabsList className="w-full overflow-x-auto flex justify-start lg:grid lg:grid-cols-5">
          <TabsTrigger value="costs"><Sliders className="h-4 w-4" /> Kosten</TabsTrigger>
          <TabsTrigger value="weights"><Sparkles className="h-4 w-4" /> Gewichte</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4" /> E-Mail</TabsTrigger>
          <TabsTrigger value="insights"><Sparkles className="h-4 w-4" /> Insights</TabsTrigger>
          <TabsTrigger value="blacklist"><Ban className="h-4 w-4" /> Filter</TabsTrigger>
        </TabsList>

        <TabsContent value="costs" className="space-y-4 mt-4">
          <Card>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="EUR / CHF Kurs">
                <Input type="number" step="0.01" value={String(draft.eur_chf_rate)}
                  onChange={(e) => update("eur_chf_rate", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Transport (CHF / km)">
                <Input type="number" step="0.05" value={String(draft.chf_per_km)}
                  onChange={(e) => update("chf_per_km", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Zoll pauschal (CHF)">
                <Input type="number" value={String(draft.customs_flat)}
                  onChange={(e) => update("customs_flat", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="MwSt. (z.B. 0.081)">
                <Input type="number" step="0.001" value={String(draft.vat_rate)}
                  onChange={(e) => update("vat_rate", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Automobilsteuer (z.B. 0.04)">
                <Input type="number" step="0.001" value={String(draft.automobilsteuer_rate)}
                  onChange={(e) => update("automobilsteuer_rate", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="MFK pauschal (CHF)">
                <Input type="number" value={String(draft.mfk_flat)}
                  onChange={(e) => update("mfk_flat", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Aufbereitung pauschal (CHF)">
                <Input type="number" value={String(draft.preparation_flat)}
                  onChange={(e) => update("preparation_flat", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Zielmarge (CHF)">
                <Input type="number" value={String(draft.target_margin_chf)}
                  onChange={(e) => update("target_margin_chf", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="CO₂ Warnschwelle (g/km)">
                <Input type="number" value={String(draft.co2_threshold_gkm)}
                  onChange={(e) => update("co2_threshold_gkm", parseFloat(e.target.value) || 0)} />
              </Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="weights" className="space-y-4 mt-4">
          <Card>
            <div className="space-y-5">
              {([
                ["weight_margin", "Marge"],
                ["weight_liquidity", "Liquidität"],
                ["weight_risk", "Risiko"],
                ["weight_learning", "Learning"],
              ] as const).map(([k, label]) => (
                <div key={k}>
                  <div className="flex items-center justify-between mb-2">
                    <Label>{label}</Label>
                    <span className="text-sm tabular-nums font-medium">{draft[k]}%</span>
                  </div>
                  <Slider
                    value={[draft[k]]}
                    max={60}
                    step={1}
                    onValueChange={([val]) => update(k, val)}
                  />
                </div>
              ))}
              <div className={cn(
                "rounded-md p-3 text-sm flex items-center justify-between border",
                weightSum === 100 ? "bg-success/10 border-success/30 text-success" : "bg-warning/10 border-warning/30 text-warning",
              )}>
                <span>Total</span>
                <span className="font-semibold tabular-nums">{weightSum}% {weightSum === 100 ? "✓" : "(muss 100% sein)"}</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <div className="font-medium">Gmail (swissplatesdev@gmail.com)</div>
                  <div className="text-xs text-muted-foreground">Verbunden via Lovable Connector · liest mobile.de-Mails</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
                  <RefreshCw className={cn("h-4 w-4", syncMut.isPending && "animate-spin")} />
                  Jetzt synchronisieren
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                Bei jedem Sync werden neue mobile.de-Mails geparst, Fahrzeuge angelegt und Kosten/Deal Score berechnet.
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-4 space-y-4">
          <Card>
            {insights.decisionCount < 5 ? (
              <div className="text-sm text-muted-foreground">
                Insights ab 5+ Entscheidungen. Aktuell: <span className="font-medium text-foreground">{insights.decisionCount}</span>.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Bevorzugte Marken (Interessant)</div>
                  <div className="flex flex-wrap gap-2">
                    {insights.topMakes.map(([m, n]) => (
                      <span key={m} className="rounded-full bg-surface border border-border text-xs px-2.5 py-1">
                        {m} · {n}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <div className="font-medium text-primary">Durchschnittlicher Deal Score (Interessant): {insights.avgScore}</div>
                  Zielmarge: {fmtChf(Number(draft.target_margin_chf))}.
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="blacklist" className="mt-4 space-y-4">
          <Card>
            <div className="text-sm text-muted-foreground">
              Filter-Regeln folgen in einer späteren Version. Vorerst werden alle eingehenden Inserate gelistet.
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end sticky bottom-20 lg:bottom-4">
        <Button onClick={save} disabled={saveMut.isPending} className="bg-gradient-primary text-primary-foreground shadow-card">
          <Save className="h-4 w-4" /> {saveMut.isPending ? "Speichere…" : "Änderungen speichern"}
        </Button>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-5">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
