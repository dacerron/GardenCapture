const ENABLED = new Set(["1", "true", "yes", "on", "enable", "enabled"]);
const DISABLED = new Set(["0", "false", "off", "no", "disable", "disabled"]);

type SearchParamsLike = {
  get(name: string): string | null;
};

export type GroundOccluderConfig = {
  enabled: boolean;
  /** Voxel-grid Y offset below the heightmap surface (meters). */
  yOffset?: number;
};

/**
 * Parse viewer URL params for the heightmap ground occluder.
 *
 * `?groundOccluder=1` enables the depth prepass + horizontal cell-cap ground occluder
 * (one flat plate per heightmap cell; no vertical walls between cells).
 * `?groundOccluderY=0.12` overrides the default downward offset (meters).
 */
export function parseGroundOccluder(searchParams: SearchParamsLike): GroundOccluderConfig {
  const raw = searchParams.get("groundOccluder");
  if (raw !== null) {
    const token = raw.trim().toLowerCase();
    if (DISABLED.has(token)) {
      return { enabled: false };
    }
    if (!ENABLED.has(token)) {
      return { enabled: false };
    }
  } else {
    return { enabled: false };
  }

  const yRaw = searchParams.get("groundOccluderY");
  let yOffset: number | undefined;
  if (yRaw !== null) {
    const parsed = Number(yRaw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      yOffset = parsed;
    }
  }

  return { enabled: true, yOffset };
}
