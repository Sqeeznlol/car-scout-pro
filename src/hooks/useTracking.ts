import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "ar_session_id";

function generateSessionId() {
  return (
    "sess_" +
    Math.random().toString(36).slice(2, 11) +
    Date.now().toString(36)
  );
}

function detectClient() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const device = /Mobi|Android/i.test(ua)
    ? "mobile"
    : /Tablet|iPad/i.test(ua)
      ? "tablet"
      : "desktop";
  const browser =
    /Edg/i.test(ua) ? "Edge"
    : /Chrome/i.test(ua) ? "Chrome"
    : /Safari/i.test(ua) ? "Safari"
    : /Firefox/i.test(ua) ? "Firefox"
    : "Other";
  const os =
    /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
    : /Mac/i.test(ua) ? "macOS"
    : /Win/i.test(ua) ? "Windows"
    : /Linux/i.test(ua) ? "Linux"
    : "Other";
  return { ua, device, browser, os };
}

interface TrackedVehicle {
  id: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  mileage_km?: number | null;
  price_eur?: number | string | null;
  fuel?: string | null;
  seller_type?: string | null;
  distance_km?: number | null;
}

interface TrackedAnalysis {
  margin_chf?: number | null;
  market_price_ch?: number | null;
  price_vs_market_percent?: number | null;
}

export function useTracking() {
  const sessionIdRef = useRef<string>("");

  if (typeof window !== "undefined" && !sessionIdRef.current) {
    sessionIdRef.current =
      window.localStorage.getItem(SESSION_KEY) || generateSessionId();
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.localStorage.getItem(SESSION_KEY);
    const sid = sessionIdRef.current;
    (async () => {
      if (!existing) {
        window.localStorage.setItem(SESSION_KEY, sid);
        const { ua, device, browser, os } = detectClient();
        let geo: Record<string, unknown> = {};
        try {
          const res = await fetch("https://ipapi.co/json/");
          if (res.ok) geo = await res.json();
        } catch {
          /* offline / blocked — skip */
        }
        await supabase.from("user_sessions").insert({
          session_id: sid,
          ip_address: (geo.ip as string) ?? null,
          country: (geo.country_name as string) ?? null,
          city: (geo.city as string) ?? null,
          region: (geo.region as string) ?? null,
          latitude: (geo.latitude as number) ?? null,
          longitude: (geo.longitude as number) ?? null,
          device_type: device,
          browser,
          os,
          screen_width: window.screen?.width ?? null,
          screen_height: window.screen?.height ?? null,
          user_agent: ua,
        });
      } else {
        await supabase
          .from("user_sessions")
          .update({ last_seen: new Date().toISOString() })
          .eq("session_id", sid);
      }
    })().catch(() => {
      /* swallow tracking errors — UX must not break */
    });
  }, []);

  const trackDecision = useCallback(
    async (
      vehicleId: string,
      decision: string,
      meta: {
        timeOnCardMs: number;
        tappedAutoscout: boolean;
        tappedListing: boolean;
        vehicle: TrackedVehicle;
        analysis: TrackedAnalysis | null | undefined;
      },
    ) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await supabase.from("decision_events").insert({
          session_id: sid,
          vehicle_id: vehicleId,
          decision,
          time_on_card_ms: meta.timeOnCardMs,
          scrolled_to_market: meta.timeOnCardMs > 2000,
          tapped_autoscout: meta.tappedAutoscout,
          tapped_listing: meta.tappedListing,
          vehicle_make: meta.vehicle.make ?? null,
          vehicle_model: meta.vehicle.model ?? null,
          vehicle_year: meta.vehicle.year ?? null,
          vehicle_mileage: meta.vehicle.mileage_km ?? null,
          vehicle_price_eur:
            meta.vehicle.price_eur != null ? Number(meta.vehicle.price_eur) : null,
          vehicle_fuel_type: meta.vehicle.fuel ?? null,
          margin_chf: meta.analysis?.margin_chf ?? null,
          market_price_ch: meta.analysis?.market_price_ch ?? null,
          distance_km: meta.vehicle.distance_km ?? null,
          price_vs_market_percent:
            meta.analysis?.price_vs_market_percent ?? null,
          seller_type: meta.vehicle.seller_type ?? null,
        });
        await supabase.rpc("increment_session_decisions", {
          p_session_id: sid,
          p_interesting: decision === "interesting" ? 1 : 0,
        });
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { trackDecision, sessionId: sessionIdRef.current };
}
