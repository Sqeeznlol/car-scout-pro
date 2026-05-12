import { Link, useLocation } from "@tanstack/react-router";
import { Bell, LayoutGrid, Archive, Settings, Car, Sparkles, LogOut } from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchVehicles } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useRole, setRole } from "@/components/AuthGate";

const baseNav = [
  { to: "/queue", label: "Queue", icon: LayoutGrid },
  { to: "/archive", label: "Archiv", icon: Archive },
  { to: "/meine-suche", label: "Meine Suche", icon: Bell },
];
const adminNavItem = { to: "/admin", label: "Admin", icon: Settings };

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const role = useRole();
  const nav = role === "admin" ? [...baseNav, adminNavItem] : baseNav;
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: fetchVehicles });

  const { newCount, hotCount } = useMemo(() => {
    let n = 0, hot = 0;
    for (const v of vehicles) {
      if (v.decision) continue;
      n++;
      if ((v.analysis?.deal_score ?? 0) > 80) hot++;
    }
    return { newCount: n, hotCount: hot };
  }, [vehicles]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar px-4 py-6">
        <Link to="/queue" className="flex items-center gap-2 px-2 mb-8">
          <div className="h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow-success">
            <Car className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">Mobile Radar</div>
            <div className="text-[11px] text-muted-foreground">CH Import Desk</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-chart-2" />
              <span>{hotCount} hot deal{hotCount === 1 ? "" : "s"} in queue</span>
            </div>
          </div>
          <button
            onClick={() => setRole(null)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-sidebar-accent/50 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            {role === "admin" ? "Admin abmelden" : "Abmelden"}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 glass border-b border-border">
          <div className="flex h-14 items-center justify-between px-4 lg:px-8">
            <Link to="/queue" className="flex items-center gap-2 lg:hidden">
              <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center">
                <Car className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold tracking-tight">Mobile Radar</span>
            </Link>
            <div className="hidden lg:block">
              <div className="text-sm text-muted-foreground">
                {pathname === "/queue" || pathname === "/" ? "Swipe Queue" :
                  pathname.startsWith("/archive") ? "Archive" :
                  pathname.startsWith("/admin") ? "Admin" :
                  pathname.startsWith("/vehicle") ? "Vehicle Detail" : ""}
              </div>
            </div>
            <button className="relative h-9 w-9 rounded-md border border-border bg-card hover:bg-accent flex items-center justify-center transition">
              <Bell className="h-4 w-4" />
              {newCount > 0 && (
                <span className={cn(
                  "absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center",
                  hotCount > 0 ? "bg-danger text-danger-foreground" : "bg-chart-2 text-primary-foreground",
                )}>
                  {newCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 pb-20 lg:pb-0">{children}</main>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass border-t border-border">
          <div className={cn("grid", nav.length === 4 ? "grid-cols-4" : nav.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {nav.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 text-[11px] transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <n.icon className="h-5 w-5" />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
