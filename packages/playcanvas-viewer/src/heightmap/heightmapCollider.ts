import * as pc from "playcanvas";
import type { HeightmapGroundCollider, HeightmapQuery } from "./types";

const DEFAULT_EYE_HEIGHT = 0.1;
const DEFAULT_SURFACE_CLEARANCE = 0;
/** Probe from above so horizontal XZ lookup stays stable when the camera is underground. */
const HORIZONTAL_PROBE_OFFSET = 500;

export function createHeightmapGroundCollider(options: {
  query: HeightmapQuery;
  splatEntity: pc.Entity;
  eyeHeight?: number;
  surfaceClearance?: number;
}): HeightmapGroundCollider {
  const {
    query,
    splatEntity,
    eyeHeight = DEFAULT_EYE_HEIGHT,
    surfaceClearance = DEFAULT_SURFACE_CLEARANCE,
  } = options;
  const heightOffset = eyeHeight + surfaceClearance;

  const worldTransform = new pc.Mat4();
  const invWorldTransform = new pc.Mat4();
  const scratchWorld = new pc.Vec3();
  const scratchLocal = new pc.Vec3();
  const scratchLocalGround = new pc.Vec3();
  const scratchWorldGround = new pc.Vec3();

  const syncTransforms = () => {
    worldTransform.copy(splatEntity.getWorldTransform());
    invWorldTransform.copy(worldTransform).invert();
  };

  const sampleGroundWorldY = (worldX: number, worldY: number, worldZ: number): number | null => {
    if (!query.isReady()) return null;

    syncTransforms();
    scratchWorld.set(worldX, worldY + HORIZONTAL_PROBE_OFFSET, worldZ);
    invWorldTransform.transformPoint(scratchWorld, scratchLocal);

    const groundLocalY = query.sampleLocal(scratchLocal.x, scratchLocal.z);
    if (groundLocalY === null) return null;

    scratchLocalGround.set(scratchLocal.x, groundLocalY, scratchLocal.z);
    worldTransform.transformPoint(scratchLocalGround, scratchWorldGround);
    return scratchWorldGround.y;
  };

  const getMinCameraY = (worldX: number, worldY: number, worldZ: number): number | null => {
    const groundWorldY = sampleGroundWorldY(worldX, worldY, worldZ);
    if (groundWorldY === null) return null;
    return groundWorldY + heightOffset;
  };

  return {
    isReady() {
      return query.isReady();
    },
    getMinCameraY,
    clampWorldPosition(position) {
      const minY = getMinCameraY(position.x, position.y, position.z);
      if (minY !== null && position.y < minY) {
        position.y = minY;
      }
      return position;
    },
  };
}

export type CameraPositionClamp = (position: pc.Vec3) => pc.Vec3;

export function createPositionClamp(
  collider: HeightmapGroundCollider,
): CameraPositionClamp {
  return (position) => collider.clampWorldPosition(position);
}
