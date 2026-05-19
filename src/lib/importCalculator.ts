// Single source of truth for Swiss import cost calculation (DE → CH).
// Fixed legal rates — never load from DB.
export const FIXED_RATES = {
  DE_MWST: 0.19,
  CH_AUTO_STEUER: 0.04,
  CH_MWST: 0.077,
} as const;

export interface ImportConfig {
  eur_chf_rate: number;
  chf_per_km: number;
  zoll_chf: number;
  mfk_chf: number;
  preparation_chf: number;
}

export interface ImportResult {
  kaufpreis_eur: number;
  kaufpreis_chf: number;
  distance_km: number;
  with_mwst: {
    de_mwst_erstattung_chf: number;
    netto_basis_chf: number;
    automobilsteuer_chf: number;
    zoll_chf: number;
    ch_mwst_chf: number;
    transport_chf: number;
    mfk_preparation_chf: number;
    total_chf: number;
  };
  without_mwst: {
    automobilsteuer_chf: number;
    zoll_chf: number;
    ch_mwst_chf: number;
    transport_chf: number;
    mfk_preparation_chf: number;
    total_chf: number;
  };
  mwst_saving_chf: number;
  autoscout_ch_estimate_chf: number;
}

export function calculate(
  price_eur: number,
  distance_km: number,
  autoscout_avg_chf: number,
  config: ImportConfig,
): ImportResult {
  const kaufpreis_chf = price_eur * config.eur_chf_rate;
  const transport_chf = distance_km * config.chf_per_km;
  const mfk_prep_chf = config.mfk_chf + config.preparation_chf;

  // Scenario A — MwSt ausweisbar
  const netto = kaufpreis_chf / (1 + FIXED_RATES.DE_MWST);
  const de_mwst_back = kaufpreis_chf - netto;
  const auto_st_a = netto * FIXED_RATES.CH_AUTO_STEUER;
  const zoll_a = config.zoll_chf;
  const ch_mwst_a = (netto + zoll_a) * FIXED_RATES.CH_MWST;
  const total_a = netto + auto_st_a + zoll_a + ch_mwst_a + transport_chf + mfk_prep_chf;

  // Scenario B — Kein MwSt
  const auto_st_b = kaufpreis_chf * FIXED_RATES.CH_AUTO_STEUER;
  const zoll_b = config.zoll_chf;
  const ch_mwst_b = (kaufpreis_chf + zoll_b) * FIXED_RATES.CH_MWST;
  const total_b = kaufpreis_chf + auto_st_b + zoll_b + ch_mwst_b + transport_chf + mfk_prep_chf;

  return {
    kaufpreis_eur: price_eur,
    kaufpreis_chf: Math.round(kaufpreis_chf),
    distance_km,
    with_mwst: {
      de_mwst_erstattung_chf: Math.round(de_mwst_back),
      netto_basis_chf: Math.round(netto),
      automobilsteuer_chf: Math.round(auto_st_a),
      zoll_chf: Math.round(zoll_a),
      ch_mwst_chf: Math.round(ch_mwst_a),
      transport_chf: Math.round(transport_chf),
      mfk_preparation_chf: Math.round(mfk_prep_chf),
      total_chf: Math.round(total_a),
    },
    without_mwst: {
      automobilsteuer_chf: Math.round(auto_st_b),
      zoll_chf: Math.round(zoll_b),
      ch_mwst_chf: Math.round(ch_mwst_b),
      transport_chf: Math.round(transport_chf),
      mfk_preparation_chf: Math.round(mfk_prep_chf),
      total_chf: Math.round(total_b),
    },
    mwst_saving_chf: Math.round(total_b - total_a),
    autoscout_ch_estimate_chf: Math.round(autoscout_avg_chf),
  };
}
