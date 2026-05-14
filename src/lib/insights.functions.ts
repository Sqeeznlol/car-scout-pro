import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface DecisionRow {
  decision: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_mileage: number | null;
  vehicle_price_eur: number | null;
  vehicle_fuel_type: string | null;
  margin_chf: number | null;
  market_price_ch: number | null;
  time_on_card_ms: number | null;
  tapped_autoscout: boolean | null;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
  const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);
  const sumY2 = y.reduce((s, yi) => s + yi * yi, 0);
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (!denom) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function rateMap<T extends string | null>(
  events: DecisionRow[],
  key: (e: DecisionRow) => T,
) {
  const stats: Record<string, { total: number; interesting: number }> = {};
  for (const e of events) {
    const k = key(e);
    if (!k) continue;
    if (!stats[k]) stats[k] = { total: 0, interesting: 0 };
    stats[k].total++;
    if (e.decision === "interesting") stats[k].interesting++;
  }
  return Object.entries(stats)
    .map(([k, s]) => ({ key: k, interest_rate: s.interesting / s.total, total: s.total }))
    .filter((m) => m.total >= 2)
    .sort((a, b) => b.interest_rate - a.interest_rate);
}

export const calculateInsights = createServerFn({ method: "POST" }).handler(
  async () => {
    const { data: events, error } = await supabaseAdmin
      .from("decision_events")
      .select(
        "decision, vehicle_make, vehicle_model, vehicle_year, vehicle_mileage, vehicle_price_eur, vehicle_fuel_type, margin_chf, market_price_ch, time_on_card_ms, tapped_autoscout",
      )
      .order("decided_at", { ascending: false })
      .limit(1000);

    if (error) throw new Error(error.message);
    if (!events || events.length < 5) {
      return { ok: false, reason: "not_enough_data", count: events?.length ?? 0 };
    }

    const rows = events as unknown as DecisionRow[];
    const interesting = rows.filter((e) => e.decision === "interesting");
    const skipped = rows.filter((e) => e.decision === "skip");

    const makes = rateMap(rows, (e) => e.vehicle_make).slice(0, 8).map((m) => ({
      make: m.key,
      interest_rate: m.interest_rate,
      total: m.total,
    }));
    const fuels = rateMap(rows, (e) => e.vehicle_fuel_type).slice(0, 6).map((m) => ({
      fuel: m.key,
      interest_rate: m.interest_rate,
      total: m.total,
    }));

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;

    const avgMargin = avg(interesting.map((e) => Number(e.margin_chf ?? 0)));
    const avgMileage = avg(interesting.map((e) => Number(e.vehicle_mileage ?? 0)));
    const avgPrice = avg(interesting.map((e) => Number(e.vehicle_price_eur ?? 0)));
    const avgYear = avg(interesting.map((e) => Number(e.vehicle_year ?? 0)));

    const avgTimeInteresting = avg(interesting.map((e) => Number(e.time_on_card_ms ?? 0)));
    const avgTimeSkip = avg(skipped.map((e) => Number(e.time_on_card_ms ?? 0)));

    const autoscoutCheckRate = interesting.length
      ? interesting.filter((e) => e.tapped_autoscout).length / interesting.length
      : 0;

    const decisionVec = rows.map((e) => (e.decision === "interesting" ? 1 : 0));
    const marginCorrelation = pearson(
      rows.map((e) => Number(e.margin_chf ?? 0)),
      decisionVec,
    );
    const marketCorrelation = pearson(
      rows.map((e) => Number(e.market_price_ch ?? 0)),
      decisionVec,
    );
    const mileageCorrelation = pearson(
      rows.map((e) => Number(e.vehicle_mileage ?? 0)),
      decisionVec,
    );

    const insertPayload = {
      total_decisions: rows.length,
      total_interesting: interesting.length,
      conversion_rate: interesting.length / rows.length,
      preferred_makes: makes,
      preferred_fuel_types: fuels,
      preferred_year_min: avgYear ? Math.round(avgYear - 2) : null,
      preferred_year_max: avgYear ? Math.round(avgYear + 1) : null,
      preferred_mileage_max: avgMileage ? Math.round(avgMileage * 1.2) : null,
      preferred_price_min_eur: avgPrice ? Math.round(avgPrice * 0.7) : null,
      preferred_price_max_eur: avgPrice ? Math.round(avgPrice * 1.3) : null,
      preferred_margin_min_chf: avgMargin ? Math.round(avgMargin * 0.6) : null,
      margin_correlation: marginCorrelation,
      market_price_correlation: marketCorrelation,
      mileage_correlation: mileageCorrelation,
      avg_time_on_interesting_ms: Math.round(avgTimeInteresting),
      avg_time_on_skip_ms: Math.round(avgTimeSkip),
      autoscout_check_rate: autoscoutCheckRate,
      raw_insights: { avgMargin, avgMileage, avgPrice, avgYear },
    };

    const { error: insErr } = await supabaseAdmin
      .from("algorithm_insights")
      .insert(insertPayload);
    if (insErr) throw new Error(insErr.message);

    return { ok: true, totals: { total: rows.length, interesting: interesting.length } };
  },
);
