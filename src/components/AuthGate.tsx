import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Lock, Car, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const USER_PW = "Timscam";
const ADMIN_PW = "Alys_1203";
const USER_KEY = "mr_user";
const ADMIN_KEY = "mr_admin";

export type Role = "user" | "admin" | null;

function read(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "1";
}
function write(key: string, val: boolean) {
  if (typeof window === "undefined") return;
  if (val) window.localStorage.setItem(key, "1");
  else window.localStorage.removeItem(key);
  window.dispatchEvent(new Event("mr_role_change"));
}

/** Returns the active role for the CURRENT path. Admin only on /admin routes. */
export function useRole(): Role {
  const { pathname } = useLocation();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("mr_role_change", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("mr_role_change", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  // re-read on every render (cheap)
  void tick;
  if (typeof window === "undefined") return null;
  if (pathname.startsWith("/admin")) return read(ADMIN_KEY) ? "admin" : null;
  return read(USER_KEY) ? "user" : null;
}

/** Logout. null clears the scope for the current path. */
export function setRole(role: Role) {
  if (typeof window === "undefined") return;
  if (role === null) {
    // clear based on current path
    const onAdmin = window.location.pathname.startsWith("/admin");
    if (onAdmin) write(ADMIN_KEY, false);
    else write(USER_KEY, false);
  } else if (role === "admin") {
    write(ADMIN_KEY, true);
  } else {
    write(USER_KEY, true);
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [, force] = useState(0);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
    const h = () => force((t) => t + 1);
    window.addEventListener("mr_role_change", h);
    return () => window.removeEventListener("mr_role_change", h);
  }, []);

  if (!mounted) return null;

  const isAdminRoute = pathname.startsWith("/admin");

  if (isAdminRoute && !read(ADMIN_KEY)) {
    return (
      <LoginScreen
        variant="admin"
        pw={pw}
        setPw={setPw}
        err={err}
        onSubmit={() => {
          if (pw === ADMIN_PW) {
            write(ADMIN_KEY, true);
            setPw("");
            setErr("");
          } else {
            setErr("Falscher Admin-Code");
          }
        }}
        onBack={() => navigate({ to: "/queue" })}
      />
    );
  }

  if (!isAdminRoute && !read(USER_KEY)) {
    return (
      <LoginScreen
        variant="user"
        pw={pw}
        setPw={setPw}
        err={err}
        onSubmit={() => {
          if (pw === USER_PW) {
            write(USER_KEY, true);
            setPw("");
            setErr("");
          } else {
            setErr("Falsches Passwort");
          }
        }}
      />
    );
  }

  return <>{children}</>;
}

function LoginScreen({
  variant,
  pw,
  setPw,
  err,
  onSubmit,
  onBack,
}: {
  variant: "user" | "admin";
  pw: string;
  setPw: (s: string) => void;
  err: string;
  onSubmit: () => void;
  onBack?: () => void;
}) {
  const isAdmin = variant === "admin";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className={cn(
          "w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-card space-y-6",
        )}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div
            className={cn(
              "h-14 w-14 rounded-2xl flex items-center justify-center",
              isAdmin
                ? "bg-gradient-to-br from-warning/30 to-warning/10 text-warning"
                : "bg-gradient-primary text-primary-foreground shadow-glow-success",
            )}
          >
            {isAdmin ? <ShieldCheck className="h-7 w-7" /> : <Car className="h-7 w-7" />}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {isAdmin ? "Admin-Zugang" : "Mobile Radar"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdmin ? "Bitte Admin-Code eingeben." : "Bitte Passwort eingeben."}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={isAdmin ? "Admin-Code" : "Passwort"}
              className="pl-9 h-11"
            />
          </div>
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            className={cn(
              "h-11 font-medium",
              isAdmin
                ? "bg-warning text-warning-foreground hover:bg-warning/90"
                : "bg-gradient-primary text-primary-foreground",
            )}
          >
            {isAdmin ? "Entsperren" : "Einloggen"}
          </Button>
          {isAdmin && onBack && (
            <Button type="button" variant="ghost" className="h-10" onClick={onBack}>
              Zurück
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
