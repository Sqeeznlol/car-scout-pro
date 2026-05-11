export type Decision = "interesting" | "maybe" | "skip";
export type RiskLevel = "low" | "medium" | "high";

export interface Vehicle {
  id: string;
  title: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  priceEur: number;
  previousPriceEur?: number;
  fuelType: "Petrol" | "Diesel" | "Hybrid" | "Electric";
  transmission: "Manual" | "Automatic";
  color: string;
  locationCity: string;
  locationCountry: string;
  listingUrl: string;
  platformId: string;
  sourcePlatform: "mobile.de" | "autoscout24.de";
  image: string;
  sellerType: "dealer" | "private";
  sellerName: string;
  daysListed: number;
  createdAt: string;
}

export interface VehicleAnalysis {
  vehicleId: string;
  distanceKm: number;
  transportCostChf: number;
  importTaxChf: number;
  swissVatChf: number;
  customsChf: number;
  mfkCostChf: number;
  preparationCostChf: number;
  eurChfRate: number;
  totalCostChf: number;
  estimatedSellPriceCh: number;
  expectedMarginChf: number;
  marketPriceDeAvg: number;
  marketPriceChAvg: number;
  priceVsMarketPercent: number;
  dealScore: number;
  riskLevel: RiskLevel;
  co2Warning: boolean;
  similarListings: number;
}

export interface AdminConfig {
  eurChfRate: number;
  chfPerKm: number;
  customsFlat: number;
  mfkFlat: number;
  preparationFlat: number;
  targetMarginChf: number;
  co2ThresholdGkm: number;
  scoreWeights: {
    margin: number;
    priceVsMarket: number;
    liquidity: number;
    importRisk: number;
    demand: number;
    learning: number;
  };
}
