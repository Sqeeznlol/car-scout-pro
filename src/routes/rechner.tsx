import { createFileRoute } from "@tanstack/react-router";
import { Calculator } from "lucide-react";
import { ImportRechner } from "@/components/ImportRechner";

export const Route = createFileRoute("/rechner")({
  head: () => ({
    meta: [
      { title: "Importrechner — autosnipe.shop" },
      { name: "description", content: "Schweiz Importkosten Rechner: DE → Kloten. Live-Berechnung Einstandspreis inkl. MwSt, Zoll, Automobilsteuer." },
    ],
  }),
  component: RechnerPage,
});

function RechnerPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">autosnipe.shop</div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="h-6 w-6 text-primary" />
          Importrechner
        </h1>
        <p className="text-sm text-muted-foreground">Deutschland → Schweiz Kloten · Live-Berechnung</p>
      </div>

      <ImportRechner initialPrice={0} initialDistance={300} />

      <div className="rounded-xl border border-border bg-surface/40 p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-medium text-foreground mb-1">Feste Steuersätze (gesetzlich)</div>
        <div>· Deutsche MwSt: <span className="tabular-nums">19 %</span> (§12 UStG)</div>
        <div>· Schweizer Automobilsteuer: <span className="tabular-nums">4 %</span></div>
        <div>· Schweizer MwSt: <span className="tabular-nums">7.7 %</span></div>
        <div className="pt-2 text-foreground/80">Variable Werte (EUR/CHF Kurs, Transport, Zoll, MFK, Aufbereitung) aus Admin-Config.</div>
      </div>
    </div>
  );
}
