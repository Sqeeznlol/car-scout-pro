import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Save, Sliders, Mail, Sparkles, Ban, RefreshCw, Users, Brain, Smartphone, Monitor, Tablet, ListChecks, ChevronDown, ChevronUp, Car as CarIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchConfig, saveConfig, fetchVehicles, type DbConfig } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { calculateInsights } from "@/lib/insights.functions";
import { recalculateAllVehicles } from "@/lib/recalculate.functions";
import { refreshAutoScoutAll } from "@/lib/refresh-autoscout.functions";
import { fmtChf, fmtNum } from "@/lib/format";
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

  const insights = useMemo(() => {
    const liked = vehicles.filter((v) => v.decision?.decision === "interesting");
    const makes: Record<string, number> = {};
    let totalMargin = 0;
    for (const v of liked) {
      if (v.make) makes[v.make] = (makes[v.make] || 0) + 1;
      const m = v.seller_has_mwst === true
        ? Number(v.analysis?.margin_with_mwst_chf ?? v.analysis?.expected_margin_chf ?? 0)
        : Number(v.analysis?.margin_without_mwst_chf ?? v.analysis?.expected_margin_chf ?? 0);
      totalMargin += m;
    }
    return {
      count: liked.length,
      topMakes: Object.entries(makes).sort((a, b) => b[1] - a[1]).slice(0, 5),
      avgMargin: liked.length ? Math.round(totalMargin / liked.length) : 0,
      decisionCount: vehicles.filter((v) => v.decision).length,
    };
  }, [vehicles]);

  if (!draft) return <div className="p-12 text-center text-muted-foreground">Lade Konfiguration…</div>;

  const save = () => {
    saveMut.mutate(draft);
  };

  const update = <K extends keyof DbConfig>(k: K, v: DbConfig[K]) => setDraft({ ...draft, [k]: v });

  return (
    <div className="mx-auto max-w-5xl px-4 lg:px-8 py-4 lg:py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Kostenmodell und Gmail-Sync verwalten.</p>
        </div>
        <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
          <RefreshCw className={cn("h-4 w-4", syncMut.isPending && "animate-spin")} />
          Gmail Sync
        </Button>
      </div>

      <Tabs defaultValue="costs">
        <TabsList className="w-full overflow-x-auto flex justify-start lg:grid lg:grid-cols-7">
          <TabsTrigger value="costs"><Sliders className="h-4 w-4" /> Kosten</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4" /> E-Mail</TabsTrigger>
          <TabsTrigger value="insights"><Sparkles className="h-4 w-4" /> Insights</TabsTrigger>
          <TabsTrigger value="visitors"><Users className="h-4 w-4" /> Besucher</TabsTrigger>
          <TabsTrigger value="activity"><ListChecks className="h-4 w-4" /> Aktivitäten</TabsTrigger>
          <TabsTrigger value="algo"><Brain className="h-4 w-4" /> Algorithmus</TabsTrigger>
          <TabsTrigger value="blacklist"><Ban className="h-4 w-4" /> Filter</TabsTrigger>
        </TabsList>

        <TabsContent value="costs" className="space-y-4 mt-4">
          <Card>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Pauschalwerte — anpassbar
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="EUR / CHF Kurs">
                <Input type="number" step="0.01" value={String(draft.eur_chf_rate)}
                  onChange={(e) => update("eur_chf_rate", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Transport (CHF / km)">
                <Input type="number" step="0.05" value={String(draft.chf_per_km)}
                  onChange={(e) => update("chf_per_km", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Zoll Pauschal (CHF)">
                <Input type="number" value={String(draft.customs_flat)}
                  onChange={(e) => update("customs_flat", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="MFK Pauschal (CHF)">
                <Input type="number" value={String(draft.mfk_flat)}
                  onChange={(e) => update("mfk_flat", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Aufbereitung Pauschal (CHF)">
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

          <Card>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Gesetzliche Steuersätze — fix, nicht änderbar
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Deutsche MwSt", value: "19.0%", note: "DE Gesetz" },
                { label: "Automobilsteuer CH", value: "4.0%", note: "CH Gesetz" },
                { label: "Schweizer MwSt", value: "7.7%", note: "CH Gesetz" },
              ].map((item) => (
                <div key={item.label} className="bg-surface border border-border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                  <div className="text-lg font-bold">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.note}</div>
                </div>
              ))}
            </div>
          </Card>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <div className="flex gap-2">
              <span className="text-primary">ℹ️</span>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground">Steuerliche Grundlage DE → CH</div>
                <div>Bei Kauf von deutschen Händlern (mit Rechnung + MwSt-Ausweis) wird die DE MwSt von 19% beim Export zurückerstattet — das sind bei einem 30'000 € Auto ca. CHF 4'500 weniger Einstandspreis.</div>
                <div>Bei Privatkauf oder Differenzbesteuerung (§25a UStG) ist kein MwSt-Abzug möglich.</div>
              </div>
            </div>
          </div>

          <RecalculateCard />
          <RefreshAutoScoutCard />
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
                Bei jedem Sync werden neue mobile.de-Mails geparst, Fahrzeuge angelegt und Importkosten berechnet.
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
                  <div className="font-medium text-primary">Ø Marge bei „Interessant": {fmtChf(insights.avgMargin)}</div>
                  Zielmarge: {fmtChf(Number(draft.target_margin_chf))}.
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="blacklist" className="mt-4 space-y-4">
          <Card>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
              <div className="font-medium mb-2">ℹ️ Automatisch ausgeblendet</div>
              <p className="text-muted-foreground mb-2">
                Folgende Treibstofftypen werden systemweit ignoriert und erscheinen nie im Tool:
              </p>
              <ul className="text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Elektro</li>
                <li>Hybrid / Plug-in Hybrid / Mild-Hybrid</li>
                <li>Gas / Erdgas / LPG / CNG</li>
              </ul>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="visitors" className="mt-4">
          <VisitorsTab />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityTab />
        </TabsContent>

        <TabsContent value="algo" className="mt-4">
          <AlgorithmTab />
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

function RecalculateCard() {
  const qc = useQueryClient();
  const recalcFn = useServerFn(recalculateAllVehicles);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated: number; total: number } | null>(null);

  const handleRecalculate = async () => {
    setLoading(true);
    try {
      const r = await recalcFn();
      setResult({ updated: r.updated, total: r.total });
      toast.success(`${r.updated} von ${r.total} Fahrzeugen neu berechnet`);
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    } catch (e) {
      toast.error("Fehler beim Neuberechnen", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Wartung — Neuberechnung
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        Nach einer Änderung der Kostenwerte können alle bestehenden Fahrzeuge mit der aktuellen Konfiguration neu berechnet werden.
      </p>
      <Button onClick={handleRecalculate} disabled={loading} variant="outline">
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        {loading ? "Berechne neu…" : "Alle Fahrzeuge neu berechnen"}
      </Button>
      {result && (
        <div className="mt-3 text-sm text-muted-foreground">
          ✅ {result.updated} / {result.total} Fahrzeuge aktualisiert
        </div>
      )}
    </Card>
  );
}

function RefreshAutoScoutCard() {
  const qc = useQueryClient();
  const refreshFn = useServerFn(refreshAutoScoutAll);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number; total: number; errors: string[] } | null>(null);

  const handleRefresh = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await refreshFn();
      setResult({ updated: r.updated, skipped: r.skipped, total: r.total, errors: r.errors });
      if (r.errors.length === 0) toast.success(`${r.updated} Fahrzeuge mit CH-Marktwert aktualisiert`);
      else toast.warning(`${r.updated} aktualisiert, ${r.errors.length} Fehler`);
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    } catch (e) {
      toast.error("Fehler beim AutoScout-Abruf", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        CH-Marktwerte (AutoScout24.ch)
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        Ruft für jedes Fahrzeug den aktuellen Schweizer Marktpreis von AutoScout24.ch ab.
        Fahrzeuge die in den letzten 7 Tagen abgefragt wurden werden übersprungen. Ca. 1.5s pro Fahrzeug.
      </p>
      <Button onClick={handleRefresh} disabled={loading} variant="outline">
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        {loading ? "Frage AutoScout24.ch ab…" : "CH-Marktwerte aktualisieren"}
      </Button>
      {result && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="text-muted-foreground">
            ✅ {result.updated} aktualisiert · {result.skipped} übersprungen · {result.total} gesamt
          </div>
          {result.errors.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{result.errors.length} Fehler</summary>
              <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                {result.errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

interface SessionRow {
  id: string;
  session_id: string;
  ip_address: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  screen_width: number | null;
  screen_height: number | null;
  total_decisions: number;
  total_interesting: number;
  first_seen: string;
  last_seen: string;
}

function VisitorsTab() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["user_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*")
        .order("last_seen", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  if (isLoading) return <Card><div className="text-sm text-muted-foreground">Lade…</div></Card>;
  if (!sessions.length) {
    return <Card><div className="text-sm text-muted-foreground">Noch keine Besucher erfasst.</div></Card>;
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const Icon = s.device_type === "mobile" ? Smartphone : s.device_type === "tablet" ? Tablet : Monitor;
        const rate = s.total_decisions > 0 ? Math.round((s.total_interesting / s.total_decisions) * 100) : 0;
        return (
          <Card key={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-base font-semibold">
                  {s.city || "—"}{s.country ? `, ${s.country}` : ""}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">🌐 {s.ip_address ?? "unbekannt"}</div>
              </div>
              <div className="text-right">
                <div className="text-sm flex items-center gap-1.5 justify-end">
                  <Icon className="h-3.5 w-3.5" />
                  {s.os} · {s.browser}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {s.screen_width}×{s.screen_height}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat value={fmtNum(s.total_decisions)} label="Entscheide" />
              <Stat value={fmtNum(s.total_interesting)} label="Interessant" />
              <Stat value={`${rate}%`} label="Rate" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-2">
              <span>Zuerst: {new Date(s.first_seen).toLocaleString("de-CH")}</span>
              <span>Zuletzt: {new Date(s.last_seen).toLocaleString("de-CH")}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

interface InsightRow {
  id: string;
  calculated_at: string;
  total_decisions: number | null;
  total_interesting: number | null;
  conversion_rate: number | null;
  preferred_makes: Array<{ make: string; interest_rate: number; total: number }> | null;
  preferred_fuel_types: Array<{ fuel: string; interest_rate: number; total: number }> | null;
  preferred_year_min: number | null;
  preferred_year_max: number | null;
  preferred_mileage_max: number | null;
  preferred_price_min_eur: number | null;
  preferred_price_max_eur: number | null;
  preferred_margin_min_chf: number | null;
  margin_correlation: number | null;
  market_price_correlation: number | null;
  mileage_correlation: number | null;
  avg_time_on_interesting_ms: number | null;
  avg_time_on_skip_ms: number | null;
  autoscout_check_rate: number | null;
}

function AlgorithmTab() {
  const qc = useQueryClient();
  const calcFn = useServerFn(calculateInsights);
  const { data: insight, isLoading } = useQuery({
    queryKey: ["algorithm_insights_latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("algorithm_insights")
        .select("*")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as InsightRow | null;
    },
  });

  const calcMut = useMutation({
    mutationFn: () => calcFn(),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Algorithmus berechnet", { description: `${r.totals?.total} Entscheidungen analysiert` });
        qc.invalidateQueries({ queryKey: ["algorithm_insights_latest"] });
      } else {
        toast.warning("Zu wenig Daten", { description: `Nur ${r.count ?? 0} Entscheidungen vorhanden (min. 5)` });
      }
    },
    onError: (e: Error) => toast.error("Fehler", { description: e.message }),
  });

  if (isLoading) return <Card><div className="text-sm text-muted-foreground">Lade…</div></Card>;

  if (!insight || (insight.total_decisions ?? 0) < 5) {
    return (
      <Card>
        <div className="text-center py-6 space-y-3">
          <div className="text-4xl">🧠</div>
          <div className="font-semibold">Noch zu wenig Daten</div>
          <div className="text-sm text-muted-foreground">
            Mindestens 5 Entscheidungen nötig. Aktuell: {insight?.total_decisions ?? 0}
          </div>
          <Button onClick={() => calcMut.mutate()} disabled={calcMut.isPending}>
            <Brain className="h-4 w-4" /> Jetzt berechnen
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><Stat value={fmtNum(insight.total_decisions ?? 0)} label="Entscheide" /></Card>
        <Card><Stat value={fmtNum(insight.total_interesting ?? 0)} label="Interessant" /></Card>
        <Card><Stat value={`${Math.round((insight.conversion_rate ?? 0) * 100)}%`} label="Quote" /></Card>
      </div>

      {insight.preferred_makes && insight.preferred_makes.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">🏆 Bevorzugte Marken</h3>
          <div className="space-y-2">
            {insight.preferred_makes.map((m) => (
              <div key={m.make} className="flex items-center gap-3">
                <div className="w-20 text-sm font-medium">{m.make}</div>
                <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(m.interest_rate * 100)}%`,
                      background: m.interest_rate > 0.6 ? "#10b981" : m.interest_rate > 0.3 ? "#f59e0b" : "#6b7280",
                    }}
                  />
                </div>
                <div className="w-16 text-right text-sm tabular-nums">{Math.round(m.interest_rate * 100)}%</div>
                <div className="w-12 text-right text-xs text-muted-foreground">n={m.total}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">⏱ Zeit pro Karte</h3>
        <div className="grid grid-cols-2 gap-3">
          <Stat value={`${((insight.avg_time_on_interesting_ms ?? 0) / 1000).toFixed(1)}s`} label='Ø "Interessant"' />
          <Stat value={`${((insight.avg_time_on_skip_ms ?? 0) / 1000).toFixed(1)}s`} label='Ø "Skip"' />
        </div>
        <div className="text-xs text-muted-foreground mt-3">
          {(insight.avg_time_on_interesting_ms ?? 0) > (insight.avg_time_on_skip_ms ?? 0)
            ? "💡 Du schaust interessante Autos länger an — Entscheidungen sind durchdacht."
            : "⚡ Schnelle Entscheidungen bei beiden."}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">🔗 Korrelationen</h3>
        <CorrelationBar label="Marge ↔ Interessant" value={insight.margin_correlation ?? 0} />
        <CorrelationBar label="Marktpreis ↔ Interessant" value={insight.market_price_correlation ?? 0} />
        <CorrelationBar label="Kilometer ↔ Interessant" value={insight.mileage_correlation ?? 0} />
        <div className="text-xs text-muted-foreground mt-2">
          Positiv = höher → wahrscheinlicher "Interessant"
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">🎯 Optimale Werte</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <KV label="Preis DE" value={`${fmtNum(insight.preferred_price_min_eur ?? 0)} – ${fmtNum(insight.preferred_price_max_eur ?? 0)} €`} />
          <KV label="Max. KM" value={`${fmtNum(insight.preferred_mileage_max ?? 0)} km`} />
          <KV label="Min. Marge" value={fmtChf(insight.preferred_margin_min_chf ?? 0)} />
        </div>
        <div className="text-sm mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          🔍 AutoScout-Check Rate: <span className="font-semibold">{Math.round((insight.autoscout_check_rate ?? 0) * 100)}%</span> der interessanten Autos werden auf AutoScout24.ch nachgeschaut.
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Zuletzt berechnet: {new Date(insight.calculated_at).toLocaleString("de-CH")}
        </span>
        <Button size="sm" variant="outline" onClick={() => calcMut.mutate()} disabled={calcMut.isPending}>
          <Brain className={cn("h-4 w-4", calcMut.isPending && "animate-pulse")} />
          Neu berechnen
        </Button>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  );
}
function CorrelationBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.abs(value) * 100);
  const positive = value >= 0;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold tabular-nums", positive ? "text-success" : "text-danger")}>
          {positive ? "+" : ""}{Math.round(value * 100)}%
        </span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden flex">
        <div className="w-1/2 flex justify-end">
          {!positive && (
            <div className="h-full rounded-l-full" style={{ width: `${pct}%`, background: "#ef4444" }} />
          )}
        </div>
        <div className="w-1/2 flex justify-start">
          {positive && (
            <div className="h-full rounded-r-full" style={{ width: `${pct}%`, background: "#10b981" }} />
          )}
        </div>
      </div>
    </div>
  );
}

interface ActivityRow {
  id: string;
  decided_at: string;
  decision: string;
  time_on_card_ms: number | null;
  tapped_autoscout: boolean | null;
  tapped_listing: boolean | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_mileage: number | null;
  vehicle_price_eur: number | null;
  vehicle_fuel_type: string | null;
  margin_chf: number | null;
  seller_type: string | null;
  listing_url: string | null;
  image_url: string | null;
  session_id: string;
  ip_address: string | null;
  city: string | null;
  country: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  screen_width: number | null;
  screen_height: number | null;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "gestern";
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ActivityTab() {
  const qc = useQueryClient();
  const { data: logs = [], isLoading, isFetching } = useQuery({
    queryKey: ["admin_activity_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_activity_log" as never)
        .select("*")
        .order("decided_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as ActivityRow[];
    },
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const groups: Record<string, {
      key: string;
      ip: string;
      city: string;
      country: string;
      device_type: string;
      browser: string;
      os: string;
      screen: string;
      session_id: string;
      events: ActivityRow[];
      total: number;
      interesting: number;
      skip: number;
      maybe: number;
      lastSeen: string;
    }> = {};
    for (const log of logs) {
      const key = log.session_id ?? log.ip_address ?? "unbekannt";
      if (!groups[key]) {
        groups[key] = {
          key,
          ip: log.ip_address ?? "—",
          city: log.city ?? "—",
          country: log.country ?? "—",
          device_type: log.device_type ?? "unknown",
          browser: log.browser ?? "—",
          os: log.os ?? "—",
          screen: log.screen_width && log.screen_height ? `${log.screen_width}×${log.screen_height}` : "—",
          session_id: log.session_id,
          events: [],
          total: 0, interesting: 0, skip: 0, maybe: 0,
          lastSeen: log.decided_at,
        };
      }
      const g = groups[key];
      g.events.push(log);
      g.total++;
      if (log.decision === "interesting") g.interesting++;
      else if (log.decision === "skip") g.skip++;
      else if (log.decision === "maybe") g.maybe++;
      if (log.decided_at > g.lastSeen) g.lastSeen = log.decided_at;
    }
    return Object.values(groups).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }, [logs]);

  const toggle = (k: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  if (isLoading) return <Card><div className="text-sm text-muted-foreground">Lade…</div></Card>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Aktivitäten</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {logs.length} Entscheide von {grouped.length} Geräten
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["admin_activity_log"] })} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> Aktualisieren
        </Button>
      </div>

      {grouped.length === 0 && (
        <Card>
          <div className="text-center py-8 space-y-2">
            <ListChecks className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="font-semibold">Noch keine Aktivitäten</div>
            <div className="text-sm text-muted-foreground">Sobald Entscheidungen getroffen werden, erscheinen sie hier.</div>
          </div>
        </Card>
      )}

      {grouped.map((g) => {
        const isOpen = expanded.has(g.key);
        const Icon = g.device_type === "mobile" ? Smartphone : g.device_type === "tablet" ? Tablet : Monitor;
        const conv = g.total > 0 ? Math.round((g.interesting / g.total) * 100) : 0;
        return (
          <div key={g.key} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="w-full text-left p-4 hover:bg-surface/50 transition-colors"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{g.os} · {g.browser}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">📍 {g.city}, {g.country}</div>
                    <div className="text-xs text-muted-foreground/70 font-mono mt-0.5">🌐 {g.ip}</div>
                    <div className="text-xs text-muted-foreground/70 mt-0.5">🖥️ {g.screen}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1.5 justify-end mb-1.5 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-success/15 text-success">✓ {g.interesting}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-warning/15 text-warning">◷ {g.maybe}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-danger/15 text-danger">✕ {g.skip}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{g.total} Entscheide · {conv}%</div>
                  <div className="text-xs text-muted-foreground/70 mt-0.5">{formatRelative(g.lastSeen)}</div>
                </div>
              </div>
              <div className="flex items-center justify-center mt-3 text-xs text-muted-foreground gap-1">
                {isOpen ? <><ChevronUp className="h-3 w-3" /> Zuklappen</> : <><ChevronDown className="h-3 w-3" /> {g.total} Entscheide ansehen</>}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border">
                {g.events.map((event, i) => (
                  <ActivityRowItem key={event.id} event={event} isLast={i === g.events.length - 1} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityRowItem({ event, isLast }: { event: ActivityRow; isLast: boolean }) {
  const cfg = event.decision === "interesting"
    ? { label: "Interessant", color: "text-success", bg: "bg-success/5", icon: "✓" }
    : event.decision === "maybe"
    ? { label: "Später", color: "text-warning", bg: "bg-warning/5", icon: "◷" }
    : { label: "Skip", color: "text-danger", bg: "bg-danger/5", icon: "✕" };
  const time = new Date(event.decided_at).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", cfg.bg, !isLast && "border-b border-border/50")}>
      <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-surface border border-border flex items-center justify-center">
        {event.image_url ? (
          <img src={event.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <CarIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">
          {event.vehicle_make ?? "—"} {event.vehicle_model ?? ""} {event.vehicle_year ?? ""}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {event.vehicle_mileage != null ? `${event.vehicle_mileage.toLocaleString("de-CH")} km` : "—"}
          {" · "}{event.vehicle_price_eur != null ? `${event.vehicle_price_eur.toLocaleString("de-CH")} €` : "—"}
          {event.vehicle_fuel_type ? ` · ${event.vehicle_fuel_type}` : ""}
        </div>
        {event.margin_chf != null && (
          <div className={cn("text-xs mt-0.5 font-medium", event.margin_chf >= 3500 ? "text-success" : event.margin_chf >= 1500 ? "text-warning" : "text-danger")}>
            Marge: CHF {Math.round(event.margin_chf).toLocaleString("de-CH")}
          </div>
        )}
        {(event.tapped_autoscout || event.tapped_listing) && (
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {event.tapped_autoscout && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">🔍 AutoScout</span>
            )}
            {event.tapped_listing && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">🔗 Inserat</span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("text-base font-bold", cfg.color)}>{cfg.icon}</div>
        <div className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</div>
        <div className="text-xs text-muted-foreground mt-1">{time}</div>
        {event.time_on_card_ms != null && event.time_on_card_ms > 0 && (
          <div className="text-[10px] text-muted-foreground/70">{(event.time_on_card_ms / 1000).toFixed(1)}s</div>
        )}
      </div>
    </div>
  );
}
