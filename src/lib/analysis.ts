// Pure functions for cost & deal-score calculations.
// Used both server-side (sync) and client-side (preview).

export interface ConfigInput {
  eur_chf_rate: number;
  chf_per_km: number;
  customs_flat: number;
  vat_rate: number;
  automobilsteuer_rate: number;
  mfk_flat: number;
  preparation_flat: number;
  target_margin_chf: number;
  weight_margin: number;
  weight_liquidity: number;
  weight_risk: number;
  weight_learning: number;
}

export interface VehicleInput {
  price_eur: number;
  mileage_km: number | null;
  year: number | null;
  location: string | null;
  fuel: string | null;
  seller_type?: string | null;
  distance_km?: number | null;
}

// Approximate distance from common German cities to Zurich
const DIST_KM: Record<string, number> = {
  münchen: 310, munich: 310, stuttgart: 220, frankfurt: 360, ingolstadt: 350,
  hamburg: 880, berlin: 850, köln: 580, koeln: 580, düsseldorf: 600, duesseldorf: 600,
  wolfsburg: 760, leipzig: 700, dresden: 720, nürnberg: 420, nuernberg: 420,
  hannover: 760, bremen: 880, dortmund: 640, essen: 620, mannheim: 320,
  karlsruhe: 230, freiburg: 130, kassel: 540,
};

function distanceFromLocation(loc: string | null): number {
  if (!loc) return 600;
  const key = loc.toLowerCase();
  for (const city of Object.keys(DIST_KM)) {
    if (key.includes(city)) return DIST_KM[city];
  }
  return 600;
}

// Rough Swiss market estimator: German price + 18% uplift (varies by segment)
function estimateChMarket(priceEur: number, fx: number, year: number | null): number {
  const ageBoost = year && year >= 2022 ? 0.20 : year && year >= 2019 ? 0.17 : 0.14;
  return Math.round(priceEur * fx * (1 + ageBoost));
}

export interface Analysis {
  price_chf: number;
  transport_chf: number;
  customs_chf: number;
  vat_chf: number;
  automobilsteuer_chf: number;
  mfk_chf: number;
  preparation_chf: number;
  total_cost_chf: number;
  market_value_chf: number;
  expected_margin_chf: number;
  deal_score: number;
  margin_score: number;
  liquidity_score: number;
  risk_score: number;
  learning_score: number;
}

export function computeAnalysis(v: VehicleInput, c: ConfigInput): Analysis {
  const distance = v.distance_km ?? distanceFromLocation(v.location);
  const price_chf = Math.round(v.price_eur * c.eur_chf_rate);
  const transport_chf = Math.round(distance * c.chf_per_km);
  const customs_chf = c.customs_flat;
  const automobilsteuer_chf = Math.round(price_chf * c.automobilsteuer_rate);
  const vat_base = price_chf + transport_chf + automobilsteuer_chf + customs_chf;
  const vat_chf = Math.round(vat_base * c.vat_rate);
  const mfk_chf = c.mfk_flat;
  const preparation_chf = c.preparation_flat;
  const total_cost_chf = price_chf + transport_chf + customs_chf + automobilsteuer_chf + vat_chf + mfk_chf + preparation_chf;

  const market_value_chf = estimateChMarket(v.price_eur, c.eur_chf_rate, v.year);
  const expected_margin_chf = market_value_chf - total_cost_chf;

  // Sub-scores 0..100
  const margin_score = Math.max(0, Math.min(100, Math.round((expected_margin_chf / c.target_margin_chf) * 70 + 30)));

  // Liquidity: popular makes/fuels move faster
  const liquidityBase = 60;
  const fuelBonus = (v.fuel || "").toLowerCase().includes("diesel") ? -5 :
    (v.fuel || "").toLowerCase().includes("elect") ? -10 :
    (v.fuel || "").toLowerCase().includes("hybrid") ? +5 : +10;
  const ageYears = v.year ? Math.max(0, new Date().getFullYear() - v.year) : 6;
  const liquidity_score = Math.max(0, Math.min(100, liquidityBase + fuelBonus + Math.max(-20, 15 - ageYears * 3)));

  // Risk: high mileage + old + private seller raise risk → score is inverse risk
  const mileage = v.mileage_km ?? 100000;
  const mileageHit = Math.max(0, Math.min(40, Math.round((mileage - 80000) / 5000) * 2));
  const ageHit = Math.max(0, Math.min(30, ageYears * 3));
  const privateHit = v.seller_type === "private" ? 15 : 0;
  const risk_score = Math.max(0, Math.min(100, 100 - mileageHit - ageHit - privateHit));

  // Learning placeholder
  const learning_score = 50;

  const totalWeight = c.weight_margin + c.weight_liquidity + c.weight_risk + c.weight_learning || 100;
  const deal_score = Math.round(
    (margin_score * c.weight_margin +
      liquidity_score * c.weight_liquidity +
      risk_score * c.weight_risk +
      learning_score * c.weight_learning) / totalWeight,
  );

  return {
    price_chf, transport_chf, customs_chf, vat_chf, automobilsteuer_chf,
    mfk_chf, preparation_chf, total_cost_chf, market_value_chf,
    expected_margin_chf, deal_score, margin_score, liquidity_score,
    risk_score, learning_score,
  };
}
