const ENABLED = new Set(["1", "true", "yes", "on", "enable", "enabled"]);

type SearchParamsLike = {
  get(name: string): string | null;
};

/**
 * Parse viewer/editor URL params for fly-mode scroll-wheel FOV zoom.
 *
 * Off by default; enable with a truthy token: `?flyZoom=1` or `?flyZoom=on`.
 */
export function parseFlyZoomEnabled(searchParams: SearchParamsLike): boolean {
  const value = searchParams.get("flyZoom");
  if (value === null) return false;
  return ENABLED.has(value.trim().toLowerCase());
}
