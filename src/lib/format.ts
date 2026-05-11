export const fmtChf = (n: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);
export const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
export const fmtKm = (n: number) =>
  new Intl.NumberFormat("de-CH").format(n) + " km";
export const fmtNum = (n: number) => new Intl.NumberFormat("de-CH").format(n);

export function scoreColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 80) return { bg: "bg-success/15 text-success border-success/30", text: "text-success", label: "Excellent" };
  if (score >= 65) return { bg: "bg-chart-2/15 text-chart-2 border-chart-2/30", text: "text-chart-2", label: "Strong" };
  if (score >= 50) return { bg: "bg-warning/15 text-warning border-warning/30", text: "text-warning", label: "Fair" };
  return { bg: "bg-danger/15 text-danger border-danger/30", text: "text-danger", label: "Weak" };
}

export function riskDotClass(level: "low" | "medium" | "high"): string {
  return level === "low" ? "bg-success" : level === "medium" ? "bg-warning" : "bg-danger";
}
