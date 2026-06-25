import { toNumberOrNull } from "./numbers";

export const DEFAULT_START_POS: [number, number, number] = [0, 0, 0];

/** Matches legacy Three.js `DEFAULT_ORBIT_CAMERA_OFFSET` in ThreeApp.ts */
export const START_POS_CAMERA_OFFSET: [number, number, number] = [0, 2.5, 5];

export function cameraFramingFromStartPos(
  startPos: [number, number, number] = DEFAULT_START_POS,
): {
  focus: [number, number, number];
  position: [number, number, number];
} {
  const [fx, fy, fz] = startPos;
  const [ox, oy, oz] = START_POS_CAMERA_OFFSET;
  return {
    focus: [fx, fy, fz],
    position: [fx + ox, fy + oy, fz + oz],
  };
}

export function parseStartPos(raw: unknown): [number, number, number] | null {
  if (Array.isArray(raw) && raw.length >= 3) {
    const x = toNumberOrNull(raw[0]);
    const y = toNumberOrNull(raw[1]);
    const z = toNumberOrNull(raw[2]);
    if (x !== null && y !== null && z !== null) return [x, y, z];
  }

  if (raw && typeof raw === "object") {
    const pos = raw as { x?: unknown; y?: unknown; z?: unknown };
    const x = toNumberOrNull(pos.x);
    const y = toNumberOrNull(pos.y);
    const z = toNumberOrNull(pos.z);
    if (x !== null && y !== null && z !== null) return [x, y, z];
  }

  return null;
}
