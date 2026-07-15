#!/usr/bin/env node
/**
 * Build a 2D ground height grid from splat-transform voxel collision files.
 *
 * Each column stores the highest solid voxel surface below a walkable Y band
 * derived from scene bounds. This ignores fog/cloud voxels that sit above the
 * navigable soil surface but keeps real ground on slopes and pits.
 *
 * Usage:
 *   node scripts/splat/extract-heightmap.mjs --voxel work/out/Scene/collision.voxel.json
 *   node scripts/splat/extract-heightmap.mjs --voxel … --walkable-band-max 12
 *   node scripts/splat/extract-heightmap.mjs --voxel … --walkable-max-y 4.5
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SENTINEL = -9999;
const MAX_GRID_DIM = 512;
const DEFAULT_WALKABLE_BAND_MIN_M = 6;
const DEFAULT_WALKABLE_BAND_MAX_M = 30;
const DEFAULT_WALKABLE_BAND_FRACTION = 0.85;

function parseOptionalNumber(value, flagName) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${flagName} must be a finite number (got ${JSON.stringify(value)})`);
  }
  return n;
}

function parseArgs(argv) {
  const args = {
    voxel: null,
    out: null,
    cell: null,
    walkableBandMinM: null,
    walkableBandMaxM: null,
    walkableBandFraction: null,
    walkableMaxY: null,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--voxel") args.voxel = argv[++i];
    else if (token === "--out") args.out = argv[++i];
    else if (token === "--cell") {
      args.cell = parseOptionalNumber(argv[++i], "--cell");
    } else if (token === "--walkable-band-min" || token === "--walkable-band-min-m") {
      args.walkableBandMinM = parseOptionalNumber(argv[++i], token);
    } else if (token === "--walkable-band-max" || token === "--walkable-band-max-m") {
      args.walkableBandMaxM = parseOptionalNumber(argv[++i], token);
    } else if (token === "--walkable-band-fraction") {
      args.walkableBandFraction = parseOptionalNumber(argv[++i], token);
    } else if (token === "--walkable-max-y" || token === "--walkable-max-y-m") {
      args.walkableMaxY = parseOptionalNumber(argv[++i], token);
    } else if (token === "--help" || token === "-h") {
      console.log(`Usage:
  node scripts/splat/extract-heightmap.mjs --voxel <collision.voxel.json> [options]

Options:
  --out <heightmap.json>         Output path (default: beside voxel file)
  --cell <meters>                Height grid cell size (default: max(voxelRes, 0.25))
  --walkable-band-min <m>        Min band height above grid floor (default: ${DEFAULT_WALKABLE_BAND_MIN_M})
  --walkable-band-max <m>        Cap on band height above grid floor (default: ${DEFAULT_WALKABLE_BAND_MAX_M})
  --walkable-band-fraction <0-1> Fraction of grid Y span used for band (default: ${DEFAULT_WALKABLE_BAND_FRACTION})
  --walkable-max-y <m>           Absolute splat-local / voxel-grid Y ceiling (overrides band formula)

Env (used when the matching CLI flag is omitted):
  SPLAT_HEIGHTMAP_CELL
  SPLAT_HEIGHTMAP_WALKABLE_BAND_MIN
  SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX
  SPLAT_HEIGHTMAP_WALKABLE_BAND_FRACTION
  SPLAT_HEIGHTMAP_WALKABLE_MAX_Y`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.voxel) throw new Error("--voxel is required");

  if (args.cell == null && process.env.SPLAT_HEIGHTMAP_CELL) {
    args.cell = parseOptionalNumber(process.env.SPLAT_HEIGHTMAP_CELL, "SPLAT_HEIGHTMAP_CELL");
  }
  if (args.walkableBandMinM == null) {
    args.walkableBandMinM = parseOptionalNumber(
      process.env.SPLAT_HEIGHTMAP_WALKABLE_BAND_MIN,
      "SPLAT_HEIGHTMAP_WALKABLE_BAND_MIN",
    ) ?? DEFAULT_WALKABLE_BAND_MIN_M;
  }
  if (args.walkableBandMaxM == null) {
    args.walkableBandMaxM = parseOptionalNumber(
      process.env.SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX,
      "SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX",
    ) ?? DEFAULT_WALKABLE_BAND_MAX_M;
  }
  if (args.walkableBandFraction == null) {
    args.walkableBandFraction = parseOptionalNumber(
      process.env.SPLAT_HEIGHTMAP_WALKABLE_BAND_FRACTION,
      "SPLAT_HEIGHTMAP_WALKABLE_BAND_FRACTION",
    ) ?? DEFAULT_WALKABLE_BAND_FRACTION;
  }
  if (args.walkableMaxY == null && process.env.SPLAT_HEIGHTMAP_WALKABLE_MAX_Y) {
    args.walkableMaxY = parseOptionalNumber(
      process.env.SPLAT_HEIGHTMAP_WALKABLE_MAX_Y,
      "SPLAT_HEIGHTMAP_WALKABLE_MAX_Y",
    );
  }

  if (!(args.walkableBandMinM > 0)) {
    throw new Error("--walkable-band-min must be > 0");
  }
  if (!(args.walkableBandMaxM >= args.walkableBandMinM)) {
    throw new Error("--walkable-band-max must be >= --walkable-band-min");
  }
  if (!(args.walkableBandFraction > 0 && args.walkableBandFraction <= 1)) {
    throw new Error("--walkable-band-fraction must be in (0, 1]");
  }

  return args;
}

function walkableMaxY(header, options) {
  if (options.walkableMaxY != null) {
    return options.walkableMaxY;
  }

  const grid = header.gridBounds;
  const yMin = grid.min[1];
  const yMax = grid.max[1];
  const span = Math.max(0, yMax - yMin);
  const band = Math.min(
    options.walkableBandMaxM,
    Math.max(options.walkableBandMinM, span * options.walkableBandFraction),
  );
  return yMin + band;
}

function isSolidLeaf(word) {
  return word === 0xff000000;
}

function isMixedLeaf(word) {
  return (word >>> 24) === 0;
}

function readVoxelDataset(voxelJsonPath) {
  const header = JSON.parse(readFileSync(voxelJsonPath, "utf8"));
  const major = Number(String(header.version ?? "0").split(".")[0]);
  if (major > 1) {
    throw new Error(`Unsupported voxel format version ${header.version}`);
  }

  const binPath = voxelJsonPath.replace(/\.voxel\.json$/i, ".voxel.bin");
  const binBuffer = readFileSync(binPath);
  const nodeCount = header.nodeCount ?? 0;
  const leafDataCount = header.leafDataCount ?? 0;
  const expectedBytes = (nodeCount + leafDataCount) * 4;
  if (binBuffer.byteLength !== expectedBytes) {
    throw new Error(
      `Binary size mismatch: expected ${expectedBytes} bytes, got ${binBuffer.byteLength}`,
    );
  }

  const nodes = new Uint32Array(
    binBuffer.buffer,
    binBuffer.byteOffset,
    nodeCount,
  );
  const leafData = new Uint32Array(
    binBuffer.buffer,
    binBuffer.byteOffset + nodeCount * 4,
    leafDataCount,
  );

  return { header, nodes, leafData, binPath };
}

function createHeightGrid(header, cellSize, bandOptions) {
  const [minX, , minZ] = header.gridBounds.min;
  const [maxX, , maxZ] = header.gridBounds.max;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  let cell = cellSize ?? Math.max(header.voxelResolution, 0.25);
  const widthAtCell = Math.ceil(spanX / cell);
  const depthAtCell = Math.ceil(spanZ / cell);
  if (widthAtCell > MAX_GRID_DIM || depthAtCell > MAX_GRID_DIM) {
    cell = Math.max(cell, spanX / MAX_GRID_DIM, spanZ / MAX_GRID_DIM);
  }

  const width = Math.max(1, Math.ceil(spanX / cell));
  const depth = Math.max(1, Math.ceil(spanZ / cell));
  const heights = new Float32Array(width * depth);
  const fallbackHeights = new Float32Array(width * depth);
  heights.fill(SENTINEL);
  fallbackHeights.fill(SENTINEL);

  return {
    originX: minX,
    originZ: minZ,
    cellSize: cell,
    width,
    depth,
    heights,
    fallbackHeights,
    walkableMaxY: walkableMaxY(header, bandOptions),
    bandOptions,
    maxX,
    maxZ,
  };
}

function updateHeightRect(grid, x0, z0, x1, z1, topY) {
  const gx0 = Math.max(0, Math.floor((x0 - grid.originX) / grid.cellSize));
  const gx1 = Math.min(grid.width - 1, Math.floor((x1 - grid.originX - 1e-9) / grid.cellSize));
  const gz0 = Math.max(0, Math.floor((z0 - grid.originZ) / grid.cellSize));
  const gz1 = Math.min(grid.depth - 1, Math.floor((z1 - grid.originZ - 1e-9) / grid.cellSize));
  if (gx0 > gx1 || gz0 > gz1) return;

  const inWalkableBand = topY <= grid.walkableMaxY;

  for (let gz = gz0; gz <= gz1; gz++) {
    const row = gz * grid.width;
    for (let gx = gx0; gx <= gx1; gx++) {
      const idx = row + gx;
      if (inWalkableBand && topY > grid.heights[idx]) {
        grid.heights[idx] = topY;
      }
      if (topY > grid.fallbackHeights[idx]) {
        grid.fallbackHeights[idx] = topY;
      }
    }
  }
}

function visitSolidVoxel(header, grid, vx, vy, vz) {
  const res = header.voxelResolution;
  const [minX, minY, minZ] = header.gridBounds.min;
  const topY = minY + (vy + 1) * res;
  const x0 = minX + vx * res;
  const z0 = minZ + vz * res;
  const x1 = x0 + res;
  const z1 = z0 + res;
  updateHeightRect(grid, x0, z0, x1, z1, topY);
}

function fillSolidBlock(header, grid, vx0, vy0, vz0, vs) {
  const res = header.voxelResolution;
  const [minX, minY, minZ] = header.gridBounds.min;
  const x0 = minX + vx0 * res;
  const z0 = minZ + vz0 * res;
  const x1 = minX + (vx0 + vs) * res;
  const z1 = minZ + (vz0 + vs) * res;

  for (let dy = 0; dy < vs; dy++) {
    const topY = minY + (vy0 + dy + 1) * res;
    updateHeightRect(grid, x0, z0, x1, z1, topY);
  }
}

function traverseNode(header, nodes, leafData, grid, nodeIndex, depth, vx0, vy0, vz0, vs) {
  if (nodeIndex >= nodes.length) return;

  const word = nodes[nodeIndex];
  const treeDepth = header.treeDepth;

  if (isSolidLeaf(word)) {
    fillSolidBlock(header, grid, vx0, vy0, vz0, vs);
    return;
  }

  if (isMixedLeaf(word)) {
    if (depth !== treeDepth) return;
    const leafIdx = word;
    const lo = leafData[leafIdx * 2] ?? 0;
    const hi = leafData[leafIdx * 2 + 1] ?? 0;
    for (let lz = 0; lz < 4; lz++) {
      for (let ly = 0; ly < 4; ly++) {
        for (let lx = 0; lx < 4; lx++) {
          const bit = lx + (ly << 2) + (lz << 4);
          const solid = bit < 32 ? (lo >>> bit) & 1 : (hi >>> (bit - 32)) & 1;
          if (!solid) continue;
          visitSolidVoxel(header, grid, vx0 + lx, vy0 + ly, vz0 + lz);
        }
      }
    }
    return;
  }

  const childMask = word >>> 24;
  const firstChild = word & 0xffffff;
  const childVs = vs >> 1;
  let childOffset = 0;

  for (let oct = 0; oct < 8; oct++) {
    if ((childMask & (1 << oct)) === 0) continue;
    const ox = oct & 1;
    const oy = (oct >> 1) & 1;
    const oz = (oct >> 2) & 1;
    traverseNode(
      header,
      nodes,
      leafData,
      grid,
      firstChild + childOffset,
      depth + 1,
      vx0 + ox * childVs,
      vy0 + oy * childVs,
      vz0 + oz * childVs,
      childVs,
    );
    childOffset++;
  }
}

function finalizeHeights(grid) {
  let walkableCells = 0;
  let fallbackCells = 0;

  for (let i = 0; i < grid.heights.length; i++) {
    if (grid.heights[i] <= SENTINEL + 1 && grid.fallbackHeights[i] > SENTINEL + 1) {
      grid.heights[i] = grid.fallbackHeights[i];
      fallbackCells++;
    } else if (grid.heights[i] > SENTINEL + 1) {
      walkableCells++;
    }
  }

  return { walkableCells, fallbackCells };
}

function extractHeightmap(header, nodes, leafData, cellSize, bandOptions) {
  const grid = createHeightGrid(header, cellSize, bandOptions);
  const rootVs = 4 * (1 << header.treeDepth);

  if (nodes.length > 0) {
    traverseNode(header, nodes, leafData, grid, 0, 0, 0, 0, 0, rootVs);
  }

  const { walkableCells, fallbackCells } = finalizeHeights(grid);

  let filled = 0;
  for (let i = 0; i < grid.heights.length; i++) {
    if (grid.heights[i] > SENTINEL + 1) filled++;
  }

  return { grid, filled, walkableCells, fallbackCells };
}

function writeHeightmap(outJsonPath, header, grid, stats) {
  const outDir = dirname(outJsonPath);
  const binName = "heightmap.bin";
  const binPath = join(outDir, binName);

  writeFileSync(binPath, Buffer.from(grid.heights.buffer));

  const band = grid.bandOptions;
  const meta = {
    version: 1,
    coordinateSpace: "voxel-grid",
    surface: "walkable-band-max",
    walkableMaxY: grid.walkableMaxY,
    walkableBand: {
      minM: band.walkableBandMinM,
      maxM: band.walkableBandMaxM,
      fraction: band.walkableBandFraction,
      absoluteMaxY: band.walkableMaxY,
    },
    origin: [grid.originX, grid.originZ],
    cellSize: grid.cellSize,
    width: grid.width,
    depth: grid.depth,
    heights: binName,
    encoding: "float32",
    sentinel: SENTINEL,
    source: {
      voxelResolution: header.voxelResolution,
      gridBounds: header.gridBounds,
      sceneBounds: header.sceneBounds,
    },
    stats,
  };

  writeFileSync(outJsonPath, `${JSON.stringify(meta, null, 2)}\n`);
  return binPath;
}

function main() {
  const args = parseArgs(process.argv);
  const voxelPath = resolve(args.voxel);
  const outJsonPath = resolve(args.out ?? voxelPath.replace(/collision\.voxel\.json$/i, "heightmap.json"));

  const bandOptions = {
    walkableBandMinM: args.walkableBandMinM,
    walkableBandMaxM: args.walkableBandMaxM,
    walkableBandFraction: args.walkableBandFraction,
    walkableMaxY: args.walkableMaxY,
  };

  const { header, nodes, leafData } = readVoxelDataset(voxelPath);
  const { grid, filled, walkableCells, fallbackCells } = extractHeightmap(
    header,
    nodes,
    leafData,
    args.cell,
    bandOptions,
  );

  if (filled === 0) {
    console.warn(`Warning: no solid columns found in ${voxelPath}`);
  }

  const binPath = writeHeightmap(outJsonPath, header, grid, {
    filledCells: filled,
    walkableBandCells: walkableCells,
    fallbackCells,
  });
  console.log(
    `Wrote ${outJsonPath} (${grid.width}x${grid.depth} @ ${grid.cellSize}m, ${filled} filled, walkableMaxY=${grid.walkableMaxY.toFixed(2)})`,
  );
  console.log(`  ${binPath}`);
}

main();
