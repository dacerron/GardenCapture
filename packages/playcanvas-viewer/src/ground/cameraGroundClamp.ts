import * as pc from "playcanvas";
import type { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";
import type { GroundCollider } from "./types";

type Controls = InstanceType<typeof CameraControls>;

type ControlsWithPose = Controls & {
  _pose?: {
    position: pc.Vec3;
    angles: pc.Vec3;
  };
};

class CameraGroundClampScript extends pc.Script {
  static scriptName = "cameraGroundClamp";

  clamp?: () => void;

  postUpdate() {
    this.clamp?.();
  }
}

/** Keep CameraControls internal pose aligned after an external position clamp. */
export function syncCameraControlsPose(
  controls: Controls | null,
  cameraEntity: pc.Entity,
) {
  if (!controls) return;

  const pose = (controls as ControlsWithPose)._pose;
  if (!pose) return;

  pose.position.copy(cameraEntity.getPosition());
  const euler = cameraEntity.getEulerAngles();
  pose.angles.set(euler.x, euler.y, euler.z);
}

/** Clamp camera Y to ground + eye height. Returns true when position changed. */
export function clampCameraToGround(
  cameraEntity: pc.Entity,
  controls: Controls | null,
  collider: GroundCollider,
): boolean {
  const position = cameraEntity.getPosition();
  const minY = collider.getMinCameraY(position.x, position.z);
  if (minY === null || position.y >= minY) return false;

  cameraEntity.setPosition(position.x, minY, position.z);
  syncCameraControlsPose(controls, cameraEntity);
  return true;
}

/** Clamp an arbitrary world position (e.g. marker fly path). Mutates and returns `position`. */
export function clampPositionToGround(
  position: pc.Vec3,
  collider: GroundCollider,
): pc.Vec3 {
  const minY = collider.getMinCameraY(position.x, position.z);
  if (minY !== null && position.y < minY) {
    position.y = minY;
  }
  return position;
}

export type CameraGroundClampHandle = {
  clampNow(): boolean;
  destroy(): void;
};

export function setupCameraGroundClamp(options: {
  app: pc.AppBase;
  cameraEntity: pc.Entity;
  controls: Controls | null;
  collider: GroundCollider;
  enabled?: boolean;
}): CameraGroundClampHandle {
  const { app, cameraEntity, controls, collider, enabled = true } = options;

  const clampNow = () => clampCameraToGround(cameraEntity, controls, collider);

  if (!enabled) {
    return { clampNow, destroy() {} };
  }

  const host = new pc.Entity("cameraGroundClamp");
  app.root.addChild(host);
  host.addComponent("script");
  const script = host.script?.create(CameraGroundClampScript) as
    | CameraGroundClampScript
    | undefined;
  if (script) {
    script.clamp = clampNow;
  }

  return {
    clampNow,
    destroy() {
      host.destroy();
    },
  };
}
