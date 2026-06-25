import type * as pc from "playcanvas";
import { loadVoxelCollider } from "./loadVoxelCollider";
import {
  computeWorldAabbMinY,
  getSplatResourceAabb,
} from "./splatAabbGround";
import type { GroundClampConfig, GroundCollider, VoxelHeightQuery } from "./types";
import { createVoxelHeightQuery } from "./voxelHeightQuery";

export const DEFAULT_EYE_HEIGHT = 1.6;

export function createGroundCollider(
  splatEntity: pc.Entity,
  config: GroundClampConfig = {},
): GroundCollider {
  const eyeHeight = config.eyeHeight ?? DEFAULT_EYE_HEIGHT;
  let aabbMinY: number | null = readAabbMinY(splatEntity);
  let voxelQuery: VoxelHeightQuery | null = null;
  let destroyed = false;

  const getGroundHeight = (worldX: number, worldZ: number): number | null => {
    const voxelY = voxelQuery?.getGroundHeight(worldX, worldZ);
    if (voxelY !== null && voxelY !== undefined) return voxelY;
    return aabbMinY;
  };

  const getMinCameraY = (worldX: number, worldZ: number): number | null => {
    const groundY = getGroundHeight(worldX, worldZ);
    if (groundY === null) return null;
    return groundY + eyeHeight;
  };

  const refreshAabbFallback = () => {
    aabbMinY = readAabbMinY(splatEntity);
  };

  const loadVoxelCollision = async (url: string) => {
    if (destroyed) return;

    const data = await loadVoxelCollider(url);
    if (!data || destroyed) return;

    voxelQuery = createVoxelHeightQuery(data);
    if (!voxelQuery.isReady()) {
      console.info(
        "[ground] voxel collision loaded; column height query not yet implemented — using AABB fallback",
      );
    }
  };

  return {
    getGroundHeight,
    getMinCameraY,
    loadVoxelCollision,
    refreshAabbFallback,
    destroy() {
      destroyed = true;
      voxelQuery = null;
    },
  };
}

function readAabbMinY(splatEntity: pc.Entity): number | null {
  const aabb = getSplatResourceAabb(splatEntity);
  if (!aabb) return null;
  return computeWorldAabbMinY(splatEntity, aabb);
}
