// Geocoding via Nominatim + driving distance via OSRM. Public endpoints.
// Target: Kloten, Switzerland (Flughafenstrasse area).

const KLOTEN = { lat: 47.4513, lon: 8.5874 };

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  if (!query) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "lovable-mobile-de-importer/1.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function route(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<{ km: number; minutes: number } | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{ distance: number; duration: number }>;
    };
    const r = data.routes?.[0];
    if (!r) return null;
    return { km: r.distance / 1000, minutes: Math.round(r.duration / 60) };
  } catch {
    return null;
  }
}

export interface DistanceResult {
  latitude: number;
  longitude: number;
  distance_km: number;
  distance_minutes: number;
}

export async function computeDistanceToKloten(
  address: string | null | undefined,
  fallbackLocation: string | null | undefined,
): Promise<DistanceResult | null> {
  const query = address || fallbackLocation;
  if (!query) return null;
  const coords = await geocode(query);
  if (!coords) return null;
  const r = await route(coords, KLOTEN);
  if (!r) return null;
  return {
    latitude: coords.lat,
    longitude: coords.lon,
    distance_km: Math.round(r.km * 10) / 10,
    distance_minutes: r.minutes,
  };
}
