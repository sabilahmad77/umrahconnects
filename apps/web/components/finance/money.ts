/**
 * Money on screen and on the wire.
 *
 * Forms take SAR (or the record's currency) in major units — what people type —
 * and the API stores and returns integer minor units (cents). These helpers are
 * the only place the two meet, so no form multiplies floats by 100 on its own.
 */

/** "SAR 1,234.50". Always two decimals so partial payments never look rounded. */
export function formatAmount(cents: number | string | null | undefined, currency = 'SAR'): string {
  const value = Number(cents);
  if (!Number.isFinite(value)) return '—';
  const major = (value / 100).toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${major}`;
}

/**
 * Parse a typed major-unit amount into integer cents without floating-point
 * drift ("0.29" → 29, never 28.999…). Returns null for anything that is not a
 * plain non-negative number with at most two decimals.
 */
export function parseMajorToCents(input: string | number | null | undefined): number | null {
  const text = String(input ?? '').trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Major units for an API body that expects them (e.g. `amount: 12.5`). Exact for two decimals. */
export const centsToMajor = (cents: number): number => Math.round(cents) / 100;

/** A form value for an amount field, from cents ("1234.50"). */
export const centsToInput = (cents: number): string =>
  (Math.max(0, Math.round(cents)) / 100).toFixed(2);

/**
 * Validate a typed amount against a server-computed ceiling. Returns an error
 * message, or null when the amount is acceptable.
 */
export function amountProblem(input: string, maxCents: number, currency = 'SAR'): string | null {
  const cents = parseMajorToCents(input);
  if (cents === null) return 'Enter an amount such as 150 or 150.50.';
  if (cents <= 0) return 'Enter an amount greater than zero.';
  if (cents > maxCents)
    return `The amount cannot be more than ${formatAmount(maxCents, currency)}.`;
  return null;
}
