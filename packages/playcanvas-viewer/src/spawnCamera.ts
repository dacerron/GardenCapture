import * as pc from "playcanvas";
import type { CameraControls } from "playcanvas/scripts/esm/camera-controls.mjs";
import { cameraFramingFromStartPos } from "@soil/shared/utils/startPos";
import { resetPlayCanvasCamera } from "./mobileCamera";
import { mapLegacyStoredPosition } from "./sceneCoordinates";

export type CameraFraming = {
  focus: [number, number, number];
  position: [number, number, number];
};

/**
 * Viewer camera framing from `start_pos` (orbit focus) and optional
 * `start_view_position` (camera world position). Falls back to
 * `start_pos` + [0, 2.5, 5] when no view position is stored.
 */
export function resolveInitialCameraFraming(options: {
  startPos: [number, number, number];
  startViewPosition?: [number, number, number] | null;
  splatEntity: pc.Entity;
}): CameraFraming {
  const displayStartPos = mapLegacyStoredPosition(
    options.startPos,
    options.splatEntity,
  );
  if (options.startViewPosition) {
    const displayViewPos = mapLegacyStoredPosition(
      options.startViewPosition,
      options.splatEntity,
    );
    return {
      focus: displayStartPos,
      position: displayViewPos,
    };
  }
  return cameraFramingFromStartPos(displayStartPos);
}

export function applyCameraFraming(options: {
  cameraEntity: pc.Entity;
  controls: InstanceType<typeof CameraControls> | null;
  framing: CameraFraming;
  sceneFocus: pc.Vec3;
  sceneCameraPosition: pc.Vec3;
}): void {
  const { cameraEntity, controls, framing, sceneFocus, sceneCameraPosition } =
    options;

  sceneFocus.set(framing.focus[0], framing.focus[1], framing.focus[2]);
  sceneCameraPosition.set(
    framing.position[0],
    framing.position[1],
    framing.position[2],
  );
  resetPlayCanvasCamera(
    cameraEntity,
    controls,
    sceneFocus,
    sceneCameraPosition,
  );
}

export function resetCameraFromStartPos(options: {
  cameraEntity: pc.Entity;
  controls: InstanceType<typeof CameraControls> | null;
  startPos: [number, number, number];
  startViewPosition?: [number, number, number] | null;
  splatEntity: pc.Entity;
  sceneFocus: pc.Vec3;
  sceneCameraPosition: pc.Vec3;
}): void {
  const framing = resolveInitialCameraFraming({
    startPos: options.startPos,
    startViewPosition: options.startViewPosition,
    splatEntity: options.splatEntity,
  });
  applyCameraFraming({
    cameraEntity: options.cameraEntity,
    controls: options.controls,
    framing,
    sceneFocus: options.sceneFocus,
    sceneCameraPosition: options.sceneCameraPosition,
  });
}
