/** Derive `collision.voxel.json` beside a streamed LOD `lod-meta.json` bundle. */
export function resolveCollisionUrl(
  splatUrl: string,
  override?: string | null,
): string | null {
  if (override !== undefined) {
    const trimmed = override?.trim() ?? "";
    return trimmed || null;
  }

  const trimmed = splatUrl.trim();
  if (!/lod-meta\.json$/i.test(trimmed)) return null;
  return trimmed.replace(/lod-meta\.json$/i, "collision.voxel.json");
}

/** Binary octree file paired with a `*.voxel.json` header. */
export function resolveVoxelBinUrl(voxelJsonUrl: string): string {
  return voxelJsonUrl.replace(/\.voxel\.json$/i, ".voxel.bin");
}
