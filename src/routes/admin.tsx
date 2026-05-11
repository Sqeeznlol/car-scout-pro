import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Save, Sliders, Mail, Users, Sparkles, Ban } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useRadarStore } from "@/lib/store";
import { vehicles, analyses } from "@/lib/seed";
import { fmtChf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  const config = useRadarStore((s) => s.config);
  const setConfig = useRadarStore((s) => s.setConfig);
  const decisions = useRadarStore((s) => s.decisions);

  const [draft, setDraft] = useState(config);
  const [autoFx, setAutoFx] = useState(false);

  const weightSum = Object.values(draft.scoreWeights).reduce((a, b) => a + b, 0);

  const save = () => {
    if (weightSum !== 100) {
      toast.error(`Score weights must sum to 100% (currently ${weightSum}%)`);
      return;
    }
    setConfig(draft);
    toast.success("Configuration saved");
  };

  const insights = useMemo(() => {
    const liked = Object.values(decisions).filter((d) => d.decision === "interesting");
    const makes: Record<string, number> = {};
    let totalScore = 0;
    for (const d of liked) {
      const v = vehicles.find((x) => x.id === d.vehicleId);
      const a = analyses[d.vehicleId];
      if (v) makes[v.make] = (makes[v.make] || 0) + 1;
      if (a) totalScore += a.dealScore;
    }
    return {
      count: liked.length,
      topMakes: Object.entries(makes).sort((a, b) => b[1] - a[1]).slice(0, 5),
      avgScore: liked.length ? Math.round(totalScore / liked.length) : 0,
    };
  }, [decisions]);

  return (
    <div className="mx-auto max-w-5xl px-4 lg:px-8 py-4 lg:py-8 space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Calibrate cost model, score weights, sources and filters.</p>
      </div>

      <Tabs defaultValue="costs">
        <TabsList className="w-full overflow-x-auto flex justify-start lg:grid lg:grid-cols-6">
          <TabsTrigger value="costs"><Sliders className="h-4 w-4" /> Costs</TabsTrigger>
          <TabsTrigger value="weights"><Sparkles className="h-4 w-4" /> Weights</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4" /> Email</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-4 w-4" /> Users</TabsTrigger>
          <TabsTrigger value="insights"><Sparkles className="h-4 w-4" /> Insights</TabsTrigger>
          <TabsTrigger value="blacklist"><Ban className="h-4 w-4" /> Filters</TabsTrigger>
        </TabsList>

        {/* Costs */}
        <TabsContent value="costs" className="space-y-4 mt-4">
          <Card>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="EUR / CHF rate">
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.01" value={draft.eurChfRate}
                    onChange={(e) => setDraft({ ...draft, eurChfRate: parseFloat(e.target.value) || 0 })} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={autoFx} onCheckedChange={setAutoFx} /> auto
                  </div>
                </div>
              </Field>
              <Field label="Transport (CHF / km)">
                <Input type="number" step="0.1" value={draft.chfPerKm}
                  onChange={(e) => setDraft({ ...draft, chfPerKm: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Customs flat (CHF)">
                <Input type="number" value={draft.customsFlat}
                  onChange={(e) => setDraft({ ...draft, customsFlat: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="MFK flat (CHF)">
                <Input type="number" value={draft.mfkFlat}
                  onChange={(e) => setDraft({ ...draft, mfkFlat: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Preparation flat (CHF)">
                <Input type="number" value={draft.preparationFlat}
                  onChange={(e) => setDraft({ ...draft, preparationFlat: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Target margin (CHF)">
                <Input type="number" value={draft.targetMarginChf}
                  onChange={(e) => setDraft({ ...draft, targetMarginChf: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="CO₂ warning threshold (g/km)">
                <Input type="number" value={draft.co2ThresholdGkm}
                  onChange={(e) => setDraft({ ...draft, co2ThresholdGkm: parseFloat(e.target.value) || 0 })} />
              </Field>
            </div>
          </Card>
        </TabsContent>

        {/* Weights */}
        <TabsContent value="weights" className="space-y-4 mt-4">
          <Card>
            <div className="space-y-5">
              {(Object.keys(draft.scoreWeights) as Array<keyof typeof draft.scoreWeights>).map((k) => (
                <div key={k}>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="capitalize">{k.replace(/([A-Z])/g, " $1")}</Label>
                    <span className="text-sm tabular-nums font-medium">{draft.scoreWeights[k]}%</span>
                  </div>
                  <Slider
                    value={[draft.scoreWeights[k]]}
                    max={60}
                    step={1}
                    onValueChange={([val]) =>
                      setDraft({ ...draft, scoreWeights: { ...draft.scoreWeights, [k]: val } })
                    }
                  />
                </div>
              ))}
              <div className={cn(
                "rounded-md p-3 text-sm flex items-center justify-between border",
                weightSum === 100 ? "bg-success/10 border-success/30 text-success" : "bg-warning/10 border-warning/30 text-warning",
              )}>
                <span>Total weight</span>
                <span className="font-semibold tabular-nums">{weightSum}% {weightSum === 100 ? "✓" : "(must equal 100%)"}</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Email sources */}
        <TabsContent value="email" className="mt-4">
          <Card>
            <SourceRow name="mobile.de" address="radar+mobile@inbound.example" last="2 min ago" rate={98} />
            <SourceRow name="AutoScout24.de" address="radar+autoscout@inbound.example" last="11 min ago" rate={94} />
            <SourceRow name="Mobile.de Alerts" address="radar+alerts@inbound.example" last="1 h ago" rate={99} />
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3">Dealer</th>
                    <th className="text-right py-2 px-3">Reviewed</th>
                    <th className="text-right py-2 px-3">% Interested</th>
                    <th className="text-left py-2 px-3">Top makes</th>
                    <th className="text-right py-2 px-3">Avg score liked</th>
                  </tr>
                </thead>
                <tbody>
                  <UserRow name="Marco K." reviewed={184} pct={22} makes="BMW, Audi" avg={78} />
                  <UserRow name="Sandra B." reviewed={97} pct={31} makes="Mercedes" avg={82} />
                  <UserRow name="You" reviewed={Object.keys(decisions).length} pct={insights.count ? Math.round((insights.count / Math.max(1, Object.keys(decisions).length)) * 100) : 0} makes={insights.topMakes.map((m) => m[0]).join(", ") || "—"} avg={insights.avgScore} />
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Insights */}
        <TabsContent value="insights" className="mt-4 space-y-4">
          <Card>
            {Object.keys(decisions).length < 5 ? (
              <div className="text-sm text-muted-foreground">
                Insights unlock after 50+ decisions. You have <span className="font-medium text-foreground">{Object.keys(decisions).length}</span> so far.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Top makes you like</div>
                  <div className="flex flex-wrap gap-2">
                    {insights.topMakes.map(([m, n]) => (
                      <span key={m} className="rounded-full bg-surface border border-border text-xs px-2.5 py-1">
                        {m} · {n}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <div className="font-medium text-primary">Suggested weight tweak</div>
                  Increase <span className="font-semibold">margin</span> weight to 40% — historical interest correlates strongly with margin &gt; {fmtChf(config.targetMarginChf)}.
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Blacklist */}
        <TabsContent value="blacklist" className="mt-4 space-y-4">
          <Card>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Max mileage (km)"><Input type="number" defaultValue={150000} /></Field>
              <Field label="Min year"><Input type="number" defaultValue={2017} /></Field>
              <Field label="Max price (EUR)"><Input type="number" defaultValue={120000} /></Field>
              <Field label="Excluded fuel">
                <div className="flex items-center gap-3 text-sm">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" /> Diesel</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" /> Petrol</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" /> Electric</label>
                </div>
              </Field>
            </div>
            <div className="mt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Auto-skip keywords</Label>
              <Input placeholder="e.g. unfall, motorschaden, export" className="mt-2" />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end sticky bottom-20 lg:bottom-4">
        <Button onClick={save} className="bg-gradient-primary text-primary-foreground shadow-card">
          <Save className="h-4 w-4" /> Save changes
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
function SourceRow({ name, address, last, rate }: { name: string; address: string; last: string; rate: number }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground font-mono">{address}</div>
      </div>
      <div className="text-right">
        <div className="text-sm tabular-nums">{rate}% parsed</div>
        <div className="text-xs text-muted-foreground">last {last}</div>
      </div>
    </div>
  );
}
function UserRow({ name, reviewed, pct, makes, avg }: { name: string; reviewed: number; pct: number; makes: string; avg: number }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 px-3 font-medium">{name}</td>
      <td className="py-3 px-3 text-right tabular-nums">{reviewed}</td>
      <td className="py-3 px-3 text-right tabular-nums">{pct}%</td>
      <td className="py-3 px-3 text-muted-foreground">{makes}</td>
      <td className="py-3 px-3 text-right tabular-nums">{avg}</td>
    </tr>
  );
}
