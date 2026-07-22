import * as pc from "playcanvas";
import type { HeightmapData } from "./types";
import { voxelGridToSplatLocal } from "./coordinates";

/** Match the sampler's "filled" test: sentinel + small epsilon guards float noise. */
const SENTINEL_EPS = 1;

function isFilled(value: number, sentinel: number): boolean {
  return Number.isFinite(value) && value > sentinel + SENTINEL_EPS;
}

export type HeightmapCellCapsMesh = {
  mesh: pc.Mesh;
  filledCells: number;
  triangleCount: number;
};

/**
 * Build one horizontal quad per filled heightmap cell. Cells are not stitched to
 * neighbors, so there are no sloped or vertical walls between columns — only
 * flat XZ plates at each cell's height.
 */
export function buildHeightmapCellCapsMesh(options: {
  app: pc.AppBase;
  data: HeightmapData;
  /** Subtract from voxel-grid Y before converting to splat-local (meters). */
  yOffset?: number;
}): HeightmapCellCapsMesh | null {
  const { app, data } = options;
  const yOffset = options.yOffset ?? 0;
  const { meta, heights } = data;
  const [originX, originZ] = meta.origin;
  const { cellSize, width, depth, sentinel } = meta;

  const positions: number[] = [];
  const indices: number[] = [];
  let filledCells = 0;

  const pushCorner = (vgX: number, vgY: number, vgZ: number) => {
    const [lx, ly, lz] = voxelGridToSplatLocal(vgX, vgY, vgZ);
    positions.push(lx, ly, lz);
  };

  for (let gz = 0; gz < depth; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const h = heights[gz * width + gx];
      if (!isFilled(h, sentinel)) continue;

      const y = h - yOffset;
      const x0 = originX + gx * cellSize;
      const x1 = originX + (gx + 1) * cellSize;
      const z0 = originZ + gz * cellSize;
      const z1 = originZ + (gz + 1) * cellSize;
      const base = positions.length / 3;

      pushCorner(x0, y, z0);
      pushCorner(x1, y, z0);
      pushCorner(x0, y, z1);
      pushCorner(x1, y, z1);

      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
      filledCells++;
    }
  }

  if (filledCells === 0) return null;

  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);

  return {
    mesh,
    filledCells,
    triangleCount: indices.length / 3,
  };
}
