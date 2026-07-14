type SearchParamsLike = {
  get(name: string): string | null;
};

export type SkyboxMode = "default" | "blue";

/**
 * Viewer sky background. Use `?skybox=blue` for a solid blue surround to A/B
 * how translucent splat regions read against the default HDR sky.
 */
export function parseSkyboxMode(searchParams: SearchParamsLike): SkyboxMode {
  const raw = searchParams.get("skybox")?.trim().toLowerCase();
  if (raw === "blue" || raw === "solid" || raw === "solidblue") {
    return "blue";
  }
  return "default";
}
