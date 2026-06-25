import type { VoxelColliderData, VoxelHeightQuery } from "./types";

/**
 * Column height lookup against a splat-transform voxel octree.
 * Skeleton: parses and retains data; full SVO traversal comes in a later phase.
 */
export function createVoxelHeightQuery(data: VoxelColliderData): VoxelHeightQuery {
  // Retain references so a future implementation can traverse without reloading.
  void data.header;
  void data.nodes;
  void data.leafData;

  return {
    isReady() {
      return false;
    },
    getGroundHeight(_worldX, _worldZ) {
      return null;
    },
  };
}
