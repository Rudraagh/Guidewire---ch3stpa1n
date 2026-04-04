export const BANDS = [
  { max: 0.2, base: 35, label: "Very Low" },
  { max: 0.4, base: 50, label: "Low" },
  { max: 0.6, base: 70, label: "Moderate" },
  { max: 0.8, base: 90, label: "High" },
  { max: 1.0, base: 110, label: "Very High" },
] as const;

export function calculatePremium(
  forecastDays: number,
  declaredEarnings: number,
  pastClaimCount = 0
) {
  const probability = Math.min(1, Math.max(0, forecastDays / 7));
  const band = BANDS.find((b) => probability <= b.max) ?? BANDS[BANDS.length - 1];
  const base = band.base;
  const earningsRatio = declaredEarnings / 5000;
  const core = base * earningsRatio;
  const withExpense = core * 1.2;
  const grossPreClaims = withExpense * 1.15;
  const pastClaimsFlat = pastClaimCount * 5;
  const gross = Math.round(grossPreClaims + pastClaimsFlat);

  return {
    probability,
    base,
    earningsRatio,
    gross: Math.max(35, gross),
    bandLabel: band.label,
    breakdown: {
      bandBase: base,
      earningsAdjustment: Math.round(base * (earningsRatio - 1)),
      expenseLoading: Math.round(core * 0.2),
      riskBuffer: Math.round(withExpense * 0.15),
      pastClaims: pastClaimsFlat,
    },
    shapSummary: [
      `₹${base} ${band.label} band (P≈${(probability * 100).toFixed(0)}%)`,
      `${Math.round(base * (earningsRatio - 1)) >= 0 ? "+" : "−"}₹${Math.abs(Math.round(base * (earningsRatio - 1)))} earnings vs ₹5k`,
      `+₹${Math.round(core * 0.2)} expense loading (20%)`,
      `+₹${Math.round(withExpense * 0.15)} risk buffer (15%)`,
      ...(pastClaimsFlat > 0 ? [`+₹${pastClaimsFlat} past claims`] : []),
    ].join(" · "),
  };
}

/** Next-week zone risk carry: disruption week +0.10, quiet week −0.05 on probability. */
export function applyProbabilityModifier(
  baseProbability: number,
  modifier: number
): number {
  return Math.min(1, Math.max(0, baseProbability + modifier));
}

export function effectiveForecastDays(
  breachDaysFromApi: number,
  storedModifier: number
): number {
  const p = applyProbabilityModifier(breachDaysFromApi / 7, storedModifier);
  return p * 7;
}
