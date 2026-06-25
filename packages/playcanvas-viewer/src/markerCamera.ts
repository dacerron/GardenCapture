import * as pc from "playcanvas";
import type { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";
import type { CameraControlHooks } from "./cameraInputGate";
import type { MarkerVector } from "@soil/shared/types/fields";

export type { CameraControlHooks };

const MIN_DURATION = 1.1;
const MAX_DURATION = 2.2;
const DISTANCE_FACTOR = 0.018;

type Controls = InstanceType<typeof CameraControls>;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeLookRotation(position: pc.Vec3, target: pc.Vec3): pc.Quat {
  const rotation = new pc.Quat();
  const lookTarget =
    position.distance(target) < 1e-4
      ? new pc.Vec3(target.x, target.y + 1e-3, target.z)
      : target;
  const mat = new pc.Mat4().setLookAt(position, lookTarget, pc.Vec3.UP);
  rotation.setFromMat4(mat);
  return rotation;
}

function syncControlsAfterTransition(
  controls: Controls,
  cameraEntity: pc.Entity,
  focus: pc.Vec3,
  position: pc.Vec3,
  rotation: pc.Quat,
) {
  cameraEntity.setPosition(position);
  cameraEntity.setRotation(rotation);
  Object.assign(controls, { focusPoint: focus.clone() });
}

export type MarkerCameraTransition = {
  cancel(): void;
};

export type CameraPositionClamp = (position: pc.Vec3) => pc.Vec3;

export function flyCameraToMarker(
  app: pc.AppBase,
  cameraEntity: pc.Entity,
  controls: Controls | null,
  markerPosition: MarkerVector,
  viewPosition: MarkerVector,
  controlHooks?: CameraControlHooks | null,
  clampCameraPosition?: CameraPositionClamp | null,
): MarkerCameraTransition {
  const pauseCameraControls =
    controlHooks?.pauseCameraControls ??
    (() => {
      if (controls) controls.enabled = false;
    });
  const resumeCameraControls =
    controlHooks?.resumeCameraControls ??
    (() => {
      if (controls) controls.enabled = true;
    });

  pauseCameraControls();

  const startPos = cameraEntity.getPosition().clone();
  const startRot = cameraEntity.getRotation().clone();
  const endPos = new pc.Vec3(viewPosition[0], viewPosition[1], viewPosition[2]);
  if (clampCameraPosition) clampCameraPosition(endPos);
  const focus = new pc.Vec3(markerPosition[0], markerPosition[1], markerPosition[2]);
  const endRot = computeLookRotation(endPos, focus);

  const travelDistance = startPos.distance(endPos);
  const duration = pc.math.clamp(
    MIN_DURATION + travelDistance * DISTANCE_FACTOR,
    MIN_DURATION,
    MAX_DURATION,
  );

  let elapsed = 0;
  const scratchRot = new pc.Quat();
  const scratchPos = new pc.Vec3();

  const finish = (completed: boolean) => {
    app.off("update", onUpdate);
    if (!controls) return;
    if (completed) {
      syncControlsAfterTransition(controls, cameraEntity, focus, endPos, endRot);
    }
    resumeCameraControls();
  };

  const onUpdate = (dt: number) => {
    elapsed += dt;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeInOutCubic(t);

    scratchPos.lerp(startPos, endPos, eased);
    if (clampCameraPosition) clampCameraPosition(scratchPos);
    cameraEntity.setPosition(scratchPos);
    cameraEntity.setRotation(scratchRot.slerp(startRot, endRot, eased));

    if (t >= 1) {
      finish(true);
    }
  };

  app.on("update", onUpdate);

  return {
    cancel() {
      finish(false);
    },
  };
}
