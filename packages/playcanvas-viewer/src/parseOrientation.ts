import { DEFAULT_ORIENTATION_X } from "./createPlayCanvasApp";

/** Parse `?orientation=` — default 180° X to match legacy `/viewer/`. */
export function parseOrientationX(value: string | null): number {
  if (value === null || value === "") return DEFAULT_ORIENTATION_X;
  const n = Number(value);
  return Number.isFinite(n) ? n : DEFAULT_ORIENTATION_X;
}
