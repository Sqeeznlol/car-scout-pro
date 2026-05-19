import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Calculator, TrendingUp, Info, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { fetchConfig } from "@/lib/db";
import { calculate, type ImportConfig } from "@/lib/importCalculator";
import { cn } from "@/lib/utils";

interface Props {
  initialPrice?: number;
  initialDistance?: number;
  autoscoutAvg?: number;
  autoscoutCount?: number;
  autoscoutUrl?: string;
  vehicleName?: string;
}

const mono = { fontFamily: "'JetBrains Mono', 'DM Mono', ui-monospace, monospace" } as const;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ImportRechner({
  initialPrice = 0,
  initialDistance = 300,
  autoscoutAvg = 0,
  autoscoutCount = 0,
  autoscoutUrl,
  vehicleName,
}: Props) {
  const { data: cfg } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const [preis, setPreis] = useState<number>(initialPrice);
  const [km, setKm] = useState<number>(initialDistance);
  const [showWithout, setShowWithout] = useState(false);

  useEffect(() => { if (initialPrice) setPreis(initialPrice); }, [initialPrice]);
  useEffect(() => { if (initialDistance) setKm(initialDistance); }, [initialDistance]);

  const dPreis = useDebounced(preis, 150);
  const dKm = useDebounced(km, 150);

  const config: ImportConfig | null = useMemo(() => {
    if (!cfg) return null;
    return {
      eur_chf_rate: Number(cfg.eur_chf_rate) || 0.96,
      chf_per_km: Number(cfg.chf_per_km) || 1.5,
      zoll_chf: Number(cfg.customs_flat) || 160,
      mfk_chf: Number(cfg.mfk_flat) || 220,
      preparation_chf: Number(cfg.preparation_flat) || 100,
    };
  }, [cfg]);

  const result = useMemo(() => {
    if (!dPreis || !config) return null;
    return calculate(dPreis, dKm, autoscoutAvg, config);
  }, [dPreis, dKm, autoscoutAvg, config]);

  const fmt = (n: number) => "CHF " + Math.round(n).toLocaleString("de-CH");
  const fmtEur = (n: number) => Math.round(n).toLocaleString("de-CH") + " €";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 lg:p-6 space-y-5">
      {vehicleName && (
        <div className="flex items-center gap-3 pb-2 border-b border-border">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calculator className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Importkostenrechner</div>
            <div className="text-sm font-semibold">{vehicleName}</div>
          </div>
        </div>
      )}

      {/* Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InputBox
          label="Kaufpreis DE"
          unit="€"
          value={preis}
          onChange={setPreis}
          placeholder="29'990"
          hint={result ? `= CHF ${result.kaufpreis_chf.toLocaleString("de-CH")}` : undefined}
        />
        <InputBox
          label="Distanz → Kloten"
          unit="km"
          value={km}
          onChange={setKm}
          placeholder="300"
          hint={result ? `= CHF ${result.with_mwst.transport_chf.toLocaleString("de-CH")}` : undefined}
        />
      </div>

      {result ? (
        <>
          {/* MIT MwSt — Hauptergebnis */}
          <div className="rounded-xl border border-success/30 bg-success/5">
            <div className="flex items-start justify-between p-4 pb-3 border-b border-success/20">
              <div>
                <div className="text-sm font-semibold text-success flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Mit MwSt-Ausweis — gewerblicher Import
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Deutsche MwSt wird beim Export zurückerstattet
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-success/20 text-success">
                Dein Fall
              </span>
            </div>

            <div className="p-4 space-y-1.5 text-sm">
              <CostRow label="Kaufpreis DE (brutto)" value={`${fmtEur(result.kaufpreis_eur)}  =  ${fmt(result.kaufpreis_chf)}`} />
              <CostRow label="− DE MwSt 19% (wird erstattet)" value={`− ${fmt(result.with_mwst.de_mwst_erstattung_chf)}`} tone="success" />
              <div className="border-t border-border my-2" />
              <CostRow label="= Nettobasis (Einfuhrbasis CH)" value={fmt(result.with_mwst.netto_basis_chf)} bold />
              <CostRow indent label="+ Automobilsteuer Schweiz (4%)" value={`+ ${fmt(result.with_mwst.automobilsteuer_chf)}`} />
              <CostRow indent label="+ Zoll Schweiz (pauschal)" value={`+ ${fmt(result.with_mwst.zoll_chf)}`} />
              <CostRow indent label="+ Schweizer MwSt (7.7%)" value={`+ ${fmt(result.with_mwst.ch_mwst_chf)}`} />
              <CostRow indent label={`+ Transport (${dKm} km × CHF ${config?.chf_per_km ?? 1.5})`} value={`+ ${fmt(result.with_mwst.transport_chf)}`} />
              <CostRow indent label="+ MFK + Aufbereitung" value={`+ ${fmt(result.with_mwst.mfk_preparation_chf)}`} />
            </div>

            <div className="flex items-end justify-between p-4 pt-3 border-t border-success/20 bg-success/10 rounded-b-xl">
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold text-success">Einstandspreis total</div>
                <div className="text-[11px] text-muted-foreground">das zahlst du wirklich</div>
              </div>
              <div className="text-2xl lg:text-3xl font-bold text-success tabular-nums" style={mono}>
                {fmt(result.with_mwst.total_chf)}
              </div>
            </div>
          </div>

          {/* AutoScout Schätzwert */}
          {autoscoutAvg > 0 ? (
            <div className="rounded-xl border border-info/30 bg-info/5 p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-info">Marktpreis Schweiz (AutoScout24.ch)</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Schätzwert aus {autoscoutCount} vergleichbaren Inseraten
                </div>
                {autoscoutUrl && (
                  <a
                    href={autoscoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-info hover:underline mt-2"
                  >
                    Direkt auf AutoScout24.ch vergleichen <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="text-2xl font-bold text-info tabular-nums whitespace-nowrap" style={mono}>
                {fmt(autoscoutAvg)}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface/50 p-4 flex items-start gap-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Kein AutoScout24.ch Vergleichswert verfügbar</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Marktpreis CH wird automatisch gesucht wenn das Auto geparst wird
                </div>
              </div>
            </div>
          )}

          {/* MwSt-Ersparnis */}
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-warning">
              <Lightbulb className="h-4 w-4" />
              <span>MwSt-Ersparnis (vs. Privatkauf ohne Ausweis)</span>
            </div>
            <div className="text-lg font-bold text-warning tabular-nums whitespace-nowrap" style={mono}>
              {fmt(result.mwst_saving_chf)}
            </div>
          </div>

          {/* OHNE MwSt — collapsible */}
          <div>
            <button
              onClick={() => setShowWithout(!showWithout)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-border bg-transparent hover:bg-accent/30 text-xs text-muted-foreground transition"
            >
              <span>Vergleich ohne MwSt-Ausweis (Privatkauf / Differenzbesteuerung)</span>
              {showWithout ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showWithout && (
              <div className="mt-2 rounded-xl border border-border bg-surface/40 p-4 space-y-1.5 text-sm">
                <CostRow label="Kaufpreis (kein Abzug möglich)" value={fmt(result.kaufpreis_chf)} muted />
                <CostRow label="+ Automobilsteuer (4%)" value={`+ ${fmt(result.without_mwst.automobilsteuer_chf)}`} muted />
                <CostRow label="+ Zoll CH" value={`+ ${fmt(result.without_mwst.zoll_chf)}`} muted />
                <CostRow label="+ CH MwSt (7.7%)" value={`+ ${fmt(result.without_mwst.ch_mwst_chf)}`} muted />
                <CostRow label="+ Transport" value={`+ ${fmt(result.without_mwst.transport_chf)}`} muted />
                <CostRow label="+ MFK + Aufbereitung" value={`+ ${fmt(result.without_mwst.mfk_preparation_chf)}`} muted />
                <div className="border-t border-border my-2" />
                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Einstandspreis total</div>
                  <div className="text-lg font-bold tabular-nums" style={mono}>{fmt(result.without_mwst.total_chf)}</div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Calculator className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Kaufpreis eingeben um Importkosten zu berechnen</p>
        </div>
      )}
    </div>
  );
}

function InputBox({
  label, unit, value, onChange, placeholder, hint,
}: { label: string; unit: string; value: number; onChange: (n: number) => void; placeholder?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-3.5 hover:border-border/80 focus-within:border-primary/60 transition">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2">
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent outline-none text-xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ ...mono, fontSize: "20px" }}
        />
        <span className="text-base text-muted-foreground">{unit}</span>
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1 tabular-nums" style={mono}>{hint}</div>}
    </div>
  );
}

function CostRow({
  label, value, indent, tone, bold, muted,
}: { label: string; value: string; indent?: boolean; tone?: "success"; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn(
        "text-sm",
        indent && "pl-3 text-muted-foreground",
        !indent && !muted && "text-foreground",
        muted && "text-muted-foreground",
        bold && "font-semibold text-foreground",
      )}>
        {label}
      </span>
      <span
        className={cn(
          "text-sm tabular-nums whitespace-nowrap",
          tone === "success" && "text-success font-medium",
          bold && "font-bold",
        )}
        style={mono}
      >
        {value}
      </span>
    </div>
  );
}
