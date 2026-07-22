import * as pc from "playcanvas";
import type { PerformancePreset } from "@soil/shared/three/ScreenSpace";
import { PERFORMANCE_PRESETS } from "@soil/shared/three/ScreenSpace";

/** PlayCanvas engine default forward-pass alpha clip (~1/255). */
export const PLAYCANVAS_DEFAULT_ALPHA_CLIP_FORWARD = 1 / 255;

/**
 * Map legacy mkkellogg `splatAlphaRemovalThreshold` (0–255) to PlayCanvas
 * {@link GSplatParams#alphaClipForward} (0–1).
 */
export function legacyAlphaThresholdToClipForward(threshold: number): number {
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return PLAYCANVAS_DEFAULT_ALPHA_CLIP_FORWARD;
  }
  return Math.min(1, threshold / 255);
}

export function getAlphaClipForwardForPreset(preset: PerformancePreset): number {
  return legacyAlphaThresholdToClipForward(
    PERFORMANCE_PRESETS[preset].splatAlphaRemovalThreshold,
  );
}

export function applyAlphaClipForward(app: pc.AppBase, alphaClipForward: number) {
  const gsplat = app.scene.gsplat;
  gsplat.alphaClipForward = alphaClipForward;
  // Keep shadow/pick/prepass threshold in sync for consistency.
  gsplat.alphaClip = Math.max(alphaClipForward, 0.05);
}
