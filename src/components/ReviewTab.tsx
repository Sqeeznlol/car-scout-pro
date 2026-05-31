import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchPendingReview, type VehicleWithAnalysis } from "@/lib/db";
import { applyManualNetto, confirmNoNetto } from "@/lib/review.functions";

export function ReviewTab() {
  const qc = useQueryClient();
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["pending-review"],
    queryFn: fetchPendingReview,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade...
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <div className="text-5xl mb-3">✅</div>
        <div className="text-lg font-semibold mb-1">Keine Inserate zur Prüfung</div>
        <div className="text-sm text-muted-foreground">
          Alle gescrapten Autos haben entweder einen Netto-Preis oder wurden archiviert.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        <strong>{pending.length}</strong> Inserate ohne erkannten Netto-Preis. Trag den Netto-Preis manuell ein wenn du
        einen findest, sonst klick „Kein Netto vorhanden" und das Auto wird archiviert.
      </div>

      {pending.map((v) => (
        <ReviewCard
          key={v.id}
          vehicle={v}
          onResolved={() => qc.invalidateQueries({ queryKey: ["pending-review"] })}
        />
      ))}
    </div>
  );
}

function ReviewCard({ vehicle, onResolved }: { vehicle: VehicleWithAnalysis; onResolved: () => void }) {
  const [netto, setNetto] = useState("");
  const [busy, setBusy] = useState<null | "save" | "skip">(null);
  const applyFn = useServerFn(applyManualNetto);
  const confirmFn = useServerFn(confirmNoNetto);

  const handleApply = async () => {
    const n = parseInt(netto.replace(/[^\d]/g, ""), 10);
    if (!n || n < 100) {
      toast.error("Bitte gültigen Netto-Preis eingeben");
      return;
    }
    setBusy("save");
    try {
      await applyFn({ data: { vehicle_id: vehicle.id, price_eur_netto: n } });
      toast.success(`✅ ${vehicle.make ?? "Auto"} → Swipe Queue`);
      onResolved();
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setBusy(null);
    }
  };

  const handleSkip = async () => {
    setBusy("skip");
    try {
      await confirmFn({ data: { vehicle_id: vehicle.id } });
      toast.success("📦 Archiviert");
      onResolved();
    } catch {
      toast.error("Fehler");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex gap-3 p-3">
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt="" className="w-28 h-20 object-cover rounded-md shrink-0" />
        ) : (
          <div className="w-28 h-20 rounded-md bg-muted flex items-center justify-center text-2xl shrink-0">🚗</div>
        )}

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{vehicle.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {[
              vehicle.year,
              vehicle.mileage_km && `${vehicle.mileage_km.toLocaleString("de-CH")} km`,
              vehicle.fuel,
              vehicle.transmission,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            📍 {vehicle.location ?? "—"} · {vehicle.seller_name ?? vehicle.seller_type ?? "—"}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-base font-bold tabular-nums">
              {vehicle.price_eur ? Number(vehicle.price_eur).toLocaleString("de-CH") : "—"} €
            </span>
            <span className="text-[10px] uppercase text-muted-foreground">brutto</span>
            {vehicle.listing_url && (
              <a
                href={vehicle.listing_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary inline-flex items-center gap-1 ml-auto"
              >
                Inserat <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border p-3 grid sm:grid-cols-[1fr_auto] gap-2 bg-muted/30">
        <div className="flex gap-2">
          <div className="flex items-center gap-2 flex-1 border border-border rounded-md px-3 bg-background">
            <span className="text-xs text-muted-foreground">Netto:</span>
            <input
              type="text"
              value={netto}
              onChange={(e) => setNetto(e.target.value)}
              placeholder={
                vehicle.price_eur ? Math.round(Number(vehicle.price_eur) / 1.19).toLocaleString("de-CH") : "z.B. 18'500"
              }
              className="flex-1 bg-transparent outline-none text-sm font-bold tabular-nums min-w-0"
            />
            <span className="text-xs text-muted-foreground">€</span>
          </div>
          <button
            onClick={handleApply}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            In Queue
          </button>
        </div>
        <button
          onClick={handleSkip}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {busy === "skip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Kein Netto vorhanden
        </button>
      </div>
    </div>
  );
}
