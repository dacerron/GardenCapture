import { resolveVoxelBinUrl } from "./resolveCollisionUrl";
import type { VoxelColliderData, VoxelColliderHeader } from "./types";

function isVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function parseHeader(raw: unknown): VoxelColliderHeader | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const gridBounds = record.gridBounds;
  if (!gridBounds || typeof gridBounds !== "object") return null;

  const grid = gridBounds as Record<string, unknown>;
  if (!isVec3(grid.min) || !isVec3(grid.max)) return null;

  const version = typeof record.version === "string" ? record.version : "";
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  if (!Number.isFinite(major) || major > 1) return null;

  const requiredNumbers = [
    "voxelResolution",
    "leafSize",
    "treeDepth",
    "numInteriorNodes",
    "numMixedLeaves",
    "nodeCount",
    "leafDataCount",
  ] as const;

  const numbers: Partial<Record<(typeof requiredNumbers)[number], number>> = {};
  for (const key of requiredNumbers) {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    numbers[key] = value;
  }

  const header: VoxelColliderHeader = {
    version,
    gridBounds: {
      min: grid.min,
      max: grid.max,
    },
    voxelResolution: numbers.voxelResolution!,
    leafSize: numbers.leafSize!,
    treeDepth: numbers.treeDepth!,
    numInteriorNodes: numbers.numInteriorNodes!,
    numMixedLeaves: numbers.numMixedLeaves!,
    nodeCount: numbers.nodeCount!,
    leafDataCount: numbers.leafDataCount!,
  };

  const sceneBounds = record.sceneBounds;
  if (sceneBounds && typeof sceneBounds === "object") {
    const scene = sceneBounds as Record<string, unknown>;
    if (isVec3(scene.min) && isVec3(scene.max)) {
      header.sceneBounds = { min: scene.min, max: scene.max };
    }
  }

  return header;
}

function splitVoxelBinary(
  buffer: ArrayBuffer,
  nodeCount: number,
  leafDataCount: number,
): { nodes: Uint32Array; leafData: Uint32Array } | null {
  const expectedBytes = (nodeCount + leafDataCount) * 4;
  if (buffer.byteLength !== expectedBytes) return null;

  const view = new Uint32Array(buffer);
  return {
    nodes: view.subarray(0, nodeCount),
    leafData: view.subarray(nodeCount),
  };
}

/**
 * Fetch and parse splat-transform voxel collision files.
 * Returns null when files are missing or invalid (caller keeps AABB fallback).
 */
export async function loadVoxelCollider(
  voxelJsonUrl: string,
): Promise<VoxelColliderData | null> {
  const jsonUrl = resolveAbsoluteAssetUrl(voxelJsonUrl);
  const binUrl = resolveAbsoluteAssetUrl(resolveVoxelBinUrl(voxelJsonUrl));

  let headerResponse: Response;
  try {
    headerResponse = await fetch(jsonUrl);
  } catch (err) {
    console.info("[ground] voxel collision fetch failed", err);
    return null;
  }

  if (!headerResponse.ok) {
    if (headerResponse.status !== 404) {
      console.warn(
        `[ground] voxel collision header ${headerResponse.status}: ${jsonUrl}`,
      );
    }
    return null;
  }

  let headerJson: unknown;
  try {
    headerJson = await headerResponse.json();
  } catch (err) {
    console.warn("[ground] voxel collision header is not JSON", err);
    return null;
  }

  const header = parseHeader(headerJson);
  if (!header) {
    console.warn("[ground] voxel collision header failed validation");
    return null;
  }

  let binResponse: Response;
  try {
    binResponse = await fetch(binUrl);
  } catch (err) {
    console.warn("[ground] voxel collision binary fetch failed", err);
    return null;
  }

  if (!binResponse.ok) {
    console.warn(
      `[ground] voxel collision binary ${binResponse.status}: ${binUrl}`,
    );
    return null;
  }

  const buffer = await binResponse.arrayBuffer();
  const binary = splitVoxelBinary(
    buffer,
    header.nodeCount,
    header.leafDataCount,
  );
  if (!binary) {
    console.warn("[ground] voxel collision binary size mismatch");
    return null;
  }

  return { header, ...binary };
}

function resolveAbsoluteAssetUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (typeof window === "undefined") return trimmed;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return new URL(path, window.location.origin).href;
}
