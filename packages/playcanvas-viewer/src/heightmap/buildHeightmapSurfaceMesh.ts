import * as pc from "playcanvas";
import type { HeightmapData } from "./types";
import { voxelGridToSplatLocal } from "./coordinates";

/** Match the sampler's "filled" test: sentinel + small epsilon guards float noise. */
const SENTINEL_EPS = 1;

function isFilled(value: number, sentinel: number): boolean {
  return Number.isFinite(value) && value > sentinel + SENTINEL_EPS;
}

/** Low → high elevation ramp: blue → cyan → green → yellow → red. */
function heightRamp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const stops: Array<[number, number, number]> = [
    [0.15, 0.2, 0.75],
    [0.1, 0.75, 0.85],
    [0.2, 0.8, 0.25],
    [0.95, 0.85, 0.15],
    [0.9, 0.2, 0.15],
  ];
  const seg = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

export type HeightmapSurfaceMesh = {
  mesh: pc.Mesh;
  filledVertices: number;
  triangleCount: number;
};

/**
 * Build a triangle surface from a loaded heightmap in splat-local space.
 * Empty (sentinel) cells are skipped, so holes in the heightmap stay as holes.
 */
export function buildHeightmapSurfaceMesh(options: {
  app: pc.AppBase;
  data: HeightmapData;
  /** Subtract from voxel-grid Y before converting to splat-local (meters). */
  yOffset?: number;
  /** When set, attach per-vertex RGBA colors (height ramp). */
  colorMode?: "height-ramp" | "none";
}): HeightmapSurfaceMesh | null {
  const { app, data } = options;
  const yOffset = options.yOffset ?? 0;
  const colorMode = options.colorMode ?? "none";
  const { meta, heights } = data;
  const [originX, originZ] = meta.origin;
  const { cellSize, width, depth, sentinel } = meta;

  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (!isFilled(h, sentinel)) continue;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
  if (!Number.isFinite(minH)) return null;
  const span = maxH - minH || 1;

  const vertexIndex = new Int32Array(width * depth).fill(-1);
  const positions: number[] = [];
  const colors: number[] = [];
  let vcount = 0;

  for (let gz = 0; gz < depth; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const idx = gz * width + gx;
      const h = heights[idx];
      if (!isFilled(h, sentinel)) continue;
      const vgX = originX + (gx + 0.5) * cellSize;
      const vgZ = originZ + (gz + 0.5) * cellSize;
      const [lx, ly, lz] = voxelGridToSplatLocal(vgX, h - yOffset, vgZ);
      positions.push(lx, ly, lz);
      if (colorMode === "height-ramp") {
        const [r, g, b] = heightRamp((h - minH) / span);
        colors.push(r, g, b, 1);
      }
      vertexIndex[idx] = vcount++;
    }
  }

  const indices: number[] = [];
  for (let gz = 0; gz < depth - 1; gz++) {
    for (let gx = 0; gx < width - 1; gx++) {
      const i00 = vertexIndex[gz * width + gx];
      const i10 = vertexIndex[gz * width + gx + 1];
      const i01 = vertexIndex[(gz + 1) * width + gx];
      const i11 = vertexIndex[(gz + 1) * width + gx + 1];
      if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) continue;
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }

  if (indices.length === 0) return null;

  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  if (colorMode === "height-ramp") {
    mesh.setColors(colors, 4);
  }
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);

  return {
    mesh,
    filledVertices: vcount,
    triangleCount: indices.length / 3,
  };
}
