import { useState, useRef, useEffect } from "react";
import { Palette, Check } from "lucide-react";
import { useTheme, THEMES, type ThemeId } from "./ThemeProvider";
import { cn } from "@/lib/utils";

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-md transition-colors hairline bg-card hover:bg-accent",
          compact ? "h-9 w-9 justify-center" : "w-full px-3 py-2 text-sm",
        )}
        aria-label="Theme wählen"
      >
        <CurrentIcon className="h-4 w-4" />
        {!compact && (
          <>
            <span className="flex-1 text-left">{current.label}</span>
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-64 rounded-lg glass-card shadow-elevated p-1.5",
            compact ? "right-0 top-11" : "bottom-12 left-0",
          )}
        >
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Erscheinungsbild
          </div>
          {THEMES.map((t) => {
            const Icon = t.icon;
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id as ThemeId); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <div className="h-7 w-7 rounded-md hairline flex items-center justify-center bg-surface">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>
                </div>
                {active && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
