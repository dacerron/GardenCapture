import type { HeightmapData, HeightmapQuery } from "./types";
import { splatLocalToVoxelGrid, voxelGridToSplatLocal } from "./coordinates";

function isFilled(value: number, sentinel: number): boolean {
  return Number.isFinite(value) && value > sentinel + 1;
}

function createRawHeightmapQuery(data: HeightmapData): HeightmapQuery {
  const { meta, heights } = data;
  const [originX, originZ] = meta.origin;
  const { cellSize, width, depth, sentinel } = meta;

  const sampleNearest = (sampleX: number, sampleZ: number): number | null => {
    const gx = Math.floor((sampleX - originX) / cellSize);
    const gz = Math.floor((sampleZ - originZ) / cellSize);
    if (gx < 0 || gz < 0 || gx >= width || gz >= depth) return null;
    const value = heights[gz * width + gx];
    return isFilled(value, sentinel) ? value : null;
  };

  const sampleBilinear = (sampleX: number, sampleZ: number): number | null => {
    const fx = (sampleX - originX) / cellSize;
    const fz = (sampleZ - originZ) / cellSize;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    if (x0 < 0 || z0 < 0 || x1 >= width || z1 >= depth) {
      return sampleNearest(sampleX, sampleZ);
    }

    const tx = fx - x0;
    const tz = fz - z0;
    const h00 = heights[z0 * width + x0];
    const h10 = heights[z0 * width + x1];
    const h01 = heights[z1 * width + x0];
    const h11 = heights[z1 * width + x1];

    if (
      !isFilled(h00, sentinel) ||
      !isFilled(h10, sentinel) ||
      !isFilled(h01, sentinel) ||
      !isFilled(h11, sentinel)
    ) {
      return sampleNearest(sampleX, sampleZ);
    }

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - tz) + h1 * tz;
  };

  return {
    isReady() {
      return heights.length > 0;
    },
    sampleLocal(sampleX, sampleZ) {
      return sampleBilinear(sampleX, sampleZ);
    },
  };
}

/**
 * Heightmaps are stored in splat-transform voxel-grid space. Runtime queries
 * arrive in gsplat-entity local space and are remapped before sampling.
 */
export function createHeightmapQuery(data: HeightmapData): HeightmapQuery {
  const inner = createRawHeightmapQuery(data);
  const space = data.meta.coordinateSpace ?? "voxel-grid";

  if (space === "splat-local") {
    console.warn(
      "[heightmap] coordinateSpace=splat-local is deprecated; regenerate with extract-heightmap.mjs (voxel-grid).",
    );
  }

  return {
    isReady() {
      return inner.isReady();
    },
    sampleLocal(localX, localZ) {
      const [gridX, , gridZ] = splatLocalToVoxelGrid(localX, 0, localZ);
      const gridY = inner.sampleLocal(gridX, gridZ);
      if (gridY === null) return null;
      return voxelGridToSplatLocal(0, gridY, 0)[1];
    },
  };
}
