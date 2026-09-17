/**
 * The message to show a user for a failed API call.
 *
 * The API's error envelope carries `error.message` as either a string or, for
 * request-validation failures, an array of individual problems. Rendering the
 * array directly put raw JSON in front of the user — `["property search should
 * not exist","status must be a valid enum value"]` — so it is joined into a
 * sentence here instead.
 */
export function apiErrorMessage(error: unknown, fallback = 'That action could not be completed. Try again.'): string {
  const body = (error as any)?.response?.data;
  const raw = body?.error?.message ?? body?.message ?? (error as any)?.message;

  if (Array.isArray(raw)) {
    const parts = raw.map((m) => String(m).trim()).filter(Boolean);
    if (!parts.length) return fallback;
    // Sentence-case the first entry and separate the rest clearly.
    const [first, ...rest] = parts;
    const head = first.charAt(0).toUpperCase() + first.slice(1);
    return rest.length ? `${head}. ${rest.join('. ')}.` : `${head}.`;
  }

  const text = typeof raw === 'string' ? raw.trim() : '';
  return text || fallback;
}
