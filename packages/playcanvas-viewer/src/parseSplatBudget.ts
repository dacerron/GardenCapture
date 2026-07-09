type SearchParamsLike = {
  get(name: string): string | null;
};

/**
 * Optional viewer URL override for the global splat budget (millions of Gaussians).
 *
 * - `?budget=0` — disable budget cap (distance-based LOD only; PlayCanvas default)
 * - `?budget=5` — explicit cap of 5M splats
 *
 * When set, the Quality preset no longer changes the budget for that session.
 */
export function parseSplatBudgetOverrideM(
  searchParams: SearchParamsLike,
): number | undefined {
  const raw = searchParams.get("budget")?.trim();
  if (!raw) return undefined;

  const lower = raw.toLowerCase();
  if (lower === "0" || lower === "off" || lower === "none" || lower === "unlimited") {
    return 0;
  }

  const parsed = Number.parseFloat(raw.replace(/m$/i, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * Lock streamed LOD to a single detail level for debugging.
 *
 * - `?lod=0` — finest level only (no decimated LOD1/LOD2)
 */
export function parseSplatLodLock(
  searchParams: SearchParamsLike,
): number | undefined {
  const raw = searchParams.get("lod")?.trim();
  if (!raw) return undefined;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}
