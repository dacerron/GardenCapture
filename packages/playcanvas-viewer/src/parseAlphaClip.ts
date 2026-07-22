import {
  legacyAlphaThresholdToClipForward,
  PLAYCANVAS_DEFAULT_ALPHA_CLIP_FORWARD,
} from "./alphaClip";

const DISABLED = new Set(["0", "false", "off", "no", "disable", "disabled", "none"]);

type SearchParamsLike = {
  get(name: string): string | null;
};

function parseAlphaClipValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (DISABLED.has(lower)) {
    return PLAYCANVAS_DEFAULT_ALPHA_CLIP_FORWARD;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  // Accept legacy 0–255 thresholds (e.g. `alphaClip=5`) or direct 0–1 fractions.
  if (parsed > 1) {
    return legacyAlphaThresholdToClipForward(parsed);
  }
  return parsed;
}

/**
 * Optional viewer URL override for gsplat forward-pass alpha culling.
 *
 * - `?alphaClip=5` — legacy-style threshold (maps to 5/255)
 * - `?alphaClip=0.02` — direct PlayCanvas alphaClipForward value
 * - `?alphaClip=0` / `off` — engine minimum (1/255)
 *
 * When absent, the active quality preset supplies the threshold.
 */
export function parseAlphaClipForwardOverride(
  searchParams: SearchParamsLike,
): number | undefined {
  for (const key of ["alphaClip", "alphaClipForward", "alphaThreshold"]) {
    const raw = searchParams.get(key);
    if (raw === null) continue;
    const parsed = parseAlphaClipValue(raw);
    if (parsed !== null) return parsed;
  }
  return undefined;
}
