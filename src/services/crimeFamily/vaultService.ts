// The family vault. Task 9 adds spending, earnings credit, arrears, deposits
// and dues here; the UTC day key lands first because creation stamps it (P11).

/** The UTC calendar day of d as "YYYY-MM-DD" (dues and deposit-cap days). */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
