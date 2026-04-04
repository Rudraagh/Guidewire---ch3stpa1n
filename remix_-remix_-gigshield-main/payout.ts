/** Payout math + caps (server-side). */

export function istDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function countsTowardPaidCaps(c: { status?: string; amount?: number }): boolean {
  if (c.status === "pending") return false;
  if (c.status === "paid") return true;
  return (c.amount ?? 0) > 0;
}

export function weeklyPaidForPolicy(
  claimRows: { riderId: string; policyId: string; amount: number; status?: string }[],
  riderId: string,
  policyId: string
): number {
  return claimRows
    .filter(
      (c) =>
        c.riderId === riderId &&
        c.policyId === policyId &&
        countsTowardPaidCaps(c)
    )
    .reduce((s, c) => s + c.amount, 0);
}

export function dailyPaidForPolicy(
  claimRows: { riderId: string; policyId: string; amount: number; timestamp: string; status?: string }[],
  riderId: string,
  policyId: string,
  dayKey: string
): number {
  return claimRows
    .filter(
      (c) =>
        c.riderId === riderId &&
        c.policyId === policyId &&
        countsTowardPaidCaps(c) &&
        istDateKey(c.timestamp) === dayKey
    )
    .reduce((s, c) => s + c.amount, 0);
}

export function computePayout(
  declaredEarnings: number,
  hoursLost: number,
  weeklyPaidSoFar: number,
  dailyPaidSoFar: number
): { raw: number; payout: number; capped: boolean } {
  const hourlyRate = declaredEarnings / 50;
  const raw = hoursLost * hourlyRate * 0.8;

  const perEventCap = 400;
  const dailyCap = 400;
  const weeklyCapTotal = 1000;

  const remainingDaily = dailyCap - dailyPaidSoFar;
  const remainingWeekly = weeklyCapTotal - weeklyPaidSoFar;

  const payout = Math.min(
    raw,
    perEventCap,
    Math.max(0, remainingDaily),
    Math.max(0, remainingWeekly)
  );

  const rounded = Math.round(payout);
  return {
    raw,
    payout: rounded,
    capped: rounded < Math.round(raw),
  };
}
