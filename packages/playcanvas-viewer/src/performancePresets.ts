import * as pc from "playcanvas";
import type { PerformancePreset } from "@soil/shared/three/ScreenSpace";
import { applyAlphaClipForward, getAlphaClipForwardForPreset } from "./alphaClip";
import { isMobileLikeControls } from "./mobileCamera";

/**
 * Global splat budget caps (millions of Gaussians) per quality preset.
 *
 * PlayCanvas degrades distant LOD first to stay under budget. Medium matches
 * project migration targets (1M mobile / 3M desktop). Low/High are ~25% steps
 * below/above for a noticeable but not extreme quality swing.
 */
export const PLAYCANVAS_SPLAT_BUDGET_M: Record<
  PerformancePreset,
  { mobile: number; desktop: number }
> = {
  low: { mobile: 0.75, desktop: 2 },
  medium: { mobile: 1, desktop: 3 },
  high: { mobile: 1.75, desktop: 5 },
};

export const PLAYCANVAS_PERF_PRESET_LABELS: Record<PerformancePreset, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function getDefaultPerformancePreset(): PerformancePreset {
  return isMobileLikeControls() ? "low" : "medium";
}

export function getSplatBudgetM(
  preset: PerformancePreset,
  mobile = isMobileLikeControls(),
): number {
  const row = PLAYCANVAS_SPLAT_BUDGET_M[preset];
  return mobile ? row.mobile : row.desktop;
}

export function applySplatBudget(app: pc.AppBase, budgetM: number) {
  app.scene.gsplat.splatBudget = Math.round(budgetM * 1_000_000);
}

export function applyPerformancePreset(app: pc.AppBase, preset: PerformancePreset) {
  applySplatBudget(app, getSplatBudgetM(preset));
  applyAlphaClipForward(app, getAlphaClipForwardForPreset(preset));
}
