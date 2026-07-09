/**
 * splat-transform voxel grids use PlayCanvas engine frame (180° about +Z from PLY).
 * Streamed LOD / gsplat asset local space matches the source PLY.
 *
 * engine = (-ply.x, -ply.y, ply.z)
 */

export type HeightmapCoordinateSpace = "splat-local" | "voxel-grid";

export function splatLocalToVoxelGrid(
  localX: number,
  localY: number,
  localZ: number,
): [number, number, number] {
  return [-localX, -localY, localZ];
}

export function voxelGridToSplatLocal(
  gridX: number,
  gridY: number,
  gridZ: number,
): [number, number, number] {
  return [-gridX, -gridY, gridZ];
}

export function plyBoundsFromVoxelGridBounds(gridBounds: {
  min: number[];
  max: number[];
}): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const [eMinX, , eMinZ] = gridBounds.min;
  const [eMaxX, , eMaxZ] = gridBounds.max;
  return {
    minX: -eMaxX,
    maxX: -eMinX,
    minZ: eMinZ,
    maxZ: eMaxZ,
  };
}

export function engineSolidTopToSplatLocalY(engineTopY: number): number {
  return -engineTopY;
}

export function engineXzRectToSplatLocalXz(
  engineX0: number,
  engineX1: number,
  engineZ0: number,
  engineZ1: number,
): { x0: number; x1: number; z0: number; z1: number } {
  return {
    x0: -engineX1,
    x1: -engineX0,
    z0: engineZ0,
    z1: engineZ1,
  };
}
