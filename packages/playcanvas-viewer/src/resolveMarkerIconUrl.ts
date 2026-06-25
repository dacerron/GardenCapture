/** Resolve a marker icon path to an absolute URL (matches viewer sidebar behavior). */
export function resolveMarkerIconUrl(raw: string): string {
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
  if (raw.startsWith("/")) return new URL(raw, window.location.origin).href;
  return new URL(`/${raw}`, window.location.origin).href;
}
