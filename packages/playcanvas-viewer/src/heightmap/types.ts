import * as pc from "playcanvas";

export type HeightmapMeta = {
  version: number;
  /** `splat-local` matches gsplat asset coords; legacy files omit or use `voxel-grid`. */
  coordinateSpace?: "splat-local" | "voxel-grid";
  origin: [number, number];
  cellSize: number;
  width: number;
  depth: number;
  heights: string;
  encoding: "float32";
  sentinel: number;
};

export type HeightmapData = {
  meta: HeightmapMeta;
  /** Row-major [gz * width + gx], splat-local Y in meters. */
  heights: Float32Array;
};

export type HeightmapGroundClampConfig = {
  /** Default true when a heightmap URL resolves. */
  enabled?: boolean;
  /** Height above the ground surface. Default 0.1 m (10 cm). */
  eyeHeight?: number;
  /** Extra clearance above the voxel surface. Default 0. */
  surfaceClearance?: number;
  /** Override auto-resolved heightmap URL; pass null to skip loading. */
  heightmapUrl?: string | null;
};

export type HeightmapQuery = {
  isReady(): boolean;
  /** Ground surface Y in splat-local space, or null when out of bounds / no data. */
  sampleLocal(localX: number, localZ: number): number | null;
};

export type HeightmapGroundCollider = {
  isReady(): boolean;
  /** Minimum allowed camera world Y at the given world position. */
  getMinCameraY(worldX: number, worldY: number, worldZ: number): number | null;
  /** Ground surface world Y under the given world position, or null when out of bounds. */
  sampleGroundWorldY(worldX: number, worldY: number, worldZ: number): number | null;
  clampWorldPosition(position: pc.Vec3): pc.Vec3;
};
