const DISABLED = new Set(["0", "false", "off", "no", "disable", "disabled"]);

function isDisabledValue(raw: string | null): boolean {
  if (!raw) return false;
  return DISABLED.has(raw.trim().toLowerCase());
}

type SearchParamsLike = {
  get(name: string): string | null;
};

/**
 * Parse viewer URL params for heightmap ground clamp.
 *
 * Disabled when either param is set to a falsey token:
 * `?groundClamp=0` or `?heightClamp=off`
 */
export function parseGroundClampEnabled(
  searchParams: SearchParamsLike,
): boolean {
  for (const key of ["groundClamp", "heightClamp"]) {
    const value = searchParams.get(key);
    if (value !== null && isDisabledValue(value)) return false;
  }
  return true;
}
