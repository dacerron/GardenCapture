type SearchParamsLike = {
  get(name: string): string | null;
};

/**
 * - `default` — horizon-fade HDR (matches legacy Three.js viewer; current default)
 * - `blue` — solid blue surround for transparency A/B
 * - `infinite` — pre-fix PlayCanvas infinite cubemap (sky wraps under the ground)
 */
export type SkyboxMode = "default" | "blue" | "infinite";

/**
 * Viewer sky background.
 * - omit / `horizon` / `legacy` — horizon fade matching the legacy Three.js viewer
 * - `?skybox=blue` — solid blue surround
 * - `?skybox=infinite` / `old` / `cubemap` — previous PlayCanvas wraparound cubemap
 */
export function parseSkyboxMode(searchParams: SearchParamsLike): SkyboxMode {
  const raw = searchParams.get("skybox")?.trim().toLowerCase();
  if (raw === "blue" || raw === "solid" || raw === "solidblue") {
    return "blue";
  }
  if (raw === "infinite" || raw === "cubemap" || raw === "wrap" || raw === "old") {
    return "infinite";
  }
  // Explicit aliases for the horizon-fade path (same as omitting the param).
  if (raw === "horizon" || raw === "legacy" || raw === "default") {
    return "default";
  }
  return "default";
}
