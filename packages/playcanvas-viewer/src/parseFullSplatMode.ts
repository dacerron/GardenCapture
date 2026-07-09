type SearchParamsLike = {
  get(name: string): string | null;
};

const ENABLED = new Set(["1", "true", "yes", "on"]);

/**
 * When true, load the legacy `field.File` splat through PlayCanvas as a single
 * PLY (no streamed SOG). Use `?fullSplat=1` to A/B test renderer vs processing.
 */
export function parseFullSplatMode(searchParams: SearchParamsLike): boolean {
  const raw = searchParams.get("fullSplat")?.trim().toLowerCase();
  return raw !== undefined && raw !== "" && ENABLED.has(raw);
}
