import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Moon, Sun, Eye, Waves, Coffee, Monitor, type LucideIcon } from "lucide-react";

export type ThemeId = "dark" | "light" | "bluelight" | "midnight" | "sepia" | "highcontrast";

export const THEMES: { id: ThemeId; label: string; icon: LucideIcon; description: string }[] = [
  { id: "dark", label: "Dark (OLED)", icon: Moon, description: "Signal-Rot auf Tiefschwarz" },
  { id: "light", label: "Hell", icon: Sun, description: "Heller Modus für Tageslicht" },
  { id: "bluelight", label: "Blaulicht-Filter", icon: Eye, description: "Warm, augenschonend" },
  { id: "midnight", label: "Mitternacht", icon: Waves, description: "Tiefes Marineblau" },
  { id: "sepia", label: "Sepia", icon: Coffee, description: "Papierton, kontrastarm" },
  { id: "highcontrast", label: "Hoher Kontrast", icon: Monitor, description: "Maximal lesbar" },
];

const STORAGE_KEY = "autosnipe-theme";

interface Ctx {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<Ctx>({ theme: "dark", setTheme: () => {} });

function applyTheme(t: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.colorScheme = t === "light" || t === "sepia" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("dark");

  useEffect(() => {
    try {
      const stored = (localStorage.getItem(STORAGE_KEY) as ThemeId | null) ?? "dark";
      setThemeState(stored);
      applyTheme(stored);
    } catch {
      applyTheme("dark");
    }
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    applyTheme(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
