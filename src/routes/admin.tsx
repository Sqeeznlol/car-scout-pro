import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Save, Sliders, Mail, Sparkles, Ban, RefreshCw, Users, Brain, Smartphone, Monitor, Tablet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchConfig, saveConfig, fetchVehicles, type DbConfig } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { calculateInsights } from "@/lib/insights.functions";
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
        <TabsList className="w-full overflow-x-auto flex justify-start lg:grid lg:grid-cols-4">
          <TabsTrigger value="costs"><Sliders className="h-4 w-4" /> Kosten</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4" /> E-Mail</TabsTrigger>
          <TabsTrigger value="insights"><Sparkles className="h-4 w-4" /> Insights</TabsTrigger>
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
