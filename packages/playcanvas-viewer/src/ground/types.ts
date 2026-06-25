/** Parsed voxel collision header (splat-transform voxel format v1.1). */
export type VoxelColliderHeader = {
  version: string;
  gridBounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  sceneBounds?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  voxelResolution: number;
  leafSize: number;
  treeDepth: number;
  numInteriorNodes: number;
  numMixedLeaves: number;
  nodeCount: number;
  leafDataCount: number;
};

export type VoxelColliderData = {
  header: VoxelColliderHeader;
  nodes: Uint32Array;
  leafData: Uint32Array;
};

export type GroundClampConfig = {
  /** When false, no post-update clamp is installed. Default true. */
  enabled?: boolean;
  /** Minimum height above ground surface. Default 1.6 world units. */
  eyeHeight?: number;
  /** Override collision manifest URL; pass null to skip voxel load. */
  collisionUrl?: string | null;
};

export type VoxelHeightQuery = {
  /** True when column height lookup is implemented and usable. */
  isReady(): boolean;
  /** Highest solid surface Y at world XZ, or null when unknown. */
  getGroundHeight(worldX: number, worldZ: number): number | null;
};

export type GroundCollider = {
  getGroundHeight(worldX: number, worldZ: number): number | null;
  getMinCameraY(worldX: number, worldZ: number): number | null;
  loadVoxelCollision(url: string): Promise<void>;
  refreshAabbFallback(): void;
  destroy(): void;
};
