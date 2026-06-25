import type { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";
import type { ControlMode } from "@soil/shared/three/ScreenSpace";
import { isMobileLikeControls } from "./mobileCamera";

type Controls = InstanceType<typeof CameraControls>;

/** Toggle PlayCanvas CameraControls between fly and orbit (desktop only). */
export function applyCameraControlMode(controls: Controls | null, mode: ControlMode) {
  if (!controls || isMobileLikeControls()) return;

  if (mode === "fly") {
    Object.assign(controls, {
      enableFly: true,
      enableOrbit: false,
      enablePan: false,
    });
    return;
  }

  Object.assign(controls, {
    enableFly: false,
    enableOrbit: true,
    enablePan: true,
  });
}
