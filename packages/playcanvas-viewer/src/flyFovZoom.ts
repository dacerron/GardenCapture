import type * as pc from "playcanvas";
import type { ControlMode } from "@soil/shared/three/ScreenSpace";
import { isMobileLikeControls } from "./mobileCamera";

/** Matches `createPlayCanvasApp` camera setup. */
export const DEFAULT_CAMERA_FOV = 75;
export const FLY_FOV_MIN = 20;
export const FLY_FOV_MAX = 90;
/** Multiplicative FOV change per wheel notch (scroll up = zoom in = lower FOV). */
export const FLY_FOV_ZOOM_FACTOR = 1.08;

export type FlyFovZoomHandle = {
  setEnabled(enabled: boolean): void;
  setControlMode(mode: ControlMode): void;
  reset(): void;
  destroy(): void;
};

/**
 * Scroll-wheel FOV zoom for desktop fly mode: changes lens FOV without moving the camera.
 * Orbit mode keeps PlayCanvas CameraControls dolly-on-wheel behavior.
 */
export function setupFlyFovZoom(
  canvas: HTMLCanvasElement,
  cameraEntity: pc.Entity,
  options?: {
    baseFov?: number;
    minFov?: number;
    maxFov?: number;
    zoomFactor?: number;
  },
): FlyFovZoomHandle {
  const baseFov = options?.baseFov ?? DEFAULT_CAMERA_FOV;
  const minFov = options?.minFov ?? FLY_FOV_MIN;
  const maxFov = options?.maxFov ?? FLY_FOV_MAX;
  const zoomFactor = options?.zoomFactor ?? FLY_FOV_ZOOM_FACTOR;

  let enabled = false;

  const applyFov = (next: number) => {
    const camera = cameraEntity.camera;
    if (!camera) return;
    camera.fov = Math.min(maxFov, Math.max(minFov, next));
  };

  const onWheel = (event: WheelEvent) => {
    if (!enabled) return;
    if (event.ctrlKey || event.metaKey) return;

    const camera = cameraEntity.camera;
    if (!camera) return;

    event.preventDefault();
    event.stopPropagation();

    // Positive deltaY = scroll down = zoom out = higher FOV.
    const direction = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
    if (direction === 0) return;

    const factor = direction > 0 ? zoomFactor : 1 / zoomFactor;
    applyFov(camera.fov * factor);
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });

  const syncEnabled = (mode: ControlMode) => {
    enabled = mode === "fly" && !isMobileLikeControls();
  };

  let currentMode: ControlMode = "orbit";

  return {
    setEnabled(nextEnabled) {
      enabled = nextEnabled && !isMobileLikeControls();
    },
    setControlMode(mode) {
      currentMode = mode;
      syncEnabled(mode);
    },
    reset() {
      applyFov(baseFov);
      syncEnabled(currentMode);
    },
    destroy() {
      canvas.removeEventListener("wheel", onWheel);
      enabled = false;
    },
  };
}
