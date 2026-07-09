/** Derive `heightmap.json` beside a streamed LOD `lod-meta.json` bundle. */
export function resolveHeightmapUrl(
  splatUrl: string,
  override?: string | null,
): string | null {
  if (override === null) return null;
  if (override?.trim()) return override.trim();

  const trimmed = splatUrl.trim();
  if (!trimmed) return null;

  const pathOnly = trimmed.split("?")[0] ?? trimmed;
  if (/heightmap\.json$/i.test(pathOnly)) return trimmed;

  const toHeightmapPath = (path: string) =>
    path.replace(/lod-meta\.json$/i, "heightmap.json");

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (/lod-meta\.json$/i.test(url.pathname)) {
        url.pathname = toHeightmapPath(url.pathname);
        return url.href;
      }
    } catch {
      // fall through to string replace
    }
  }

  if (/lod-meta\.json/i.test(pathOnly)) {
    const [pathPart, ...queryParts] = trimmed.split("?");
    const heightmapPath = toHeightmapPath(pathPart);
    return queryParts.length > 0 ? `${heightmapPath}?${queryParts.join("?")}` : heightmapPath;
  }

  if (/collision\.voxel\.json$/i.test(pathOnly)) {
    const [pathPart, ...queryParts] = trimmed.split("?");
    const heightmapPath = pathPart.replace(/collision\.voxel\.json$/i, "heightmap.json");
    return queryParts.length > 0 ? `${heightmapPath}?${queryParts.join("?")}` : heightmapPath;
  }

  return null;
}
