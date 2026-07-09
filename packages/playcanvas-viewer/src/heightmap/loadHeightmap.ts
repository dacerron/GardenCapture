import type { HeightmapData, HeightmapMeta } from "./types";

function resolveBinaryUrl(jsonUrl: string, heightsFile: string): string {
  if (/^https?:\/\//i.test(jsonUrl)) {
    const base = jsonUrl.replace(/[^/]+$/, "");
    return `${base}${heightsFile}`;
  }
  const dir = jsonUrl.replace(/[^/]+$/, "");
  return `${dir}${heightsFile}`;
}

function parseHeightmapMeta(raw: unknown): HeightmapMeta {
  if (!raw || typeof raw !== "object") {
    throw new Error("heightmap.json: expected object");
  }
  const meta = raw as Record<string, unknown>;
  const version = Number(meta.version);
  const origin = meta.origin;
  const cellSize = Number(meta.cellSize);
  const width = Number(meta.width);
  const depth = Number(meta.depth);
  const heights = meta.heights;
  const encoding = meta.encoding;
  const sentinel = Number(meta.sentinel);

  if (version !== 1) throw new Error(`heightmap.json: unsupported version ${meta.version}`);
  if (
    !Array.isArray(origin) ||
    origin.length !== 2 ||
    typeof origin[0] !== "number" ||
    typeof origin[1] !== "number"
  ) {
    throw new Error("heightmap.json: invalid origin");
  }
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error("heightmap.json: invalid cellSize");
  }
  if (!Number.isInteger(width) || !Number.isInteger(depth) || width < 1 || depth < 1) {
    throw new Error("heightmap.json: invalid width/depth");
  }
  if (typeof heights !== "string" || !heights.trim()) {
    throw new Error("heightmap.json: invalid heights filename");
  }
  if (encoding !== "float32") {
    throw new Error(`heightmap.json: unsupported encoding ${String(encoding)}`);
  }
  if (!Number.isFinite(sentinel)) {
    throw new Error("heightmap.json: invalid sentinel");
  }

  const coordinateSpace = meta.coordinateSpace;
  if (
    coordinateSpace !== undefined &&
    coordinateSpace !== "splat-local" &&
    coordinateSpace !== "voxel-grid"
  ) {
    throw new Error(`heightmap.json: invalid coordinateSpace ${String(coordinateSpace)}`);
  }

  return {
    version,
    coordinateSpace: coordinateSpace as HeightmapMeta["coordinateSpace"],
    origin: [origin[0], origin[1]],
    cellSize,
    width,
    depth,
    heights,
    encoding: "float32",
    sentinel,
  };
}

export async function loadHeightmap(jsonUrl: string): Promise<HeightmapData> {
  let headerResponse: Response;
  try {
    headerResponse = await fetch(jsonUrl);
  } catch (err) {
    throw new Error(`heightmap fetch failed: ${jsonUrl}`, { cause: err });
  }

  if (!headerResponse.ok) {
    throw new Error(`heightmap ${headerResponse.status}: ${jsonUrl}`);
  }

  const raw = await headerResponse.json();
  const meta = parseHeightmapMeta(raw);
  const binUrl = resolveBinaryUrl(jsonUrl, meta.heights);

  let binResponse: Response;
  try {
    binResponse = await fetch(binUrl);
  } catch (err) {
    throw new Error(`heightmap binary fetch failed: ${binUrl}`, { cause: err });
  }

  if (!binResponse.ok) {
    throw new Error(`heightmap binary ${binResponse.status}: ${binUrl}`);
  }

  const buffer = await binResponse.arrayBuffer();
  const expectedBytes = meta.width * meta.depth * 4;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `heightmap binary size mismatch: expected ${expectedBytes}, got ${buffer.byteLength}`,
    );
  }

  return {
    meta,
    heights: new Float32Array(buffer),
  };
}
