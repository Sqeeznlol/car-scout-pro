import { useEffect, useState } from "react";

const KEY = "swipe_hint_seen_v1";

export function SwipeHint() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setShown(true);
  }, []);

  if (!shown) return null;

  const close = () => {
    localStorage.setItem(KEY, "1");
    setShown(false);
  };

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in no-select"
    >
      <div className="max-w-sm w-full rounded-2xl bg-card border border-border p-6 text-center shadow-elevated">
        <div className="text-5xl mb-3">👆</div>
        <h3 className="text-lg font-semibold mb-4">So funktioniert's</h3>
        <div className="space-y-2 text-sm text-muted-foreground text-left">
          <p>👉 Nach rechts wischen = <span className="text-success font-semibold">Deal</span></p>
          <p>👈 Nach links wischen = <span className="text-danger font-semibold">Skip</span></p>
          <p>👆 Nach oben wischen = <span className="text-warning font-semibold">Später</span></p>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">Tippen zum Schliessen</p>
      </div>
    </div>
  );
}
