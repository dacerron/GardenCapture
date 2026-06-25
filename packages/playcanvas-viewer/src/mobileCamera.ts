import * as pc from "playcanvas";
import type { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";

export const DEFAULT_CAMERA_POSITION = new pc.Vec3(0, 2, 6);
export const DEFAULT_FOCUS_POINT = new pc.Vec3(0, 0.5, 0);

type Controls = InstanceType<typeof CameraControls>;

export function isMobileLikeControls(): boolean {
  return (
    pc.platform.mobile ||
    (typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches)
  );
}

/** Orbit-only on mobile: 1-finger rotate, 2-finger pan + pinch zoom (all simultaneous). */
export function configureMobileCameraControls(controls: Controls | null) {
  if (!controls) return;
  Object.assign(controls, {
    enableFly: false,
    enableOrbit: true,
    enablePan: true,
  });
}

export function resetPlayCanvasCamera(
  cameraEntity: pc.Entity,
  controls: Controls | null,
  focus: pc.Vec3 = DEFAULT_FOCUS_POINT,
  position: pc.Vec3 = DEFAULT_CAMERA_POSITION,
) {
  cameraEntity.setPosition(position);
  cameraEntity.lookAt(focus);
  if (controls) {
    Object.assign(controls, { focusPoint: focus.clone() });
  }
}
