// Money is integer USD cents everywhere; time is integer minutes.
// These helpers convert at the input boundary without floating-point drift.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** "50", "50.5", "$1,250.00" → cents; null when not a valid non-negative amount. */
export function parseDollarsToCents(input: string): number | null {
  const match = /^\s*\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match) return null;
  const dollars = Number(match[1]!.replace(/,/g, ''));
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/** Cents → "50.00", for pre-filling dollar inputs. */
export function centsToDollarInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** Same rounding as the server: round(estimatedMinutes * hourlyRateCents / 60). */
export function lineAmountCents(estimatedMinutes: number, hourlyRateCents: number): number {
  return Math.round((estimatedMinutes * hourlyRateCents) / 60);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
