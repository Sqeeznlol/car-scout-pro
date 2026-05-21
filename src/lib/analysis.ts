// Pure functions for cost & deal-score calculations.
// Used both server-side (sync) and client-side (preview).

export interface ConfigInput {
  eur_chf_rate: number;
  chf_per_km: number;
  customs_flat: number;          // = zoll_pauschale_chf (160 CHF)
  vat_rate: number;              // CH MwSt = 0.077
  automobilsteuer_rate: number;  // CH = 0.04
  mfk_flat: number;              // 220
  preparation_flat: number;      // 100
  target_margin_chf: number;     // 3500
  weight_margin: number;
  weight_liquidity: number;
  weight_risk: number;
  weight_learning: number;
  de_vat_rate?: number;          // DE MwSt = 0.19 (constant)
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

const DE_VAT_RATE = 0.19;

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

function estimateChMarket(priceEur: number, fx: number, year: number | null): number {
  const ageBoost = year && year >= 2022 ? 0.20 : year && year >= 2019 ? 0.17 : 0.14;
  return Math.round(priceEur * fx * (1 + ageBoost));
}

// ─────────────────────────────────────────────────────────────────────────
// DUAL-SCENARIO IMPORT COST CALCULATOR (DE → CH)
// ─────────────────────────────────────────────────────────────────────────

export interface ImportCostsResult {
  kaufpreis_chf: number;
  transport_chf: number;
  mfk_aufbereitung_chf: number;
  with_mwst: {
    de_mwst_erstattung_chf: number;
    netto_kaufpreis_chf: number;
    automobilsteuer_chf: number;
    zoll_chf: number;
    ch_mwst_chf: number;
    total_chf: number;
    margin_chf: number;
    max_buy_eur: number;
  };
  without_mwst: {
    automobilsteuer_chf: number;
    zoll_chf: number;
    ch_mwst_chf: number;
    total_chf: number;
    margin_chf: number;
    max_buy_eur: number;
  };
  mwst_saving_chf: number;
}

export function calculateImportCosts(
  price_eur: number,
  distance_km: number,
  sell_price_chf: number,
  c: ConfigInput,
): ImportCostsResult {
  const deVat = c.de_vat_rate ?? DE_VAT_RATE;
  const kaufpreis_chf = price_eur * c.eur_chf_rate;
  const transport_chf = distance_km * c.chf_per_km;
  const mfk_aufbereitung_chf = c.mfk_flat + c.preparation_flat;

  // Scenario A — MwSt ausweisbar (Händlerkauf mit Rechnung)
  const de_mwst_erstattung = kaufpreis_chf - kaufpreis_chf / (1 + deVat);
  const netto_a = kaufpreis_chf - de_mwst_erstattung;
  const automobilsteuer_a = netto_a * c.automobilsteuer_rate;
  const zoll_a = c.customs_flat;
  const ch_mwst_a = (netto_a + zoll_a) * c.vat_rate;
  const total_a = netto_a + automobilsteuer_a + zoll_a + ch_mwst_a + transport_chf + mfk_aufbereitung_chf;
  const margin_a = sell_price_chf - total_a;
  const max_buy_a_eur = Math.round(
    ((sell_price_chf - transport_chf - mfk_aufbereitung_chf - c.target_margin_chf - zoll_a) /
      (1 + c.automobilsteuer_rate + c.vat_rate) /
      (1 / (1 + deVat))) /
      c.eur_chf_rate,
  );

  // Scenario B — Kein MwSt-Ausweis (Privat / §25a Differenzbesteuerung)
  const automobilsteuer_b = kaufpreis_chf * c.automobilsteuer_rate;
  const zoll_b = c.customs_flat;
  const ch_mwst_b = (kaufpreis_chf + zoll_b) * c.vat_rate;
  const total_b = kaufpreis_chf + automobilsteuer_b + zoll_b + ch_mwst_b + transport_chf + mfk_aufbereitung_chf;
  const margin_b = sell_price_chf - total_b;
  const max_buy_b_eur = Math.round(
    ((sell_price_chf - transport_chf - mfk_aufbereitung_chf - c.target_margin_chf - zoll_b) /
      (1 + c.automobilsteuer_rate + c.vat_rate)) /
      c.eur_chf_rate,
  );

  return {
    kaufpreis_chf: Math.round(kaufpreis_chf),
    transport_chf: Math.round(transport_chf),
    mfk_aufbereitung_chf: Math.round(mfk_aufbereitung_chf),
    with_mwst: {
      de_mwst_erstattung_chf: Math.round(de_mwst_erstattung),
      netto_kaufpreis_chf: Math.round(netto_a),
      automobilsteuer_chf: Math.round(automobilsteuer_a),
      zoll_chf: Math.round(zoll_a),
      ch_mwst_chf: Math.round(ch_mwst_a),
      total_chf: Math.round(total_a),
      margin_chf: Math.round(margin_a),
      max_buy_eur: max_buy_a_eur,
    },
    without_mwst: {
      automobilsteuer_chf: Math.round(automobilsteuer_b),
      zoll_chf: Math.round(zoll_b),
      ch_mwst_chf: Math.round(ch_mwst_b),
      total_chf: Math.round(total_b),
      margin_chf: Math.round(margin_b),
      max_buy_eur: max_buy_b_eur,
    },
    mwst_saving_chf: Math.round(total_b - total_a),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// LEGACY-COMPATIBLE ANALYSIS (persisted to vehicle_analyses)
// "without MwSt" is treated as canonical/conservative.
// ─────────────────────────────────────────────────────────────────────────

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
  // Dual-scenario extras (persisted)
  de_mwst_erstattung_chf: number;
  netto_kaufpreis_chf: number;
  zoll_chf: number;
  ch_mwst_chf: number;
  total_with_mwst_chf: number;
  margin_with_mwst_chf: number;
  max_buy_with_mwst_eur: number;
  total_without_mwst_chf: number;
  margin_without_mwst_chf: number;
  max_buy_without_mwst_eur: number;
  mwst_saving_chf: number;
}

function subScores(v: VehicleInput) {
  const fuel = (v.fuel || "").toLowerCase();
  const fuelBonus = fuel.includes("diesel") ? -5 : fuel.includes("elect") ? -10 : fuel.includes("hybrid") ? 5 : 10;
  const ageYears = v.year ? Math.max(0, new Date().getFullYear() - v.year) : 6;
  const liquidity_score = Math.max(0, Math.min(100, 60 + fuelBonus + Math.max(-20, 15 - ageYears * 3)));

  const mileage = v.mileage_km ?? 100000;
  const mileageHit = Math.max(0, Math.min(40, Math.round((mileage - 80000) / 5000) * 2));
  const ageHit = Math.max(0, Math.min(30, ageYears * 3));
  const privateHit = v.seller_type === "private" ? 15 : 0;
  const risk_score = Math.max(0, Math.min(100, 100 - mileageHit - ageHit - privateHit));

  return { liquidity_score, risk_score, learning_score: 50 };
}

function dealScoreFor(margin: number, c: ConfigInput, sub: ReturnType<typeof subScores>) {
  // Conservative: margin score caps at 100 when ratio >= ~2 (matches user spec: marginRatio*17.5 normalized).
  const ratio = margin / (c.target_margin_chf || 3500);
  const margin_score = Math.max(0, Math.min(100, Math.round(ratio * 50 + 30)));
  const tw = c.weight_margin + c.weight_liquidity + c.weight_risk + c.weight_learning || 100;
  const deal_score = Math.round(
    (margin_score * c.weight_margin +
      sub.liquidity_score * c.weight_liquidity +
      sub.risk_score * c.weight_risk +
      sub.learning_score * c.weight_learning) /
      tw,
  );
  return { margin_score, deal_score };
}

export function computeAnalysis(v: VehicleInput, c: ConfigInput): Analysis {
  const DE_MWST = 0.19;
  const CH_AUTO = 0.04;
  const CH_MWST = 0.077;

  const kaufpreis_chf = v.price_eur * c.eur_chf_rate;
  const netto_chf = kaufpreis_chf / (1 + DE_MWST);
  const de_mwst_erstattung = kaufpreis_chf - netto_chf;

  const automobilsteuer_chf = netto_chf * CH_AUTO;
  const zoll_chf = c.customs_flat;
  const ch_mwst_chf = (netto_chf + zoll_chf) * CH_MWST;

  const distance_km = v.distance_km ?? null;
  const transport_chf = distance_km != null ? Math.round(distance_km * c.chf_per_km) : 0;

  const mfk_chf = c.mfk_flat;
  const preparation_chf = c.preparation_flat;

  const total_with_mwst_chf = Math.round(
    netto_chf + automobilsteuer_chf + zoll_chf + ch_mwst_chf +
    transport_chf + mfk_chf + preparation_chf
  );

  const automobilsteuer_b = kaufpreis_chf * CH_AUTO;
  const ch_mwst_b = (kaufpreis_chf + zoll_chf) * CH_MWST;
  const total_without_mwst = Math.round(
    kaufpreis_chf + automobilsteuer_b + zoll_chf + ch_mwst_b +
    transport_chf + mfk_chf + preparation_chf
  );

  const market_value_chf = estimateChMarket(v.price_eur, c.eur_chf_rate, v.year);
  const expected_margin_chf = market_value_chf - total_with_mwst_chf;

  const fuelLow = (v.fuel || "").toLowerCase();
  const fuelBonus = fuelLow.includes("diesel") ? -5
    : fuelLow.includes("elect") ? -10
    : fuelLow.includes("hybrid") ? 5 : 10;
  const ageYears = v.year ? Math.max(0, new Date().getFullYear() - v.year) : 6;
  const liquidity_score = Math.max(0, Math.min(100, 60 + fuelBonus + Math.max(-20, 15 - ageYears * 3)));

  const mileage = v.mileage_km ?? 100000;
  const mileageHit = Math.max(0, Math.min(40, Math.round((mileage - 80000) / 5000) * 2));
  const ageHit = Math.max(0, Math.min(30, ageYears * 3));
  const privateHit = v.seller_type === "private" ? 15 : 0;
  const risk_score = Math.max(0, Math.min(100, 100 - mileageHit - ageHit - privateHit));
  const learning_score = 50;

  const margin_score = Math.max(0, Math.min(100,
    Math.round((expected_margin_chf / (c.target_margin_chf || 3500)) * 70 + 30)
  ));
  const totalWeight = (c.weight_margin + c.weight_liquidity + c.weight_risk + c.weight_learning) || 100;
  const deal_score = Math.round(
    (margin_score * c.weight_margin +
     liquidity_score * c.weight_liquidity +
     risk_score * c.weight_risk +
     learning_score * c.weight_learning) / totalWeight
  );

  return {
    price_chf: Math.round(kaufpreis_chf),
    transport_chf,
    customs_chf: Math.round(zoll_chf),
    vat_chf: Math.round(ch_mwst_chf),
    automobilsteuer_chf: Math.round(automobilsteuer_chf),
    mfk_chf,
    preparation_chf,
    total_cost_chf: total_with_mwst_chf,
    market_value_chf,
    expected_margin_chf,
    deal_score,
    margin_score,
    liquidity_score,
    risk_score,
    learning_score,
    de_mwst_erstattung_chf: Math.round(de_mwst_erstattung),
    netto_kaufpreis_chf: Math.round(netto_chf),
    zoll_chf: Math.round(zoll_chf),
    ch_mwst_chf: Math.round(ch_mwst_chf),
    total_with_mwst_chf,
    margin_with_mwst_chf: Math.round(market_value_chf - total_with_mwst_chf),
    max_buy_with_mwst_eur: 0,
    total_without_mwst_chf: total_without_mwst,
    margin_without_mwst_chf: Math.round(market_value_chf - total_without_mwst),
    max_buy_without_mwst_eur: 0,
    mwst_saving_chf: total_without_mwst - total_with_mwst_chf,
  };
}

// Recompute margins + scenarios when market_value_chf changes (e.g., AutoScout override)
export function recomputeWithMarket(
  v: VehicleInput,
  c: ConfigInput,
  analysis: Analysis,
  new_market_value_chf: number,
): Analysis {
  const distance = v.distance_km ?? distanceFromLocation(v.location);
  const costs = calculateImportCosts(v.price_eur, distance, new_market_value_chf, c);
  const expected_margin_chf = costs.without_mwst.margin_chf;
  const sub = {
    liquidity_score: analysis.liquidity_score,
    risk_score: analysis.risk_score,
    learning_score: analysis.learning_score,
  };
  const { margin_score, deal_score } = dealScoreFor(expected_margin_chf, c, sub);
  return {
    ...analysis,
    market_value_chf: new_market_value_chf,
    expected_margin_chf,
    margin_score,
    deal_score,
    margin_with_mwst_chf: costs.with_mwst.margin_chf,
    margin_without_mwst_chf: costs.without_mwst.margin_chf,
    max_buy_with_mwst_eur: costs.with_mwst.max_buy_eur,
    max_buy_without_mwst_eur: costs.without_mwst.max_buy_eur,
  };
}
