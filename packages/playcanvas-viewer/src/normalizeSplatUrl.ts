/** Root-relative `/work-out/…` or absolute `https://…`; not relative to the viewer route. */
export function normalizeSplatUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
