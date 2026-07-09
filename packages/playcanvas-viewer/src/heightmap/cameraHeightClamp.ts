import * as pc from "playcanvas";
import type { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";
import type { HeightmapGroundCollider } from "./types";

type Controls = InstanceType<typeof CameraControls>;

type ControlsWithPose = Controls & {
  focusPoint: pc.Vec3;
  _pose?: {
    position: pc.Vec3;
    angles: pc.Vec3;
  };
};

class CameraHeightClampScript extends pc.Script {
  static scriptName = "cameraHeightClamp";

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

export function clampCameraToHeightmap(
  cameraEntity: pc.Entity,
  controls: Controls | null,
  collider: HeightmapGroundCollider,
): boolean {
  const position = cameraEntity.getPosition();
  const minY = collider.getMinCameraY(position.x, position.y, position.z);
  if (minY === null || position.y >= minY - 1e-4) return false;

  const deltaY = minY - position.y;
  cameraEntity.setPosition(position.x, minY, position.z);

  if (controls) {
    const controlsWithFocus = controls as ControlsWithPose;
    controlsWithFocus.focusPoint.y += deltaY;
    syncCameraControlsPose(controls, cameraEntity);
  }

  return true;
}

export type CameraHeightClampHandle = {
  clampNow(): boolean;
  destroy(): void;
};

export function setupCameraHeightClamp(options: {
  app: pc.AppBase;
  cameraEntity: pc.Entity;
  controls: Controls | null;
  collider: HeightmapGroundCollider;
  enabled?: boolean;
}): CameraHeightClampHandle {
  const { app, cameraEntity, controls, collider, enabled = true } = options;

  const clampNow = () => {
    if (!collider.isReady()) return false;
    return clampCameraToHeightmap(cameraEntity, controls, collider);
  };

  if (!enabled) {
    return { clampNow, destroy() {} };
  }

  const host = new pc.Entity("cameraHeightClamp");
  app.root.addChild(host);
  host.addComponent("script");
  const script = host.script?.create(CameraHeightClampScript) as
    | CameraHeightClampScript
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
