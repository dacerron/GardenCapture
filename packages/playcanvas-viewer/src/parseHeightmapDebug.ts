import type { HeightmapOverlayMode } from "./heightmap/heightmapOverlay";

export type HeightmapDebugConfig = {
  enabled: boolean;
  mode: HeightmapOverlayMode;
  /** Surface opacity in (0, 1]; ignored for wireframe. */
  opacity?: number;
};

type SearchParamsLike = {
  get(name: string): string | null;
};

const SURFACE_TOKENS = new Set(["1", "true", "yes", "on", "surface", "mesh"]);
const WIRE_TOKENS = new Set(["wire", "wireframe", "lines"]);

/**
 * Parse viewer URL params for the heightmap debug overlay.
 *
 * `?heightmapDebug=1` (or `surface`) → translucent height-colored surface.
 * `?heightmapDebug=wire` → wireframe.
 * `?heightmapDebugOpacity=0.4` → override surface opacity.
 */
export function parseHeightmapDebug(
  searchParams: SearchParamsLike,
): HeightmapDebugConfig {
  const raw = searchParams.get("heightmapDebug");
  const disabled: HeightmapDebugConfig = { enabled: false, mode: "surface" };
  if (!raw) return disabled;

  const value = raw.trim().toLowerCase();
  let mode: HeightmapOverlayMode;
  if (WIRE_TOKENS.has(value)) {
    mode = "wire";
  } else if (SURFACE_TOKENS.has(value)) {
    mode = "surface";
  } else {
    return disabled;
  }

  const opacityRaw = searchParams.get("heightmapDebugOpacity");
  let opacity: number | undefined;
  if (opacityRaw !== null) {
    const parsed = Number(opacityRaw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1) {
      opacity = parsed;
    }
  }

  return { enabled: true, mode, opacity };
}
