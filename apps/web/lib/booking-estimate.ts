/** Estimates only the pricing units whose meaning is established by the API. */
export function bookingEstimateCents(priceCents: number | string | null | undefined, model: string, partySize: number): number | null {
  const price = priceCents == null ? NaN : Number(priceCents);
  if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(partySize) || partySize < 1) return null;
  const result = model === 'PER_PERSON' ? price * partySize : model === 'PER_GROUP' ? price : null;
  return result != null && Number.isSafeInteger(result) ? result : null;
}
