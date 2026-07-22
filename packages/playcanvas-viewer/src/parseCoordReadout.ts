type SearchParamsLike = {
  get(name: string): string | null;
};

const ENABLED_TOKENS = new Set(["1", "true", "yes", "on"]);

/**
 * Parse viewer URL params for the click-to-read coordinate picker.
 * Enabled with `?coordReadout=1` (alias `?pickCoords=1`).
 */
export function parseCoordReadout(searchParams: SearchParamsLike): boolean {
  const raw = searchParams.get("coordReadout") ?? searchParams.get("pickCoords");
  if (!raw) return false;
  return ENABLED_TOKENS.has(raw.trim().toLowerCase());
}
